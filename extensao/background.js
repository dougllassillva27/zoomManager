/**
 * Native Zoom Manager - Service Worker
 * Gerencia persistência de zoom por hostname e comandos de teclado.
 */

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5.0;
const ZOOM_DEFAULT = 1.0;
const DEFAULT_ZOOM_KEY = '__defaultZoom';

// --- Supabase Config (Dinâmica) ---
const SUPABASE_URL_KEY = '__supabaseUrl';
const SUPABASE_KEY_KEY = '__supabaseKey';

/**
 * Lê credenciais Supabase do chrome.storage.local.
 * @returns {Promise<{url: string, key: string}|null>} Config ou null se não configurado
 */
async function getSupabaseConfig() {
  const result = await chrome.storage.local.get([SUPABASE_URL_KEY, SUPABASE_KEY_KEY]);
  const url = result[SUPABASE_URL_KEY];
  const key = result[SUPABASE_KEY_KEY];
  if (!url || !key) return null;
  return { url, key };
}

/**
 * Encapsula fetch para Supabase REST API com headers obrigatórios.
 * Lê credenciais dinamicamente do storage. Retorna NOT_CONFIGURED se ausentes.
 * @param {string} endpoint - Path da API (ex: '/rest/v1/zoom_settings')
 * @param {object} options - Opções do fetch (method, body, headers extras)
 * @returns {Promise<{data: any, error: string|null}>}
 */
async function supabaseRequest(endpoint, options = {}) {
  const config = await getSupabaseConfig();
  if (!config) {
    return { data: null, error: 'NOT_CONFIGURED' };
  }

  try {
    const response = await fetch(`${config.url}${endpoint}`, {
      ...options,
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[Supabase] HTTP ${response.status}: ${errBody}`);
      return { data: null, error: `HTTP ${response.status}` };
    }

    // 204 No Content ou corpo vazio: retorna sucesso sem dados
    const contentLength = response.headers.get('content-length');
    if (response.status === 204 || contentLength === '0') {
      return { data: null, error: null };
    }

    try {
      const data = await response.json();
      return { data, error: null };
    } catch {
      // Resposta não-JSON mas status OK: trata como sucesso sem dados
      return { data: null, error: null };
    }
  } catch (err) {
    console.error('[Supabase] Network error:', err);
    return { data: null, error: 'OFFLINE' };
  }
}

/**
 * Comprime objeto JSON para base64 usando Compression Streams API nativa.
 * @param {object} obj - Objeto a comprimir
 * @returns {Promise<string>} String base64 comprimida
 */
async function compressToBase64(obj) {
  const jsonStr = JSON.stringify(obj);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(jsonStr);
  const stream = new Blob([encoded]).stream().pipeThrough(new CompressionStream('gzip'));
  const compressed = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(compressed);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Descomprime string base64 gzip para objeto JSON usando Decompression Streams API nativa.
 * @param {string} base64Str - String base64 comprimida
 * @returns {Promise<object>} Objeto descomprimido
 */
async function decompressFromBase64(base64Str) {
  const binary = atob(base64Str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const decompressed = await new Response(stream).text();
  return JSON.parse(decompressed);
}

/**
 * Extrai hostname de uma URL para usar como chave de storage.
 * @param {string} url
 * @returns {string} hostname ou string vazia
 */
function getZoomKey(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Aplica clamp no valor de zoom dentro dos limites permitidos.
 * @param {number} level
 * @returns {number}
 */
function clampZoom(level) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(level * 100) / 100));
}

// --- Message Passing ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    switch (message.type) {
      case 'GET_ZOOM': {
        const key = message.hostname;
        if (!key) return ZOOM_DEFAULT;
        const result = await chrome.storage.sync.get(key);
        return result[key] ?? ZOOM_DEFAULT;
      }

      case 'SAVE_ZOOM': {
        const { hostname, level } = message;
        if (!hostname) return false;
        const clamped = clampZoom(level);
        await chrome.storage.sync.set({ [hostname]: clamped });
        return clamped;
      }

      case 'RESET_ZOOM': {
        const { hostname } = message;
        if (!hostname) return false;
        // Lê zoom padrão customizado
        const defResult = await chrome.storage.sync.get(DEFAULT_ZOOM_KEY);
        const defaultLevel = defResult[DEFAULT_ZOOM_KEY] ?? ZOOM_DEFAULT;
        // Remove zoom específico do domínio (volta ao default)
        await chrome.storage.sync.remove(hostname);
        return defaultLevel;
      }

      case 'APPLY_ZOOM': {
        // Usado pelo content script para aplicar zoom na aba ativa
        const { tabId, level } = message;
        const targetTabId = tabId ?? sender.tab?.id;
        if (targetTabId == null) return false;
        await chrome.tabs.setZoom(targetTabId, clampZoom(level));
        return true;
      }

      case 'GET_CURRENT_ZOOM': {
        const { tabId } = message;
        if (tabId == null) return ZOOM_DEFAULT;
        try {
          return await chrome.tabs.getZoom(tabId);
        } catch {
          return ZOOM_DEFAULT;
        }
      }

      case 'GET_PRESETS': {
        const result = await chrome.storage.sync.get('__zoomPresets');
        return result['__zoomPresets'] ?? [];
      }

      case 'SAVE_PRESETS': {
        const { presets } = message;
        if (!Array.isArray(presets)) return false;
        // Validação: max 8 presets, label ≤20 chars, level 25-500%
        const validated = presets.slice(0, 8).map(p => ({
          label: String(p.label || '').slice(0, 20),
          level: Math.min(500, Math.max(25, Math.round((p.level ?? 100) / 2) * 2))
        }));
        await chrome.storage.sync.set({ '__zoomPresets': validated });
        return validated;
      }

      case 'APPLY_PRESET': {
        const { level: presetLevel, tabId: presetTabId } = message;
        const targetId = presetTabId ?? sender.tab?.id;
        if (targetId == null || presetLevel == null) return false;
        const clamped = clampZoom(presetLevel / 100);
        await chrome.tabs.setZoom(targetId, clamped);
        return true;
      }

      case 'SYNC_PUSH': {
        const pushConfig = await getSupabaseConfig();
        if (!pushConfig) {
          return { success: false, error: 'NOT_CONFIGURED', timestamp: new Date().toISOString() };
        }
        try {
          // Lê todos os dados locais
          const allData = await chrome.storage.sync.get(null);
          const zoomSettings = {};
          const presets = allData['__zoomPresets'] ?? [];
          const defaultZoom = allData['__defaultZoom'] ?? ZOOM_DEFAULT;

          // Extrai apenas entradas de zoom (exclui chaves especiais)
          for (const [key, value] of Object.entries(allData)) {
            if (!key.startsWith('__') && typeof value === 'number') {
              zoomSettings[key] = value;
            }
          }

          // Push zoom_settings
          const zoomEntries = Object.entries(zoomSettings).map(([hostname, zoom_level]) => ({
            hostname,
            zoom_level,
            updated_at: new Date().toISOString()
          }));

          if (zoomEntries.length > 0) {
            const zoomResult = await supabaseRequest('/rest/v1/zoom_settings?on_conflict=hostname', {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify(zoomEntries)
            });
            if (zoomResult.error) {
              console.error('[Supabase] SYNC_PUSH zoom_settings error:', zoomResult.error);
              return { success: false, error: zoomResult.error, timestamp: new Date().toISOString() };
            }
          }

          // Push presets (dedup por label+level antes do envio)
          if (presets.length > 0) {
            const seen = new Set();
            const uniquePresets = presets.filter(p => {
              const key = `${p.label}|${p.level}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            const presetEntries = uniquePresets.map((p, i) => ({
              label: p.label,
              level: p.level,
              sort_order: i,
              updated_at: new Date().toISOString()
            }));
            const presetResult = await supabaseRequest('/rest/v1/presets?on_conflict=label,level', {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify(presetEntries)
            });
            if (presetResult.error) {
              console.error('[Supabase] SYNC_PUSH presets error:', presetResult.error);
              return { success: false, error: presetResult.error, timestamp: new Date().toISOString() };
            }
          }

          // Push smart_zoom_profiles
          const smartProfiles = allData['__smartZoomProfiles'] ?? [];
          if (smartProfiles.length > 0) {
            const smartEntries = smartProfiles.map((p, i) => ({
              resolution_width: p.resolution_width,
              resolution_height: p.resolution_height,
              zoom_level: p.zoom_level,
              sort_order: i,
              updated_at: new Date().toISOString()
            }));
            const smartResult = await supabaseRequest('/rest/v1/smart_zoom_profiles', {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify(smartEntries)
            });
            if (smartResult.error) {
              console.error('[Supabase] SYNC_PUSH smart_zoom_profiles error:', smartResult.error);
              return { success: false, error: smartResult.error, timestamp: new Date().toISOString() };
            }
          }

          return { success: true, timestamp: new Date().toISOString() };
        } catch (err) {
          console.error('[Supabase] SYNC_PUSH error:', err);
          return { success: false, error: 'OFFLINE', timestamp: new Date().toISOString() };
        }
      }

      case 'GET_SMART_PROFILES': {
        const result = await chrome.storage.sync.get('__smartZoomProfiles');
        const profiles = result['__smartZoomProfiles'] ?? [];
        // Se vazio, retorna default Full HD 74%
        if (profiles.length === 0) {
          return [{ resolution_width: 1920, resolution_height: 1080, zoom_level: 0.74 }];
        }
        return profiles;
      }

      case 'SAVE_SMART_PROFILES': {
        const { profiles } = message;
        if (!Array.isArray(profiles)) return false;
        // Validação: max 20 perfis, zoom 0.25-5.0, width/height > 0
        const validated = profiles.slice(0, 20).map((p, i) => ({
          resolution_width: Math.max(1, Math.round(p.resolution_width || 1920)),
          resolution_height: Math.max(1, Math.round(p.resolution_height || 1080)),
          zoom_level: clampZoom(p.zoom_level || 1.0),
          sort_order: i
        }));
        await chrome.storage.sync.set({ '__smartZoomProfiles': validated });
        return validated;
      }

      case 'DELETE_SMART_PROFILE': {
        const { index } = message;
        if (typeof index !== 'number') return false;
        const result = await chrome.storage.sync.get('__smartZoomProfiles');
        const profiles = result['__smartZoomProfiles'] ?? [];
        if (index < 0 || index >= profiles.length) return false;
        profiles.splice(index, 1);
        // Reordena sort_order
        profiles.forEach((p, i) => { p.sort_order = i; });
        await chrome.storage.sync.set({ '__smartZoomProfiles': profiles });
        return profiles;
      }

      case 'APPLY_SMART_ZOOM': {
        const { width, height, tabId } = message;
        const targetTabId = tabId ?? sender.tab?.id;
        if (targetTabId == null || !width || !height) return { applied: false };
        // Busca perfis
        const szResult = await chrome.storage.sync.get('__smartZoomProfiles');
        let profiles = szResult['__smartZoomProfiles'] ?? [];
        if (profiles.length === 0) {
          profiles = [{ resolution_width: 1920, resolution_height: 1080, zoom_level: 0.74 }];
        }
        // Match exato por resolução
        const match = profiles.find(p => p.resolution_width === width && p.resolution_height === height);
        if (!match) return { applied: false };
        // Aplica zoom
        await chrome.tabs.setZoom(targetTabId, clampZoom(match.zoom_level));
        // Salva no domínio para persistir com F5
        if (sender.tab?.url) {
          const hostname = getZoomKey(sender.tab.url);
          if (hostname) {
            await chrome.storage.sync.set({ [hostname]: clampZoom(match.zoom_level) });
          }
        }
        return { applied: true, level: match.zoom_level };
      }

      case 'SAVE_SUPABASE_CONFIG': {
        const { url, key } = message;
        if (!url || !key || typeof url !== 'string' || typeof key !== 'string') {
          return { success: false, error: 'URL e Key são obrigatórios' };
        }
        await chrome.storage.local.set({
          [SUPABASE_URL_KEY]: url.replace(/\/+$/, ''), // remove trailing slash
          [SUPABASE_KEY_KEY]: key.trim()
        });
        return { success: true };
      }

      case 'GET_SUPABASE_CONFIG': {
        const config = await getSupabaseConfig();
        if (!config) return { configured: false };
        // Mascara key para segurança na UI (mostra primeiros 8 + últimos 4 chars)
        const maskedKey = config.key.length > 12
          ? config.key.slice(0, 8) + '...' + config.key.slice(-4)
          : '****';
        return { configured: true, url: config.url, maskedKey };
      }

      case 'CLEAR_SUPABASE_CONFIG': {
        await chrome.storage.local.remove([SUPABASE_URL_KEY, SUPABASE_KEY_KEY]);
        return { success: true };
      }

      case 'TEST_SUPABASE': {
        const testResult = await supabaseRequest('/rest/v1/zoom_settings?select=id&limit=1');
        if (testResult.error === 'NOT_CONFIGURED') {
          return { success: false, error: 'Supabase não configurado' };
        }
        if (testResult.error) {
          return { success: false, error: testResult.error };
        }
        return { success: true };
      }

      case 'EXPORT_DATA': {
        try {
          const allData = await chrome.storage.sync.get(null);
          const base64 = await compressToBase64(allData);
          return { success: true, data: base64 };
        } catch (err) {
          console.error('[Export] Error:', err);
          return { success: false, error: 'Export failed' };
        }
      }

      case 'IMPORT_DATA': {
        try {
          const { base64 } = message;
          if (!base64 || typeof base64 !== 'string') {
            return { success: false, error: 'Invalid data format' };
          }
          const data = await decompressFromBase64(base64);
          if (typeof data !== 'object' || data === null) {
            return { success: false, error: 'Invalid data structure' };
          }
          await chrome.storage.sync.set(data);
          // Reconstrói context menu se presets mudaram
          buildContextMenu();
          return { success: true };
        } catch (err) {
          console.error('[Import] Error:', err);
          return { success: false, error: 'Import failed: invalid or corrupted data' };
        }
      }

      case 'SYNC_PULL': {
        const pullConfig = await getSupabaseConfig();
        if (!pullConfig) {
          return { success: false, error: 'NOT_CONFIGURED', timestamp: new Date().toISOString() };
        }
        try {
          // Pull zoom_settings
          const zoomResult = await supabaseRequest('/rest/v1/zoom_settings?select=hostname,zoom_level');
          if (zoomResult.error) {
            console.error('[Supabase] SYNC_PULL zoom_settings error:', zoomResult.error);
            return { success: false, error: zoomResult.error, timestamp: new Date().toISOString() };
          }

          // Pull presets
          const presetResult = await supabaseRequest('/rest/v1/presets?select=label,level,sort_order&order=sort_order.asc');
          if (presetResult.error) {
            console.error('[Supabase] SYNC_PULL presets error:', presetResult.error);
            return { success: false, error: presetResult.error, timestamp: new Date().toISOString() };
          }

          // Merge remoto para storage local
          const updates = {};
          if (zoomResult.data && zoomResult.data.length > 0) {
            for (const entry of zoomResult.data) {
              updates[entry.hostname] = entry.zoom_level;
            }
          }

          if (presetResult.data && presetResult.data.length > 0) {
            const seenPull = new Set();
            updates['__zoomPresets'] = presetResult.data
              .map(p => ({ label: p.label, level: p.level }))
              .filter(p => {
                const key = `${p.label}|${p.level}`;
                if (seenPull.has(key)) return false;
                seenPull.add(key);
                return true;
              });
          }

          // Pull smart_zoom_profiles
          const smartResult = await supabaseRequest('/rest/v1/smart_zoom_profiles?select=resolution_width,resolution_height,zoom_level,sort_order&order=sort_order.asc');
          if (smartResult.error) {
            console.error('[Supabase] SYNC_PULL smart_zoom_profiles error:', smartResult.error);
            return { success: false, error: smartResult.error, timestamp: new Date().toISOString() };
          }
          if (smartResult.data && smartResult.data.length > 0) {
            updates['__smartZoomProfiles'] = smartResult.data.map(p => ({
              resolution_width: p.resolution_width,
              resolution_height: p.resolution_height,
              zoom_level: p.zoom_level,
              sort_order: p.sort_order
            }));
          }

          if (Object.keys(updates).length > 0) {
            await chrome.storage.sync.set(updates);
          }

          return { success: true, timestamp: new Date().toISOString() };
        } catch (err) {
          console.error('[Supabase] SYNC_PULL error:', err);
          return { success: false, error: 'OFFLINE', timestamp: new Date().toISOString() };
        }
      }

      default:
        return null;
    }
  };

  handler()
    .then((result) => sendResponse(result))
    .catch((err) => {
      console.error('[ZoomManager] Message handler error:', err);
      sendResponse(null);
    });

  // Retorna true para indicar resposta assíncrona
  return true;
});

// --- Context Menu ---
async function buildContextMenu() {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: 'zoom-options',
    title: 'Opções',
    contexts: ['page'],
    documentUrlPatterns: ['http://*/*', 'https://*/*']
  });

  // Presets diretamente no menu principal (abaixo de Opções)
  const result = await chrome.storage.sync.get('__zoomPresets');
  const presets = result['__zoomPresets'] ?? [];
  presets.forEach((preset, index) => {
    chrome.contextMenus.create({
      id: `preset-${index}`,
      title: `${preset.label} (${preset.level}%)`,
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });
  });

  // Separador antes do reset (apenas se houver presets)
  if (presets.length > 0) {
    chrome.contextMenus.create({
      id: 'zoom-separator',
      type: 'separator',
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });
  }

  // Resetar Zoom sempre como último item
  chrome.contextMenus.create({
    id: 'zoom-reset',
    title: 'Resetar Zoom',
    contexts: ['page'],
    documentUrlPatterns: ['http://*/*', 'https://*/*']
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  buildContextMenu();
  // Cria alarm para auto-sync a cada 60 minutos
  chrome.alarms.create('supabase-sync', { periodInMinutes: 60 });
  // Pull inicial: puxa configs do Supabase na primeira instalação
  try {
    const zoomResult = await supabaseRequest('/rest/v1/zoom_settings?select=hostname,zoom_level');
    const presetResult = await supabaseRequest('/rest/v1/presets?select=label,level,sort_order&order=sort_order.asc');
    const updates = {};
    if (zoomResult.data && zoomResult.data.length > 0) {
      for (const entry of zoomResult.data) {
        updates[entry.hostname] = entry.zoom_level;
      }
    }
    if (presetResult.data && presetResult.data.length > 0) {
      const seenInstall = new Set();
      updates['__zoomPresets'] = presetResult.data
        .map(p => ({ label: p.label, level: p.level }))
        .filter(p => {
          const key = `${p.label}|${p.level}`;
          if (seenInstall.has(key)) return false;
          seenInstall.add(key);
          return true;
        });
    }
    if (Object.keys(updates).length > 0) {
      await chrome.storage.sync.set(updates);
      console.log('[Supabase] Initial pull completed on install');
    }
  } catch (err) {
    console.error('[Supabase] Initial pull failed:', err);
  }
});

// Auto-sync silencioso via alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'supabase-sync') return;
  const alarmConfig = await getSupabaseConfig();
  if (!alarmConfig) {
    console.log('[Supabase] Auto-sync skipped: not configured');
    return;
  }
  try {
    const allData = await chrome.storage.sync.get(null);
    const zoomSettings = {};
    const presets = allData['__zoomPresets'] ?? [];

    for (const [key, value] of Object.entries(allData)) {
      if (!key.startsWith('__') && typeof value === 'number') {
        zoomSettings[key] = value;
      }
    }

    const zoomEntries = Object.entries(zoomSettings).map(([hostname, zoom_level]) => ({
      hostname,
      zoom_level,
      updated_at: new Date().toISOString()
    }));

    if (zoomEntries.length > 0) {
      await supabaseRequest('/rest/v1/zoom_settings', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(zoomEntries)
      });
    }

    if (presets.length > 0) {
      const seenAlarm = new Set();
      const uniqueAlarmPresets = presets.filter(p => {
        const key = `${p.label}|${p.level}`;
        if (seenAlarm.has(key)) return false;
        seenAlarm.add(key);
        return true;
      });
      const presetEntries = uniqueAlarmPresets.map((p, i) => ({
        label: p.label,
        level: p.level,
        sort_order: i,
        updated_at: new Date().toISOString()
      }));
      await supabaseRequest('/rest/v1/presets', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(presetEntries)
      });
    }

    // Auto-sync smart_zoom_profiles
    const smartProfiles = allData['__smartZoomProfiles'] ?? [];
    if (smartProfiles.length > 0) {
      const smartEntries = smartProfiles.map((p, i) => ({
        resolution_width: p.resolution_width,
        resolution_height: p.resolution_height,
        zoom_level: p.zoom_level,
        sort_order: i,
        updated_at: new Date().toISOString()
      }));
      await supabaseRequest('/rest/v1/smart_zoom_profiles', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(smartEntries)
      });
    }

    console.log('[Supabase] Auto-sync completed at', new Date().toISOString());
  } catch (err) {
    console.error('[Supabase] Auto-sync failed:', err);
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes['__zoomPresets']) {
    buildContextMenu();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'zoom-options') {
    chrome.runtime.openOptionsPage();
  } else if (info.menuItemId === 'zoom-reset') {
    const hostname = getZoomKey(tab.url || '');
    if (!hostname) return;
    const defResult = await chrome.storage.sync.get(DEFAULT_ZOOM_KEY);
    const defaultLevel = defResult[DEFAULT_ZOOM_KEY] ?? ZOOM_DEFAULT;
    // Remove PRIMEIRO para evitar race condition com tabs.onUpdated
    await chrome.storage.sync.remove(hostname);
    await chrome.tabs.setZoom(tab.id, clampZoom(defaultLevel));
  } else if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith('preset-')) {
    const index = parseInt(info.menuItemId.replace('preset-', ''), 10);
    const result = await chrome.storage.sync.get('__zoomPresets');
    const presets = result['__zoomPresets'] ?? [];
    if (presets[index]) {
      const clamped = clampZoom(presets[index].level / 100);
      await chrome.tabs.setZoom(tab.id, clamped);
    }
  }
});

// --- Commands (Alt+Shift+R para reset) ---
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'reset_zoom') return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) return;

    const hostname = getZoomKey(tab.url);
    if (!hostname) return;

    // Lê zoom padrão customizado
    const defResult = await chrome.storage.sync.get(DEFAULT_ZOOM_KEY);
    const defaultLevel = defResult[DEFAULT_ZOOM_KEY] ?? ZOOM_DEFAULT;
    // Remove PRIMEIRO para evitar race condition com tabs.onUpdated
    await chrome.storage.sync.remove(hostname);
    await chrome.tabs.setZoom(tab.id, clampZoom(defaultLevel));

    console.log(`[ZoomManager] Reset zoom for ${hostname} → ${clampZoom(defaultLevel)}`);
  } catch (err) {
    console.error('[ZoomManager] Reset command error:', err);
  }
});

// --- Restaurar zoom ao navegar ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Apenas quando a página termina de carregar e tem URL válida
  if (changeInfo.status !== 'complete' || !tab.url) return;

  const hostname = getZoomKey(tab.url);
  if (!hostname) return;

  try {
    const result = await chrome.storage.sync.get(hostname);
    const savedZoom = result[hostname];

    if (savedZoom != null && savedZoom !== ZOOM_DEFAULT) {
      await chrome.tabs.setZoom(tabId, savedZoom);
    }
  } catch (err) {
    // Ignora erros em páginas restritas (chrome://, edge://, etc.)
    if (!err.message?.includes('Cannot access')) {
      console.error(`[ZoomManager] Restore zoom error for ${hostname}:`, err);
    }
  }
});
