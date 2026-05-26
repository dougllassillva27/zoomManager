/**
 * Native Zoom Manager - Options Page
 * Configuração do zoom padrão para reset.
 */

const DEFAULT_ZOOM_KEY = '__defaultZoom';
const defaultZoomInput = document.getElementById('defaultZoom');
const statusEl = document.getElementById('status');

let saveTimeout = null;

/**
 * Exibe mensagem de status temporária.
 */
function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.opacity = '1';

  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    statusEl.style.opacity = '0';
  }, 2000);
}

/**
 * Salva zoom padrão no storage.
 */
async function saveDefaultZoom(percent) {
  try {
    const level = Math.min(500, Math.max(25, percent)) / 100;
    await chrome.storage.sync.set({ [DEFAULT_ZOOM_KEY]: level });
    showStatus('Salvo com sucesso!', 'success');
  } catch (err) {
    showStatus('Erro ao salvar.', 'error');
  }
}

/**
 * Carrega zoom padrão do storage.
 */
async function loadDefaultZoom() {
  try {
    const result = await chrome.storage.sync.get(DEFAULT_ZOOM_KEY);
    const level = result[DEFAULT_ZOOM_KEY] ?? 1.0;
    defaultZoomInput.value = Math.round(level * 100);
  } catch {
    defaultZoomInput.value = 100;
  }
}

// Auto-save on change com debounce
defaultZoomInput.addEventListener('change', () => {
  let val = parseInt(defaultZoomInput.value, 10);
  val = Math.min(500, Math.max(25, val));
  defaultZoomInput.value = val;
  saveDefaultZoom(val);
});

// --- Presets CRUD ---
const PRESETS_KEY = '__zoomPresets';
const presetLabelInput = document.getElementById('presetLabel');
const presetLevelInput = document.getElementById('presetLevel');
const addPresetBtn = document.getElementById('addPresetBtn');
const presetsListEl = document.getElementById('presets-list');

let currentPresets = [];

async function loadPresets() {
  const result = await chrome.storage.sync.get(PRESETS_KEY);
  currentPresets = result[PRESETS_KEY] ?? [];
  renderPresets();
}

function renderPresets() {
  presetsListEl.innerHTML = '';
  currentPresets.forEach((preset, index) => {
    const li = document.createElement('li');
    li.className = 'preset-item';
    li.innerHTML = `
      <div class="preset-info">
        <span class="preset-label">${escapeHtml(preset.label)}</span>
        <span class="preset-level">${preset.level}%</span>
      </div>
      <button class="btn-remove" data-index="${index}">Remover</button>
    `;
    presetsListEl.appendChild(li);
  });

  // Bind remove buttons
  presetsListEl.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => removePreset(parseInt(btn.dataset.index)));
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function addPreset() {
  const label = presetLabelInput.value.trim().slice(0, 20);
  let level = parseInt(presetLevelInput.value, 10);

  if (!label) {
    showStatus('Label é obrigatória.', 'error');
    return;
  }
  if (isNaN(level) || level < 25 || level > 500) {
    showStatus('Level deve ser entre 25 e 500.', 'error');
    return;
  }
  if (currentPresets.length >= 8) {
    showStatus('Máximo de 8 presets atingido.', 'error');
    return;
  }

  level = Math.round(level / 2) * 2;
  currentPresets.push({ label, level });
  await savePresets();
  presetLabelInput.value = '';
  presetLevelInput.value = '100';
  showStatus('Preset adicionado!', 'success');
}

async function removePreset(index) {
  currentPresets.splice(index, 1);
  await savePresets();
  showStatus('Preset removido.', 'success');
}

async function savePresets() {
  await chrome.storage.sync.set({ [PRESETS_KEY]: currentPresets });
  renderPresets();
}

addPresetBtn.addEventListener('click', addPreset);

// Carregar ao iniciar
loadDefaultZoom();
loadPresets();
