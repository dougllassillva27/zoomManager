/**
 * Native Zoom Manager - Content Script
 * Intercepta Ctrl+Roda do Mouse para ajustar zoom nativo.
 * Restaura zoom salvo ao carregar página.
 */

const ZOOM_STEP = 0.02;
let currentZoom = null;
let saveTimeout = null;
// Site desativado: extensão fica passiva (não intercepta nem aplica zoom)
let siteDisabled = false;
// Contexto invalidado (extensão recarregada): script zumbi para de interceptar
let contextInvalidated = false;

/**
 * Envia mensagem ao background e retorna promessa.
 * @param {object} message
 * @returns {Promise<any>}
 */
function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch {
      // Contexto invalidado (extensão recarregada): script vira zumbi;
      // para de interceptar para devolver o zoom nativo à aba
      contextInvalidated = true;
      resolve(null);
    }
  });
}

/**
 * Aplica zoom na aba atual via background, sem gravar regra.
 * O Chrome persiste zoom por host nativamente, então o ajuste sobrevive
 * ao recarregamento. Regra em __urlRules é só curadoria manual (Options).
 * @param {number} level
 */
async function applyZoom(level) {
  const result = await sendMessage({ type: 'APPLY_ONLY', level });
  if (result !== false) {
    currentZoom = level;
  }
}

// --- Interceptar Ctrl+Wheel (apenas páginas HTML; viewer PDF nativo consome eventos antes do content script) ---
window.addEventListener(
  'wheel',
  (event) => {
    if (!event.ctrlKey || isPdf || siteDisabled || contextInvalidated) return;

    event.preventDefault();
    event.stopPropagation();

    const direction = event.deltaY < 0 ? 1 : -1;
    const baseZoom = currentZoom ?? 1.0;
    const newZoom = Math.round((baseZoom + direction * ZOOM_STEP) * 100) / 100;
    const clampedZoom = Math.min(5.0, Math.max(0.25, newZoom));

    if (clampedZoom !== baseZoom) {
      applyZoom(clampedZoom);
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
  // Registra aba no domínio (controle de expiração) e obtém tabId via background
  // (content script em file:// não tem acesso a chrome.tabs)
  currentTabId = await sendMessage({ type: 'REGISTER_TAB', url: window.location.href });

  // Site desativado: não aplica zoom salvo nem Smart Zoom
  siteDisabled = (await sendMessage({ type: 'IS_SITE_DISABLED', url: window.location.href })) === true;
  if (siteDisabled) return;

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
    // Regra manual da Options Page tem prioridade sobre tudo
    currentZoom = savedZoom;
    requestAnimationFrame(() => {
      applyZoom(savedZoom);
    });
    return;
  }

  // Sem regra: respeita o zoom que o Chrome já restaurou para este host.
  // O Chrome persiste zoom por host nativamente, então um ajuste manual
  // (Ctrl+roda, slider) chega aqui como zoom != 1.0. Sobrescrever com
  // Smart Zoom anularia esse ajuste a cada carregamento.
  const chromeZoom = await sendMessage({ type: 'GET_CURRENT_ZOOM', tabId: currentTabId });
  if (chromeZoom != null && Math.abs(chromeZoom - 1.0) > 0.01) {
    currentZoom = chromeZoom;
    return;
  }

  // Chrome no default: aí sim aplica Smart Zoom por resolução
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

// Atualiza flag local quando a desativação do site muda (popup/outra aba)
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== 'session' || !changes['__disabledSites']) return;
  siteDisabled = (await sendMessage({ type: 'IS_SITE_DISABLED', url: window.location.href })) === true;
});

detectPdf();
