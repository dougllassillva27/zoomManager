/**
 * Native Zoom Manager - Content Script
 * Intercepta Ctrl+Roda do Mouse para ajustar zoom nativo.
 * Restaura zoom salvo ao carregar página.
 */

const ZOOM_STEP = 0.02;
let currentZoom = null;
let saveTimeout = null;

/**
 * Envia mensagem ao background e retorna promessa.
 * @param {object} message
 * @returns {Promise<any>}
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
 * Aplica zoom na aba atual via background.
 * @param {number} level
 */
async function applyZoom(level) {
  const result = await sendMessage({ type: 'APPLY_ZOOM', level });
  if (result !== false) {
    currentZoom = level;
  }
}

/**
 * Salva zoom no storage com debounce.
 * @param {number} level
 */
function saveZoomDebounced(level) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    sendMessage({
      type: 'SAVE_ZOOM',
      url: window.location.href,
      level,
    });
  }, 300);
}

// --- Interceptar Ctrl+Wheel (apenas páginas HTML; viewer PDF nativo consome eventos antes do content script) ---
window.addEventListener(
  'wheel',
  (event) => {
    if (!event.ctrlKey || isPdf) return;

    event.preventDefault();
    event.stopPropagation();

    const direction = event.deltaY < 0 ? 1 : -1;
    const baseZoom = currentZoom ?? 1.0;
    const newZoom = Math.round((baseZoom + direction * ZOOM_STEP) * 100) / 100;
    const clampedZoom = Math.min(5.0, Math.max(0.25, newZoom));

    if (clampedZoom !== baseZoom) {
      applyZoom(clampedZoom);
      saveZoomDebounced(clampedZoom);
    }
  },
  { passive: false, capture: true }
);

// --- Salvar zoom PDF com debounce ---
function savePdfZoomDebounced(level) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    sendMessage({ type: 'SAVE_PDF_ZOOM', level });
  }, 300);
}

let currentTabId = null;

// --- Aplicar zoom inicial (definida ANTES de detectPdf) ---
async function applyInitialZoom() {
  // Obtém tabId via background (content script em file:// não tem acesso a chrome.tabs)
  currentTabId = await sendMessage({ type: 'GET_TAB_ID' });

  if (isPdf) {
    const savedLevel = await sendMessage({ type: 'GET_PDF_ZOOM_LEVEL' });
    currentZoom = savedLevel ?? 1.0;
    return;
  }

  // Modo HTML normal
  const url = window.location.href;
  if (!url) return;

  const savedZoom = await sendMessage({ type: 'GET_ZOOM', url });
  if (savedZoom != null && savedZoom !== 1.0) {
    // Zoom manual salvo tem prioridade sobre Smart Zoom
    currentZoom = savedZoom;
    requestAnimationFrame(() => {
      applyZoom(savedZoom);
    });
  } else {
    // Sem zoom manual: tenta Smart Zoom por resolução
    const smartResult = await sendMessage({
      type: 'APPLY_SMART_ZOOM',
      width: screen.width,
      height: screen.height
    });
    if (smartResult?.applied) {
      currentZoom = smartResult.level;
    } else {
      currentZoom = 1.0;
    }
  }
}

// --- Detecção robusta de PDF com retry e fallback ---
let isPdf = false;
let pdfDetectionRetries = 0;
const MAX_DETECTION_RETRIES = 10;
const DETECTION_RETRY_DELAY = 50;

function detectPdf() {
  const cleanUrl = window.location.href.split('?')[0].split('#')[0].toLowerCase();
  const byContentType = document.contentType === 'application/pdf';
  const byUrl = cleanUrl.endsWith('.pdf') ||
               window.location.href.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai') ||
               (window.location.protocol === 'file:' && cleanUrl.includes('.pdf'));

  isPdf = byContentType || byUrl;

  if (!isPdf && pdfDetectionRetries < MAX_DETECTION_RETRIES) {
    pdfDetectionRetries++;
    setTimeout(detectPdf, DETECTION_RETRY_DELAY);
  } else {
    applyInitialZoom();
  }
}

detectPdf();
