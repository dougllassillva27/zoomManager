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

  // Verifica duplicata por label+level
  const exists = currentPresets.some(p => p.label === label && p.level === level);
  if (exists) {
    showStatus('Preset já existe.', 'error');
    return;
  }

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

// --- Smart Zoom Profiles CRUD ---
const btnDetectResolution = document.getElementById('btnDetectResolution');
const szWidthInput = document.getElementById('szWidth');
const szHeightInput = document.getElementById('szHeight');
const szZoomLevelInput = document.getElementById('szZoomLevel');
const addSmartProfileBtn = document.getElementById('addSmartProfileBtn');
const smartProfilesListEl = document.getElementById('smart-profiles-list');

let currentSmartProfiles = [];

async function loadSmartProfiles() {
  const profiles = await sendMessage({ type: 'GET_SMART_PROFILES' });
  currentSmartProfiles = profiles ?? [];
  renderSmartProfiles();
}

function renderSmartProfiles() {
  smartProfilesListEl.innerHTML = '';
  currentSmartProfiles.forEach((profile, index) => {
    const li = document.createElement('li');
    li.className = 'preset-item';
    const zoomPercent = Math.round(profile.zoom_level * 100);
    li.innerHTML = `
      <div class="preset-info">
        <span class="preset-label">${profile.resolution_width}x${profile.resolution_height}</span>
        <span class="preset-level">${zoomPercent}%</span>
      </div>
      <button class="btn-remove" data-index="${index}">Remover</button>
    `;
    smartProfilesListEl.appendChild(li);
  });

  smartProfilesListEl.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => deleteSmartProfile(parseInt(btn.dataset.index)));
  });
}

btnDetectResolution.addEventListener('click', () => {
  szWidthInput.value = screen.width;
  szHeightInput.value = screen.height;
});

addSmartProfileBtn.addEventListener('click', async () => {
  const width = parseInt(szWidthInput.value, 10);
  const height = parseInt(szHeightInput.value, 10);
  let zoomPercent = parseInt(szZoomLevelInput.value, 10);

  if (!width || !height || width <= 0 || height <= 0) {
    showStatus('Clique em "Detectar" para preencher a resolução.', 'error');
    return;
  }
  if (isNaN(zoomPercent) || zoomPercent < 25 || zoomPercent > 500) {
    showStatus('Zoom deve ser entre 25 e 500.', 'error');
    return;
  }

  zoomPercent = Math.round(zoomPercent / 2) * 2;
  const zoomLevel = zoomPercent / 100;

  // Verifica duplicata
  const existing = currentSmartProfiles.findIndex(p => p.resolution_width === width && p.resolution_height === height);
  if (existing >= 0) {
    // Atualiza existente
    currentSmartProfiles[existing].zoom_level = zoomLevel;
  } else {
    currentSmartProfiles.push({ resolution_width: width, resolution_height: height, zoom_level: zoomLevel });
  }

  const result = await sendMessage({ type: 'SAVE_SMART_PROFILES', profiles: currentSmartProfiles });
  if (result) {
    currentSmartProfiles = result;
    renderSmartProfiles();
    showStatus('Perfil Smart Zoom salvo!', 'success');
    szWidthInput.value = '';
    szHeightInput.value = '';
    szZoomLevelInput.value = '74';
  }
});

async function deleteSmartProfile(index) {
  const result = await sendMessage({ type: 'DELETE_SMART_PROFILE', index });
  if (result) {
    currentSmartProfiles = result;
    renderSmartProfiles();
    showStatus('Perfil removido.', 'success');
  }
}

// --- Supabase Config ---
const syncWarningEl = document.getElementById('syncWarning');
const sbUrlInput = document.getElementById('sbUrl');
const sbKeyInput = document.getElementById('sbKey');
const btnSaveConfig = document.getElementById('btnSaveConfig');
const btnTestConfig = document.getElementById('btnTestConfig');
const btnClearConfig = document.getElementById('btnClearConfig');
const configStatusEl = document.getElementById('configStatus');

let configTimeout = null;

function showConfigStatus(message, type) {
  configStatusEl.textContent = message;
  configStatusEl.className = `status ${type}`;
  configStatusEl.style.opacity = '1';
  if (configTimeout) clearTimeout(configTimeout);
  configTimeout = setTimeout(() => {
    configStatusEl.style.opacity = '0';
  }, 3000);
}

function updateWarningVisibility(configured) {
  if (configured) {
    syncWarningEl.classList.remove('visible');
  } else {
    syncWarningEl.classList.add('visible');
  }
}

async function loadSupabaseConfig() {
  const result = await sendMessage({ type: 'GET_SUPABASE_CONFIG' });
  if (result?.configured) {
    sbUrlInput.value = result.url || '';
    sbKeyInput.value = '';
    sbKeyInput.placeholder = result.maskedKey || '••••••••';
    updateWarningVisibility(true);
  } else {
    sbUrlInput.value = '';
    sbKeyInput.value = '';
    sbKeyInput.placeholder = 'eyJhbGci...';
    updateWarningVisibility(false);
  }
}

btnSaveConfig.addEventListener('click', async () => {
  const url = sbUrlInput.value.trim();
  const key = sbKeyInput.value.trim();

  if (!url || !key) {
    showConfigStatus('Preencha URL e Key.', 'error');
    return;
  }
  if (!url.startsWith('https://')) {
    showConfigStatus('URL deve começar com https://', 'error');
    return;
  }

  btnSaveConfig.disabled = true;
  const result = await sendMessage({ type: 'SAVE_SUPABASE_CONFIG', url, key });
  btnSaveConfig.disabled = false;

  if (result?.success) {
    showConfigStatus('Configuração salva!', 'success');
    await loadSupabaseConfig();
  } else {
    showConfigStatus(`Erro: ${result?.error || 'Falha ao salvar'}`, 'error');
  }
});

btnTestConfig.addEventListener('click', async () => {
  btnTestConfig.disabled = true;
  showConfigStatus('Testando conexão...', 'success');
  const result = await sendMessage({ type: 'TEST_SUPABASE' });
  btnTestConfig.disabled = false;

  if (result?.success) {
    showConfigStatus('Conexão OK! Supabase acessível.', 'success');
  } else {
    showConfigStatus(`Falha: ${result?.error || 'Erro desconhecido'}`, 'error');
  }
});

btnClearConfig.addEventListener('click', async () => {
  if (!confirm('Limpar configuração Supabase? Os dados locais não serão afetados.')) return;
  btnClearConfig.disabled = true;
  const result = await sendMessage({ type: 'CLEAR_SUPABASE_CONFIG' });
  btnClearConfig.disabled = false;

  if (result?.success) {
    showConfigStatus('Configuração limpa.', 'success');
    sbUrlInput.value = '';
    sbKeyInput.value = '';
    sbKeyInput.placeholder = 'eyJhbGci...';
    updateWarningVisibility(false);
  }
});

// Detectar mudanças externas nas credenciais
chrome.storage.onChanged.addListener((changes) => {
  if (changes['__supabaseUrl'] || changes['__supabaseKey']) {
    loadSupabaseConfig();
  }
});

// --- Sync / Export / Import ---
const syncStatusEl = document.getElementById('syncStatus');
const syncTextarea = document.getElementById('syncTextarea');
const btnSyncPush = document.getElementById('btnSyncPush');
const btnSyncPull = document.getElementById('btnSyncPull');
const btnExport = document.getElementById('btnExport');
const btnImport = document.getElementById('btnImport');

let syncTimeout = null;

function showSyncStatus(message, type) {
  syncStatusEl.textContent = message;
  syncStatusEl.className = `status ${type}`;
  syncStatusEl.style.opacity = '1';
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncStatusEl.style.opacity = '0';
  }, 3000);
}

function setSyncButtonsDisabled(disabled) {
  btnSyncPush.disabled = disabled;
  btnSyncPull.disabled = disabled;
  btnExport.disabled = disabled;
  btnImport.disabled = disabled;
}

btnSyncPull.addEventListener('click', async () => {
  setSyncButtonsDisabled(true);
  showSyncStatus('Puxando configurações...', 'success');
  const result = await sendMessage({ type: 'SYNC_PULL' });
  setSyncButtonsDisabled(false);
  if (result?.success) {
    showSyncStatus(`Configurações puxadas com sucesso! (${result.timestamp})`, 'success');
    // Recarrega UI para refletir dados puxados
    loadDefaultZoom();
    loadPresets();
  } else {
    showSyncStatus(`Erro: ${result?.error || 'Desconhecido'}`, 'error');
  }
});

btnSyncPush.addEventListener('click', async () => {
  setSyncButtonsDisabled(true);
  showSyncStatus('Sincronizando...', 'success');
  const result = await sendMessage({ type: 'SYNC_PUSH' });
  setSyncButtonsDisabled(false);
  if (result?.success) {
    showSyncStatus(`Sincronizado com sucesso! (${result.timestamp})`, 'success');
  } else {
    showSyncStatus(`Erro: ${result?.error || 'Desconhecido'}`, 'error');
  }
});

btnExport.addEventListener('click', async () => {
  setSyncButtonsDisabled(true);
  showSyncStatus('Exportando...', 'success');
  const result = await sendMessage({ type: 'EXPORT_DATA' });
  setSyncButtonsDisabled(false);
  if (result?.success) {
    syncTextarea.value = result.data;
    syncTextarea.select();
    showSyncStatus('Dados exportados! Copie o conteúdo acima.', 'success');
  } else {
    showSyncStatus(`Erro: ${result?.error || 'Export failed'}`, 'error');
  }
});

btnImport.addEventListener('click', async () => {
  const base64 = syncTextarea.value.trim();
  if (!base64) {
    showSyncStatus('Cole os dados exportados no campo acima.', 'error');
    return;
  }
  setSyncButtonsDisabled(true);
  showSyncStatus('Importando...', 'success');
  const result = await sendMessage({ type: 'IMPORT_DATA', base64 });
  setSyncButtonsDisabled(false);
  if (result?.success) {
    showSyncStatus('Dados importados com sucesso!', 'success');
    // Recarrega UI
    loadDefaultZoom();
    loadPresets();
  } else {
    showSyncStatus(`Erro: ${result?.error || 'Import failed'}`, 'error');
  }
});

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

// Carregar ao iniciar
loadDefaultZoom();
loadPresets();
loadSmartProfiles();
loadSupabaseConfig();
