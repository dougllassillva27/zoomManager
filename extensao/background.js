/**
 * Native Zoom Manager - Service Worker
 * Gerencia persistência de zoom por hostname e comandos de teclado.
 */

// Desativação por site (estado de sessão): getRootDomain, isSiteDisabled, etc.
importScripts('disabledSites.js');
// Regras de URL (matching puro, compartilhado com a options page)
importScripts('urlRules.js');

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5.0;
const ZOOM_DEFAULT = 1.0;
const DEFAULT_ZOOM_KEY = '__defaultZoom';

// --- Debug Logs ---
const DEBUG_LOGS_KEY = '__debugLogs';
let debugLogsEnabled = false;

/**
 * Log condicional: só imprime quando o toggle de debug está ativo.
 * @param {...any} args - Argumentos para console.log
 */
function debugLog(...args) {
  if (debugLogsEnabled) {
    console.log('[ZoomDebug]', ...args);
  }
}

// Carrega estado do debug no startup
chrome.storage.sync.get(DEBUG_LOGS_KEY).then(result => {
  debugLogsEnabled = result[DEBUG_LOGS_KEY] ?? false;
});

// Escuta mudanças no storage para invalidar cache e atualizar estado
chrome.storage.onChanged.addListener((changes) => {
  if (changes[DEBUG_LOGS_KEY]) {
    debugLogsEnabled = changes[DEBUG_LOGS_KEY].newValue ?? false;
    console.log('[ZoomManager] Debug logs:', debugLogsEnabled ? 'ATIVADOS' : 'DESATIVADOS');
  }
  // Invalida cache de regras URL quando __urlRules é alterado externamente (Options Page, sync)
  if (changes['__urlRules']) {
    urlRulesCache = null;
    debugLog('Cache de regras URL invalidado por mudança externa');
  }
});

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

// --- URL Pattern Matching (via urlRules.js) ---
const URL_RULES_KEY = '__urlRules';

/** Cache em memória das regras para evitar leitura assíncrona repetida */
let urlRulesCache = null;


/**
 * Carrega regras URL do storage para o cache em memória.
 * @returns {Promise<Array<{pattern: string, level: number, specificity: number}>>}
 */
async function loadUrlRules() {
  const result = await chrome.storage.sync.get(URL_RULES_KEY);
  urlRulesCache = result[URL_RULES_KEY] ?? [];
  return urlRulesCache;
}

/**
 * Resolve a regra aplicável a URL, carregando o cache se necessário.
 * @param {string} url
 * @returns {Promise<{pattern: string, level: number, specificity: number}|null>}
 */
async function resolveRule(url) {
  if (!urlRulesCache) await loadUrlRules();
  return matchUrl(url, urlRulesCache);
}

/** Limite por item do chrome.storage.sync, com folga para a chave */
const SYNC_ITEM_QUOTA = 8192;
const SYNC_QUOTA_HEADROOM = 256;

/**
 * Grava o array de regras no storage.sync, validando a quota por item.
 * Sem tocar em storage.sync não há como detectar o estouro, e um set
 * rejeitado perderia a gravação inteira sem aviso.
 * @param {Array} rules
 * @returns {Promise<boolean>} true se gravou
 */
async function saveUrlRules(rules) {
  const serialized = JSON.stringify({ [URL_RULES_KEY]: rules });
  const bytes = new TextEncoder().encode(serialized).length;

  if (bytes > SYNC_ITEM_QUOTA - SYNC_QUOTA_HEADROOM) {
    console.error(
      `[ZoomManager] __urlRules excede a cota do sync: ${bytes} bytes (limite ${SYNC_ITEM_QUOTA}). ` +
      `Regras: ${rules.length}. Remova regras na Options Page.`
    );
    return false;
  }

  try {
    await chrome.storage.sync.set({ [URL_RULES_KEY]: rules });
    return true;
  } catch (err) {
    console.error('[ZoomManager] Falha ao gravar __urlRules:', err);
    return false;
  }
}

/**
 * Indica se uma regra deve ser enviada ao Supabase.
 * Regras de chrome://, chrome-extension:// e file:// são locais da máquina:
 * a própria página de opções gera uma ao ajustar o zoom nela.
 * @param {{pattern: string}} rule
 * @returns {boolean}
 */
function isSyncableRule(rule) {
  if (!rule?.pattern) return false;
  return !(
    rule.pattern.startsWith('chrome-extension://') ||
    rule.pattern.startsWith('chrome://') ||
    rule.pattern.startsWith('file://')
  );
}

/**
 * Mescla regras vindas do Supabase com as locais, sem sobrescrever.
 * Sobrescrever o array inteiro apagava regras criadas aqui quando a nuvem
 * estava desatualizada. A regra local vence em caso de mesmo padrão.
 * @param {Array<{pattern: string, zoom_level: number, specificity: number}>} remoteRules
 * @returns {Promise<Array>} array mesclado
 */
async function mergePulledRules(remoteRules) {
  if (!Array.isArray(remoteRules) || remoteRules.length === 0) {
    return urlRulesCache ?? [];
  }
  if (!urlRulesCache) await loadUrlRules();

  const byPattern = new Map(urlRulesCache.map(r => [r.pattern, r]));
  for (const r of remoteRules) {
    if (!r?.pattern || byPattern.has(r.pattern)) continue;
    byPattern.set(r.pattern, {
      pattern: r.pattern,
      level: Number(r.zoom_level),
      specificity: Number(r.specificity)
    });
  }
  return [...byPattern.values()];
}

/**
 * Remove a regra que se aplica a URL e devolve o zoom padrão.
 *
 * Remove pelo padrão exato da regra que casou, não por `hostname/*`: uma
 * regra de path (ex: site.com/artigos/**) também é um ajuste daquele site
 * e precisa sair no reset, senão continua sendo aplicada.
 *
 * @param {string} url
 * @returns {Promise<number>} nível padrão a aplicar
 */
async function resetZoomForUrl(url) {
  const defResult = await chrome.storage.sync.get(DEFAULT_ZOOM_KEY);
  const defaultLevel = defResult[DEFAULT_ZOOM_KEY] ?? ZOOM_DEFAULT;

  if (!urlRulesCache) await loadUrlRules();

  const matched = matchUrl(url, urlRulesCache);
  if (matched) {
    const index = urlRulesCache.findIndex(r => r.pattern === matched.pattern);
    if (index >= 0) {
      urlRulesCache.splice(index, 1);
      await saveUrlRules(urlRulesCache);
    }
  }

  // Fallback: remove chave legacy se existir
  const hostname = getZoomKey(url);
  if (hostname) {
    await chrome.storage.sync.remove(hostname);
  }

  return defaultLevel;
}


/**
 * Remove as chaves legadas "hostname": number do storage.sync.
 *
 * O modelo antigo gravava um item por site, o que enche a cota de itens do
 * chrome.storage.sync (limite de 512). O modelo atual guarda tudo em
 * __urlRules (um item só). As chaves antigas nao sao convertidas em regras:
 * eram efeito colateral de ajuste manual, nao curadoria.
 *
 * Roda uma vez, e de novo se as chaves reaparecerem via pull do Supabase.
 * @returns {Promise<number>} quantidade de chaves removidas
 */
async function removeLegacyHostKeys() {
  const allData = await chrome.storage.sync.get(null);
  const keysToRemove = Object.keys(allData).filter(
    (key) => !key.startsWith('__') && typeof allData[key] === 'number'
  );
  if (keysToRemove.length === 0) return 0;

  // Remove em lotes para não estourar o limite de operações por chamada
  const CHUNK = 100;
  for (let i = 0; i < keysToRemove.length; i += CHUNK) {
    await chrome.storage.sync.remove(keysToRemove.slice(i, i + CHUNK));
  }
  console.log(`[ZoomManager] ${keysToRemove.length} chaves legadas por hostname removidas`);
  return keysToRemove.length;
}

/**
 * Limpeza de dados legados no startup do service worker.
 * Remove as chaves "hostname": number que enchem a cota de itens do sync.
 * Não converte em regras: ajuste manual de zoom não é curadoria de URL.
 */
async function cleanupLegacyData() {
  try {
    await removeLegacyHostKeys();
  } catch (err) {
    console.error('[ZoomManager] Falha na limpeza de chaves legadas:', err);
  }
  await loadUrlRules();
}

// Executa limpeza no startup do service worker
cleanupLegacyData();

// --- Message Passing ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    switch (message.type) {
      case 'GET_ZOOM': {
        // Ordem de prioridade: Regra URL com override > Smart Zoom > Regra URL > Zoom padrão
        const url = message.url || message.hostname;
        debugLog('GET_ZOOM:', { url, width: message.width, height: message.height });
        if (!url) return ZOOM_DEFAULT;

        const matchedRule = await resolveRule(url);
        debugLog('GET_ZOOM regra encontrada:', matchedRule);

        // 1. Regra com overrideSmartZoom tem prioridade máxima
        if (matchedRule && matchedRule.overrideSmartZoom) {
          debugLog('GET_ZOOM: override ativo, retornando', matchedRule.level);
          return matchedRule.level;
        }

        // 2. Smart Zoom (prioridade sobre regras URL normais)
        if (message.width && message.height) {
          const szResult = await chrome.storage.sync.get('__smartZoomProfiles');
          let profiles = szResult['__smartZoomProfiles'] ?? [];
          if (profiles.length === 0) {
            profiles = [{ resolution_width: 1920, resolution_height: 1080, zoom_level: 0.74 }];
          }
          const smartMatch = profiles.find(p => p.resolution_width === message.width && p.resolution_height === message.height);
          if (smartMatch) {
            debugLog('GET_ZOOM: Smart Zoom match', smartMatch.zoom_level);
            return smartMatch.zoom_level;
          }
        }

        // 3. Qualquer regra URL que casou
        if (matchedRule) {
          debugLog('GET_ZOOM: regra aplicada', matchedRule.level);
          return matchedRule.level;
        }

        // 4. Fallback: zoom padrão
        debugLog('GET_ZOOM: fallback ZOOM_DEFAULT');
        return ZOOM_DEFAULT;
      }

      case 'APPLY_ONLY': {
        // Aplica zoom na aba sem gravar regra nenhuma.
        // O ajuste manual (Ctrl+roda, slider) para por aqui: o Chrome já
        // persiste zoom por host nativamente. Regra é só curadoria manual.
        const { tabId: applyTabId, level: applyLevel } = message;
        const targetTab = applyTabId ?? sender.tab?.id;
        if (targetTab == null) return false;
        if (await isTabDisabled(targetTab, sender.tab?.url)) return false;
        await chrome.tabs.setZoom(targetTab, clampZoom(applyLevel));
        return true;
      }

      case 'SAVE_ZOOM': {
        const url = message.url || message.hostname;
        const { level } = message;
        if (!url) return false;
        // Site desativado: não grava regras
        if (await isSiteDisabled(url)) return false;
        const clamped = clampZoom(level);

        // Garante que cache está carregado
        if (!urlRulesCache) await loadUrlRules();

        // A regra só é gravada quando a mensagem traz `pattern` explícito,
        // ou seja, quando a Options Page pediu. Ajuste manual de zoom
        // (Ctrl+roda, slider) usa APPLY_ONLY e não passa por aqui.
        const rawPattern = message.pattern;
        if (!rawPattern || typeof rawPattern !== 'string') {
          debugLog('SAVE_ZOOM ignorado: sem pattern explícito (ajuste manual)');
          return false;
        }

        const pattern = rawPattern.trim();
        if (!pattern) return false;
        const specificity = calculateSpecificity(pattern);

        // Atualiza ou adiciona regra no array
        const existingIndex = urlRulesCache.findIndex(r => r.pattern === pattern);
        if (existingIndex >= 0) {
          urlRulesCache[existingIndex].level = clamped;
          urlRulesCache[existingIndex].specificity = specificity;
          if (message.overrideSmartZoom != null) {
            urlRulesCache[existingIndex].overrideSmartZoom = !!message.overrideSmartZoom;
          }
        } else {
          urlRulesCache.push({
            pattern,
            level: clamped,
            specificity,
            ...(message.overrideSmartZoom ? { overrideSmartZoom: true } : {})
          });
        }

        const saved = await saveUrlRules(urlRulesCache);
        if (!saved) return false;
        return clamped;
      }

      case 'DELETE_URL_RULE': {
        const { pattern } = message;
        if (!pattern || typeof pattern !== 'string') return false;
        if (!urlRulesCache) await loadUrlRules();
        const index = urlRulesCache.findIndex(r => r.pattern === pattern);
        if (index < 0) return false;
        urlRulesCache.splice(index, 1);
        return await saveUrlRules(urlRulesCache);
      }

      case 'RESET_ZOOM': {
        const url = message.url || message.hostname;
        if (!url) return false;
        return await resetZoomForUrl(url);
      }

      case 'APPLY_ZOOM': {
        // Usado pelo content script para aplicar zoom na aba ativa
        const { tabId, level } = message;
        const targetTabId = tabId ?? sender.tab?.id;
        if (targetTabId == null) return false;
        // Site desativado: extension fica passiva
        if (await isTabDisabled(targetTabId, sender.tab?.url)) return false;
        await chrome.tabs.setZoom(targetTabId, clampZoom(level));
        return true;
      }

      case 'GET_TAB_ID': {
        return sender.tab?.id ?? null;
      }

      case 'REGISTER_TAB': {
        // Content script registra a aba no domínio (controle de expiração da desativação)
        const regTabId = sender.tab?.id;
        if (regTabId == null) return null;
        await registerTabDomain(regTabId, message.url || '');
        return regTabId;
      }

      case 'IS_SITE_DISABLED': {
        return await isSiteDisabled(message.url || '');
      }

      case 'TOGGLE_SITE_DISABLED': {
        const key = getDisableKey(message.url || '');
        if (!key) return false;
        await setSiteDisabled(key, !!message.disable);
        // Ao desativar: reseta zoom da aba para 100% imediatamente
        if (message.disable && message.tabId != null) {
          try {
            await chrome.tabs.setZoom(message.tabId, ZOOM_DEFAULT);
          } catch {
            // Aba restrita ou fechada: ignora
          }
        }
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
        // Site desativado: preset ignorado
        if (await isTabDisabled(targetId, sender.tab?.url)) return false;
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
          const urlRules = allData[URL_RULES_KEY] ?? [];
          const presets = allData['__zoomPresets'] ?? [];

          // Push __urlRules como unidade única (serializa array completo)
          // Filtra padrões internos que são locais da máquina e não devem ser sincronizados
          const syncableRules = urlRules.filter(isSyncableRule);
          if (syncableRules.length > 0) {
            const rulesPayload = syncableRules.map(r => ({
              pattern: r.pattern,
              zoom_level: r.level,
              specificity: r.specificity,
              updated_at: new Date().toISOString()
            }));
            const rulesResult = await supabaseRequest('/rest/v1/zoom_url_rules?on_conflict=pattern', {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify(rulesPayload)
            });
            if (rulesResult.error) {
              console.error('[Supabase] SYNC_PUSH zoom_url_rules error:', rulesResult.error);
              return { success: false, error: rulesResult.error, timestamp: new Date().toISOString() };
            }
          }

          // Push presets (dedup por label+level antes do envio)
          debugLog('SYNC_PUSH presets locais:', presets);
          if (presets.length > 0) {
            const seen = new Set();
            const uniquePresets = presets.filter(p => {
              // Normaliza level para inteiro na chave de dedup (74.0 === 74)
              const key = `${p.label}|${Math.round(Number(p.level))}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            debugLog('SYNC_PUSH presets após dedup local:', uniquePresets);
            const presetEntries = uniquePresets.map((p, i) => ({
              label: p.label,
              level: p.level,
              sort_order: i,
              updated_at: new Date().toISOString()
            }));
            debugLog('SYNC_PUSH presetEntries enviados:', presetEntries);
            const presetResult = await supabaseRequest('/rest/v1/presets?on_conflict=label,level', {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify(presetEntries)
            });
            if (presetResult.error) {
              console.error('[Supabase] SYNC_PUSH presets error:', presetResult.error);
              return { success: false, error: presetResult.error, timestamp: new Date().toISOString() };
            }
            debugLog('SYNC_PUSH presets resposta Supabase:', presetResult.data);
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
            const smartResult = await supabaseRequest('/rest/v1/smart_zoom_profiles?on_conflict=resolution_width,resolution_height', {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify(smartEntries)
            });
            if (smartResult.error) {
              console.error('[Supabase] SYNC_PUSH smart_zoom_profiles error:', smartResult.error);
              return { success: false, error: smartResult.error, timestamp: new Date().toISOString() };
            }
          }

          // Push __defaultZoom como entry especial em zoom_settings
          if (allData[DEFAULT_ZOOM_KEY] != null) {
            const defaultEntry = [{ hostname: '__default__', zoom_level: allData[DEFAULT_ZOOM_KEY], updated_at: new Date().toISOString() }];
            const defaultResult = await supabaseRequest('/rest/v1/zoom_settings?on_conflict=hostname', {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify(defaultEntry)
            });
            if (defaultResult.error) {
              console.error('[Supabase] SYNC_PUSH __defaultZoom error:', defaultResult.error);
            }
          }

          // Push pdf_zoom_profiles + __pdfZoom/__pdfDefaultZoom as reserved labels
          const pdfProfiles = allData['__pdfZoomProfiles'] ?? [];
          const pdfEntries = pdfProfiles.map((p, i) => ({
            label: p.label,
            zoom_level: p.zoom_level,
            sort_order: i,
            updated_at: new Date().toISOString()
          }));
          if (allData['__pdfZoom'] != null) {
            pdfEntries.push({ label: '__current__', zoom_level: allData['__pdfZoom'], sort_order: 9998, updated_at: new Date().toISOString() });
          }
          if (allData['__pdfDefaultZoom'] != null) {
            pdfEntries.push({ label: '__default__', zoom_level: allData['__pdfDefaultZoom'], sort_order: 9999, updated_at: new Date().toISOString() });
          }
          if (pdfEntries.length > 0) {
            const pdfResult = await supabaseRequest('/rest/v1/pdf_zoom_profiles?on_conflict=label', {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify(pdfEntries)
            });
            if (pdfResult.error) {
              console.error('[Supabase] SYNC_PUSH pdf_zoom_profiles error:', pdfResult.error);
              return { success: false, error: pdfResult.error, timestamp: new Date().toISOString() };
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
        // Site desativado: Smart Zoom ignorado
        if (await isTabDisabled(targetTabId, sender.tab?.url)) return { applied: false };
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
        // Não grava regra: Smart Zoom é por resolução, não curadoria de URL
        return { applied: true, level: match.zoom_level };
      }

      case 'GET_PDF_PROFILES': {
        const result = await chrome.storage.sync.get('__pdfZoomProfiles');
        return result['__pdfZoomProfiles'] ?? [];
      }

      case 'SAVE_PDF_PROFILES': {
        const { profiles } = message;
        if (!Array.isArray(profiles)) return false;
        const validated = profiles.slice(0, 20).map((p, i) => ({
          label: String(p.label || '').slice(0, 30),
          zoom_level: clampZoom(p.zoom_level || 1.0),
          sort_order: i
        }));
        await chrome.storage.sync.set({ '__pdfZoomProfiles': validated });
        return validated;
      }

      case 'DELETE_PDF_PROFILE': {
        const { index } = message;
        if (typeof index !== 'number') return false;
        const result = await chrome.storage.sync.get('__pdfZoomProfiles');
        const profiles = result['__pdfZoomProfiles'] ?? [];
        if (index < 0 || index >= profiles.length) return false;
        profiles.splice(index, 1);
        profiles.forEach((p, i) => { p.sort_order = i; });
        await chrome.storage.sync.set({ '__pdfZoomProfiles': profiles });
        return profiles;
      }

      case 'SAVE_PDF_ZOOM': {
        const { level } = message;
        if (level == null) return false;
        const clamped = clampZoom(level);
        await chrome.storage.sync.set({ '__pdfZoom': clamped });
        return clamped;
      }

      case 'APPLY_PDF_ZOOM': {
        const { tabId } = message;
        const targetTabId = tabId ?? sender.tab?.id;
        if (targetTabId == null) return { applied: false };

        const pdfManual = await chrome.storage.sync.get('__pdfZoom');
        if (pdfManual['__pdfZoom'] != null) {
          const clamped = clampZoom(pdfManual['__pdfZoom']);
          await chrome.tabs.setZoom(targetTabId, clamped);
          return { applied: true, level: clamped };
        }

        const pdfDef = await chrome.storage.sync.get('__pdfDefaultZoom');
        const pdfDefaultLevel = pdfDef['__pdfDefaultZoom'] ?? 1.0;
        const clampedDefault = clampZoom(pdfDefaultLevel);
        await chrome.tabs.setZoom(targetTabId, clampedDefault);
        return { applied: true, level: clampedDefault };
      }

      case 'GET_PDF_ZOOM_LEVEL': {
        const pdfManual = await chrome.storage.sync.get('__pdfZoom');
        if (pdfManual['__pdfZoom'] != null) {
          return clampZoom(pdfManual['__pdfZoom']);
        }
        const pdfDef = await chrome.storage.sync.get('__pdfDefaultZoom');
        return clampZoom(pdfDef['__pdfDefaultZoom'] ?? 1.0);
      }

      case 'RESET_PDF_ZOOM': {
        const { tabId } = message;
        const targetTabId = tabId ?? sender.tab?.id;
        if (targetTabId == null) return false;
        await chrome.storage.sync.remove('__pdfZoom');
        const pdfDef = await chrome.storage.sync.get('__pdfDefaultZoom');
        const defaultLevel = clampZoom(pdfDef['__pdfDefaultZoom'] ?? 1.0);
        await chrome.tabs.setZoom(targetTabId, defaultLevel);
        return defaultLevel;
      }

      case 'SAVE_SUPABASE_CONFIG': {
        const { url, key } = message;
        if (!url || !key || typeof url !== 'string' || typeof key !== 'string') {
          return { success: false, error: 'URL e Key são obrigatórios' };
        }
        await chrome.storage.local.set({
          [SUPABASE_URL_KEY]: url.replace(/\/+$/, ''),
          [SUPABASE_KEY_KEY]: key.trim()
        });
        return { success: true };
      }

      case 'UPDATE_SUPABASE_URL': {
        const { url } = message;
        if (!url || typeof url !== 'string') {
          return { success: false, error: 'URL é obrigatória' };
        }
        await chrome.storage.local.set({
          [SUPABASE_URL_KEY]: url.replace(/\/+$/, '')
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
          debugLog('SYNC_PULL presets brutos do Supabase:', presetResult.data);

          // Merge remoto para storage local
          const updates = {};
          if (zoomResult.data && zoomResult.data.length > 0) {
            for (const entry of zoomResult.data) {
              if (entry.hostname === '__default__') {
                updates[DEFAULT_ZOOM_KEY] = Number(entry.zoom_level);
              }
              // Chaves "hostname": number não são mais recriadas no sync:
              // são itens avulsos que enchem a cota (limite de 512) e não
              // alimentam nada. Só __default__ ainda é lido daqui.
            }
          }

          if (presetResult.data && presetResult.data.length > 0) {
            const seenPull = new Set();
            updates['__zoomPresets'] = presetResult.data
              .map(p => ({ label: p.label, level: Number(p.level) }))
              .filter(p => {
                // Normaliza level para inteiro na chave de dedup (74.0 === 74)
                const key = `${p.label}|${Math.round(p.level)}`;
                if (seenPull.has(key)) return false;
                seenPull.add(key);
                return true;
              });
            debugLog('SYNC_PULL presets após dedup local:', updates['__zoomPresets']);
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

          // Pull pdf_zoom_profiles
          const pdfResult = await supabaseRequest('/rest/v1/pdf_zoom_profiles?select=label,zoom_level,sort_order&order=sort_order.asc');
          if (pdfResult.error) {
            console.error('[Supabase] SYNC_PULL pdf_zoom_profiles error:', pdfResult.error);
            return { success: false, error: pdfResult.error, timestamp: new Date().toISOString() };
          }
          if (pdfResult.data && pdfResult.data.length > 0) {
            const profiles = [];
            for (const p of pdfResult.data) {
              if (p.label === '__current__') {
                updates['__pdfZoom'] = Number(p.zoom_level);
              } else if (p.label === '__default__') {
                updates['__pdfDefaultZoom'] = Number(p.zoom_level);
              } else {
                profiles.push({ label: p.label, zoom_level: p.zoom_level, sort_order: p.sort_order });
              }
            }
            updates['__pdfZoomProfiles'] = profiles;
          }

          // Pull zoom_url_rules: mescla com as regras locais.
          // Sobrescrever o array inteiro apagava regras criadas aqui quando
          // a nuvem estava desatualizada. O local vence em caso de conflito.
          const rulesResult = await supabaseRequest('/rest/v1/zoom_url_rules?select=pattern,zoom_level,specificity');
          if (rulesResult.error) {
            console.error('[Supabase] SYNC_PULL zoom_url_rules error:', rulesResult.error);
            return { success: false, error: rulesResult.error, timestamp: new Date().toISOString() };
          }
          if (rulesResult.data && rulesResult.data.length > 0) {
            updates[URL_RULES_KEY] = await mergePulledRules(rulesResult.data);
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
    const presetResult = await supabaseRequest('/rest/v1/presets?select=label,level,sort_order&order=sort_order.asc');
    const updates = {};
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
    // Pull zoom_url_rules (mescla, não sobrescreve)
    try {
      const rulesResult = await supabaseRequest('/rest/v1/zoom_url_rules?select=pattern,zoom_level,specificity');
      if (!rulesResult.error && rulesResult.data && rulesResult.data.length > 0) {
        updates[URL_RULES_KEY] = await mergePulledRules(rulesResult.data);
      }
    } catch (e) {
      console.error('[Supabase] Initial pull zoom_url_rules failed:', e);
    }

    if (Object.keys(updates).length > 0) {
      await chrome.storage.sync.set(updates);
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
    const urlRules = allData[URL_RULES_KEY] ?? [];
    const presets = allData['__zoomPresets'] ?? [];

    // Push __urlRules como unidade única
    if (urlRules.length > 0) {
      const rulesPayload = urlRules.map(r => ({
        pattern: r.pattern,
        zoom_level: r.level,
        specificity: r.specificity,
        updated_at: new Date().toISOString()
      }));
      await supabaseRequest('/rest/v1/zoom_url_rules', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(rulesPayload)
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
      await supabaseRequest('/rest/v1/smart_zoom_profiles?on_conflict=resolution_width,resolution_height', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(smartEntries)
      });
    }

    // Auto-sync pdf_zoom_profiles
    const pdfProfiles = allData['__pdfZoomProfiles'] ?? [];
    if (pdfProfiles.length > 0) {
      const pdfEntries = pdfProfiles.map((p, i) => ({
        label: p.label,
        zoom_level: p.zoom_level,
        sort_order: i,
        updated_at: new Date().toISOString()
      }));
      await supabaseRequest('/rest/v1/pdf_zoom_profiles?on_conflict=label', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(pdfEntries)
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
    const url = tab.url || '';
    if (!url) return;
    const defaultLevel = await resetZoomForUrl(url);
    await chrome.tabs.setZoom(tab.id, clampZoom(defaultLevel));
  } else if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith('preset-')) {
    // Site desativado: presets do menu de contexto ignorados
    if (await isSiteDisabled(tab.url || '')) return;
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

    // PDF: usa RESET_PDF_ZOOM
    if (isPdfUrl(tab.url)) {
      await chrome.storage.sync.remove('__pdfZoom');
      const pdfDef = await chrome.storage.sync.get('__pdfDefaultZoom');
      const defaultLevel = clampZoom(pdfDef['__pdfDefaultZoom'] ?? ZOOM_DEFAULT);
      await chrome.tabs.setZoom(tab.id, defaultLevel);
      return;
    }

    const url = tab.url;
    if (!url) return;
    const defaultLevel = await resetZoomForUrl(url);
    await chrome.tabs.setZoom(tab.id, clampZoom(defaultLevel));
  } catch (err) {
    console.error('[ZoomManager] Reset command error:', err);
  }
});

/**
 * Verifica se a aba pertence a um site desativado.
 * Usa a URL do sender quando disponível; senão consulta a aba.
 * @param {number} tabId
 * @param {string} [senderUrl]
 * @returns {Promise<boolean>}
 */
async function isTabDisabled(tabId, senderUrl) {
  if (senderUrl) return isSiteDisabled(senderUrl);
  try {
    const tab = await chrome.tabs.get(tabId);
    return await isSiteDisabled(tab.url || '');
  } catch {
    return false;
  }
}

/**
 * Função auxiliar para detecção de PDFs
 * @param {string} url - URL da página
 * @returns {boolean} true se for PDF
 */
function isPdfUrl(url) {
  if (!url) return false;
  
  // Viewer nativo do Chrome
  if (url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai')) {
    return true;
  }
  
  // PDFs locais
  if (url.startsWith('file://')) {
    const cleanUrl = decodeURIComponent(url.split('?')[0].split('#')[0]).toLowerCase();
    return cleanUrl.endsWith('.pdf');
  }
  
  // URLs com extensão .pdf
  const cleanUrl = decodeURIComponent(url.split('?')[0].split('#')[0]).toLowerCase();
  return cleanUrl.endsWith('.pdf');
}

// --- Rastrear abas PDF que já tiveram zoom aplicado (evita loop) ---
const pdfZoomApplied = new Set();

chrome.tabs.onRemoved.addListener(async (tabId) => {
  pdfZoomApplied.delete(tabId);
  // Sem abas restantes no domínio, a desativação expira
  await unregisterTab(tabId);
});

// --- Monitorar mudanças de zoom para detectar resets em PDFs ---
chrome.tabs.onZoomChange.addListener(async (zoomChangeInfo) => {
  const { tabId, newZoomFactor } = zoomChangeInfo;

  if (!pdfZoomApplied.has(tabId)) return;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isPdfUrl(tab.url)) {
      pdfZoomApplied.delete(tabId);
      return;
    }

    const pdfManual = await chrome.storage.sync.get('__pdfZoom');
    let expectedLevel;
    if (pdfManual['__pdfZoom'] != null) {
      expectedLevel = clampZoom(pdfManual['__pdfZoom']);
    } else {
      const pdfDef = await chrome.storage.sync.get('__pdfDefaultZoom');
      expectedLevel = clampZoom(pdfDef['__pdfDefaultZoom'] ?? 1.0);
    }

    // Viewer nativo reseta para 0.75 ou 1.0 dependendo do contexto.
    // Só reaplica se o novo zoom for próximo desses valores padrão E diferente do esperado.
    const nearDefault = Math.abs(newZoomFactor - 0.75) < 0.05 || Math.abs(newZoomFactor - 1.0) < 0.05;
    if (nearDefault && Math.abs(newZoomFactor - expectedLevel) > 0.01) {
      await chrome.tabs.setZoom(tabId, expectedLevel);
    }
  } catch {
    pdfZoomApplied.delete(tabId);
  }
});

// --- Restaurar zoom ao navegar ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.status || !tab.url) return;
  if (changeInfo.status !== 'complete' && changeInfo.status !== 'loading') return;

  try {
    const tabInfo = await chrome.tabs.get(tabId);

    // Site desativado: não restaura zoom (nem em PDFs do domínio)
    if (await isSiteDisabled(tabInfo.url || '')) return;

    const isPdf = isPdfUrl(tabInfo.url);

    if (isPdf) {
      const pdfManual = await chrome.storage.sync.get('__pdfZoom');
      let pdfLevel;
      if (pdfManual['__pdfZoom'] != null) {
        pdfLevel = clampZoom(pdfManual['__pdfZoom']);
      } else {
        const pdfDef = await chrome.storage.sync.get('__pdfDefaultZoom');
        pdfLevel = clampZoom(pdfDef['__pdfDefaultZoom'] ?? 1.0);
      }
      await chrome.tabs.setZoom(tabId, pdfLevel);
      pdfZoomApplied.add(tabId);
      // Desativa guard após 2s para permitir ajuste livre via botões do toolbar
      setTimeout(() => pdfZoomApplied.delete(tabId), 2000);
      return;
    }

    // Lógica normal para páginas HTML
    // Ordem de prioridade: Regra URL com override > Smart Zoom > Regra URL > padrão
    const url = tab.url;
    debugLog('tabs.onUpdated:', { tabId, url });
    if (!url) return;

    const matchedRule = await resolveRule(url);
    debugLog('tabs.onUpdated regra encontrada:', matchedRule);

    // Regra URL (com ou sem override) tem prioridade; Smart Zoom fica
    // para o content script quando nenhuma regra casa.
    if (matchedRule) {
      debugLog('tabs.onUpdated: aplicando regra', matchedRule.pattern, matchedRule.level);
      await chrome.tabs.setZoom(tabId, matchedRule.level);
      return;
    }

    debugLog('tabs.onUpdated: nenhuma regra encontrada, deixando content script decidir');
  } catch (err) {
    // Ignora erros em páginas restritas (chrome://, edge://, etc.)
    if (!err.message?.includes('Cannot access')) {
      console.error('[ZoomManager] Restore zoom error:', err);
    }
  }
});
