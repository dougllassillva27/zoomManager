/**
 * Native Zoom Manager - Popup Script
 * UI para visualização e ajuste fino de zoom por domínio.
 */

const zoomRange = document.getElementById('zoomRange');
const zoomNumber = document.getElementById('zoomNumber');
const hostnameEl = document.getElementById('hostname');
const resetBtn = document.getElementById('resetBtn');
const btnOptions = document.getElementById('btn-options');

let currentHostname = '';
let currentUrl = '';
let currentTabId = null;
let isPdfTab = false;
let isUpdating = false;

/**
 * Envia mensagem ao background e retorna promessa.
 */
function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Obtém aba ativa e extrai hostname.
 */
function isPdfUrl(url) {
  if (!url) return false;
  if (url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai')) return true;
  if (url.startsWith('file://')) {
    const clean = decodeURIComponent(url.split('?')[0].split('#')[0]).toLowerCase();
    return clean.endsWith('.pdf');
  }
  const clean = decodeURIComponent(url.split('?')[0].split('#')[0]).toLowerCase();
  return clean.endsWith('.pdf');
}

async function getActiveTabInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  try {
    return { tabId: tab.id, hostname: new URL(tab.url).hostname, url: tab.url, isPdf: isPdfUrl(tab.url) };
  } catch {
    return null;
  }
}

/**
 * Atualiza UI com valor de zoom (em porcentagem).
 */
function updateUI(zoomPercent) {
  isUpdating = true;
  zoomRange.value = zoomPercent;
  zoomNumber.value = zoomPercent;
  isUpdating = false;
}

/**
 * Arredonda valor para múltiplo de 2.
 */
function roundToStep2(val) {
  return Math.round(val / 2) * 2;
}

/**
 * Aplica zoom e salva no storage.
 */
async function applyAndSave(zoomPercent) {
  if (!currentTabId) return;
  const level = zoomPercent / 100;

  await sendMessage({ type: 'APPLY_ZOOM', tabId: currentTabId, level });

  if (isPdfTab) {
    await sendMessage({ type: 'SAVE_PDF_ZOOM', level });
  } else {
    if (!currentUrl) return;
    await sendMessage({ type: 'SAVE_ZOOM', url: currentUrl, level });
  }
}

// --- Event Listeners ---

// Slider change
zoomRange.addEventListener('input', () => {
  if (isUpdating) return;
  const val = roundToStep2(parseInt(zoomRange.value, 10));
  zoomNumber.value = val;
  applyAndSave(val);
});

// Number input change
zoomNumber.addEventListener('change', () => {
  if (isUpdating) return;
  let val = roundToStep2(parseInt(zoomNumber.value, 10));
  val = Math.min(500, Math.max(26, val));
  zoomNumber.value = val;
  zoomRange.value = val;
  applyAndSave(val);
});

// Reset button
resetBtn.addEventListener('click', async () => {
  if (!currentTabId) return;
  let defaultLevel;
  if (isPdfTab) {
    defaultLevel = await sendMessage({ type: 'RESET_PDF_ZOOM', tabId: currentTabId });
  } else {
    if (!currentHostname) return;
    defaultLevel = await sendMessage({ type: 'RESET_ZOOM', hostname: currentHostname });
  }
  const defaultPercent = Math.round((defaultLevel ?? 1.0) * 100);
  updateUI(defaultPercent);
});

// --- Presets ---
const presetsGrid = document.getElementById('presets-grid');

async function loadAndRenderPresets() {
  const presets = await sendMessage({ type: 'GET_PRESETS' });
  presetsGrid.innerHTML = '';
  if (!presets || presets.length === 0) return;

  presets.forEach(preset => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = `${preset.label} (${preset.level}%)`;
    btn.title = `${preset.label}: ${preset.level}%`;
    btn.addEventListener('click', async () => {
      if (!currentTabId) return;
      await sendMessage({ type: 'APPLY_PRESET', level: preset.level, tabId: currentTabId });
      const percent = Math.round(preset.level);
      updateUI(percent);
    });
    presetsGrid.appendChild(btn);
  });
}

// --- Inicialização ---
(async function init() {
  const tabInfo = await getActiveTabInfo();
  if (!tabInfo) {
    hostnameEl.textContent = 'Página não suportada';
    zoomRange.disabled = true;
    zoomNumber.disabled = true;
    resetBtn.disabled = true;
    return;
  }

  currentHostname = tabInfo.hostname;
  currentUrl = tabInfo.url || '';
  currentTabId = tabInfo.tabId;
  isPdfTab = tabInfo.isPdf;
  hostnameEl.textContent = isPdfTab ? 'PDF Viewer' : currentHostname;

  let zoomPercent;
  if (isPdfTab) {
    const pdfLevel = await sendMessage({ type: 'GET_PDF_ZOOM_LEVEL' });
    zoomPercent = Math.round((pdfLevel ?? 1.0) * 100);
  } else {
    const savedZoom = await sendMessage({ type: 'GET_ZOOM', url: currentUrl });
    if (savedZoom != null && savedZoom !== 1.0) {
      zoomPercent = Math.round(savedZoom * 100);
    } else {
      const currentZoom = await sendMessage({ type: 'GET_CURRENT_ZOOM', tabId: currentTabId });
      zoomPercent = Math.round((currentZoom ?? 1.0) * 100);
    }
  }
  updateUI(zoomPercent);

  // Carrega presets
  await loadAndRenderPresets();
})();

// Escutar mudanças externas de zoom (atalhos, context menu)
if (chrome.tabs?.onZoomChange) {
  chrome.tabs.onZoomChange.addListener((zoomChangeInfo) => {
    if (zoomChangeInfo.tabId === currentTabId) {
      const percent = Math.round(zoomChangeInfo.newZoomFactor * 100);
      updateUI(percent);
    }
  });
}

// Escutar mudanças no storage (context menu aplica preset/reset sem onZoomChange)
chrome.storage.onChanged.addListener(async (changes) => {
  if (!currentTabId) return;
  // Se __urlRules mudou, reconsulta zoom para a URL atual
  if (changes['__urlRules']) {
    if (!currentUrl) return;
    const savedZoom = await sendMessage({ type: 'GET_ZOOM', url: currentUrl });
    if (savedZoom != null && savedZoom !== 1.0) {
      updateUI(Math.round(savedZoom * 100));
    } else {
      const currentZoom = await sendMessage({ type: 'GET_CURRENT_ZOOM', tabId: currentTabId });
      updateUI(Math.round((currentZoom ?? 1.0) * 100));
    }
  }
});

// Botão Opções
btnOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
