/**
 * Native Zoom Manager - Service Worker
 * Gerencia persistência de zoom por hostname e comandos de teclado.
 */

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5.0;
const ZOOM_DEFAULT = 1.0;
const DEFAULT_ZOOM_KEY = '__defaultZoom';

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

chrome.runtime.onInstalled.addListener(() => {
  buildContextMenu();
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
