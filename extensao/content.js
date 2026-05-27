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
      hostname: window.location.hostname,
      level,
    });
  }, 300);
}

// --- Interceptar Ctrl+Wheel ---
window.addEventListener(
  'wheel',
  (event) => {
    if (!event.ctrlKey) return;

    event.preventDefault();
    event.stopPropagation();

    // Direção: deltaY negativo = zoom in, positivo = zoom out
    const direction = event.deltaY < 0 ? 1 : -1;
    const baseZoom = currentZoom ?? 1.0;
    const newZoom = Math.round((baseZoom + direction * ZOOM_STEP) * 100) / 100;

    // Clamp entre 0.25 e 5.0
    const clampedZoom = Math.min(5.0, Math.max(0.25, newZoom));

    if (clampedZoom !== baseZoom) {
      applyZoom(clampedZoom);
      saveZoomDebounced(clampedZoom);
    }
  },
  { passive: false, capture: true }
);

// --- Restaurar zoom ao carregar ---
(async function restoreZoom() {
  const hostname = window.location.hostname;
  if (!hostname) return;

  const savedZoom = await sendMessage({ type: 'GET_ZOOM', hostname });
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
})();
