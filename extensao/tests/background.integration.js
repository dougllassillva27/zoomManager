/**
 * Teste de integracao do background com um mock de chrome APIs.
 * Executa o background.js real num sandbox vm, simulando o service worker.
 * Objetivo: provar que Ctrl+roda (APPLY_ONLY) nao cria regra e que a
 * Options (SAVE_ZOOM com pattern) cria, e que GET_ZOOM aplica a regra.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert');

const EXT = path.resolve(__dirname, '..');

// --- Mock de chrome.storage.sync ---
function makeStorage() {
  let data = {};
  const changeListeners = [];
  return {
    _dump: () => JSON.parse(JSON.stringify(data)),
    _onChanged: (fn) => changeListeners.push(fn),
    _fire(changes) {
      if (Object.keys(changes).length === 0) return;
      for (const fn of changeListeners) fn(changes, 'sync');
    },
    async get(keys) {
      if (keys === null || keys === undefined) return JSON.parse(JSON.stringify(data));
      if (typeof keys === 'string') {
        return { [keys]: data[keys] };
      }
      if (Array.isArray(keys)) {
        const out = {};
        for (const k of keys) if (k in data) out[k] = data[k];
        return out;
      }
      const out = {};
      for (const k of Object.keys(keys)) out[k] = k in data ? data[k] : keys[k];
      return out;
    },
    async set(obj) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: data[k], newValue: v };
      }
      Object.assign(data, JSON.parse(JSON.stringify(obj)));
      this._fire(changes);
    },
    async remove(keys) {
      const changes = {};
      for (const k of (Array.isArray(keys) ? keys : [keys])) {
        if (k in data) changes[k] = { oldValue: data[k], newValue: undefined };
        delete data[k];
      }
      this._fire(changes);
    },
  };
}

function buildSandbox() {
  const sync = makeStorage();
  const session = makeStorage();
  const local = makeStorage();
  const zoomState = new Map();   // tabId -> level
  const messages = [];
  const listeners = { message: [], zoomChange: [], updated: [], installed: [], alarm: [], command: [], clicked: [] };

  const chrome = {
    storage: {
      sync, session, local,
      onChanged: {
        addListener: (fn) => {
          // Registra no storage.sync para simular o evento real
          sync._onChanged(fn);
          session._onChanged(fn);
          local._onChanged(fn);
        }
      },
    },
    runtime: {
      onMessage: { addListener: (fn) => listeners.message.push(fn) },
      onInstalled: { addListener: (fn) => listeners.installed.push(fn) },
      openOptionsPage: () => {},
      lastError: null,
    },
    tabs: {
      async setZoom(tabId, level) { zoomState.set(tabId, level); },
      async getZoom(tabId) { return zoomState.get(tabId) ?? 1; },
      async get(tabId) { return { id: tabId, url: 'https://exemplo.com/a/b' }; },
      async query() { return [{ id: 1, url: 'https://exemplo.com/a/b' }]; },
      onRemoved: { addListener: () => {} },
      onZoomChange: { addListener: (fn) => listeners.zoomChange.push(fn) },
      onUpdated: { addListener: (fn) => listeners.updated.push(fn) },
    },
    contextMenus: {
      removeAll: async () => {},
      create: () => {},
      onClicked: { addListener: (fn) => listeners.clicked.push(fn) },
    },
    alarms: {
      create: () => {},
      onAlarm: { addListener: (fn) => listeners.alarm.push(fn) },
    },
    commands: { onCommand: { addListener: (fn) => listeners.command.push(fn) } },
  };

  const sandbox = {
    chrome,
    console: { log: () => {}, error: () => {}, warn: () => {} },
    fetch: async () => { throw new Error('sem rede no teste'); },
    URL, TextEncoder, TextDecoder, Blob, Response, Uint8Array, Math, JSON, Date, RegExp, Set, Map,
    setTimeout, clearTimeout, Promise, btoa, atob,
    CompressionStream: class { },
    DecompressionStream: class { },
    importScripts: (...files) => {
      for (const f of files) {
        const code = fs.readFileSync(path.join(EXT, f), 'utf8');
        vm.runInContext(code, sandbox, { filename: f });
      }
    },
    module: undefined,
    __result: { zoomState, sync, listeners, messages },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

/** Envia mensagem e resolve a resposta como o Chrome faz. */
function sendMessage(sandbox, message, sender = {}) {
  return new Promise((resolve, reject) => {
    const listener = sandbox.__result.listeners.message[0];
    if (!listener) return reject(new Error('listener nao registrado'));
    const timer = setTimeout(() => reject(new Error('sem resposta: ' + message.type)), 2000);
    listener(message, sender, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

(async () => {
  const sb = buildSandbox();
  const bg = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
  vm.runInContext(bg, sb, { filename: 'background.js' });

  // Aguarda a limpeza/migracao assincrona do startup
  await new Promise(r => setTimeout(r, 50));

  const sync = sb.__result.sync;
  const zoomState = sb.__result.zoomState;
  let failures = 0;
  function check(label, cond, extra = '') {
    if (cond) { console.log('PASS | ' + label); }
    else { console.log('FALHA | ' + label + (extra ? ' -> ' + extra : '')); failures++; }
  }

  // --- 1. Ctrl+roda aplica sem gravar regra ---
  await sendMessage(sb, { type: 'APPLY_ONLY', level: 1.2 }, { tab: { id: 7, url: 'https://exemplo.com/a/b' } });
  const afterApply = sync._dump();
  check('APPLY_ONLY aplica zoom na aba', zoomState.get(7) === 1.2, String(zoomState.get(7)));
  check('APPLY_ONLY nao cria __urlRules', afterApply['__urlRules'] === undefined,
        JSON.stringify(afterApply['__urlRules']));
  check('APPLY_ONLY nao cria chave por hostname', !('exemplo.com' in afterApply));

  // --- 2. SAVE_ZOOM sem pattern e ignorado (ajuste manual) ---
  const r1 = await sendMessage(sb, { type: 'SAVE_ZOOM', url: 'https://exemplo.com/a/b', level: 1.2 });
  check('SAVE_ZOOM sem pattern retorna false', r1 === false, String(r1));
  check('SAVE_ZOOM sem pattern nao grava regra', sync._dump()['__urlRules'] === undefined);

  // --- 3. Options grava com pattern explicito ---
  const r2 = await sendMessage(sb, {
    type: 'SAVE_ZOOM',
    url: 'https://exemplo.com/',
    pattern: 'exemplo.com/**',
    level: 0.9,
  });
  check('SAVE_ZOOM com pattern grava', r2 === 0.9, String(r2));
  const rules = sync._dump()['__urlRules'] ?? [];
  check('regra criada com pattern correto', rules.length === 1 && rules[0].pattern === 'exemplo.com/**',
        JSON.stringify(rules));

  // --- 4. GET_ZOOM aplica a regra (antes era ignorada pelo gate specificity>1) ---
  const g1 = await sendMessage(sb, { type: 'GET_ZOOM', url: 'https://exemplo.com/a/b' });
  check('GET_ZOOM aplica a regra', g1 === 0.9, String(g1));

  // --- 5. Regra antiga hostname/* tambem e aplicada ---
  await sync.set({ __urlRules: [{ pattern: 'antigo.com/*', level: 0.8, specificity: 1 }] });
  sb.__result.listeners.message.length; // cache invalida por onChanged (nao mockado): força reload
  const g2 = await sendMessage(sb, { type: 'GET_ZOOM', url: 'https://antigo.com/a/b/c' });
  check('regra legada hostname/* e aplicada em path profundo', g2 === 0.8, String(g2));

  // --- 6. GET_ZOOM sem regra cai no default ---
  const g3 = await sendMessage(sb, { type: 'GET_ZOOM', url: 'https://semregra.com/x' });
  check('GET_ZOOM sem regra usa default', g3 === 1.0, String(g3));

  // --- 7. DELETE_URL_RULE remove so a regra pedida ---
  await sync.set({ __urlRules: [
    { pattern: 'a.com/**', level: 0.9, specificity: 1 },
    { pattern: 'b.com/**', level: 1.1, specificity: 1 },
  ] });
  const d1 = await sendMessage(sb, { type: 'DELETE_URL_RULE', pattern: 'a.com/**' });
  const left = sync._dump()['__urlRules'];
  check('DELETE_URL_RULE retorna true', d1 === true, String(d1));
  check('DELETE_URL_RULE removeu so a regra alvo',
        left.length === 1 && left[0].pattern === 'b.com/**', JSON.stringify(left));

  // --- 8. Limpeza remove chaves hostname sem tocar nas __ ---
  await sync.set({ 'lixo.com': 0.74, 'outro.com': 0.9, __defaultZoom: 0.74 });
  // dispara o startup de novo nao e possivel; testa a funcao via novo sandbox
  const sb2 = buildSandbox();
  sb2.__result.sync.set({ 'lixo.com': 0.74, 'outro.com': 0.9, __defaultZoom: 0.74, __urlRules: [] });
  vm.runInContext(bg, sb2, { filename: 'background.js' });
  await new Promise(r => setTimeout(r, 80));
  const cleaned = sb2.__result.sync._dump();
  check('limpeza remove chaves hostname', !('lixo.com' in cleaned) && !('outro.com' in cleaned),
        JSON.stringify(Object.keys(cleaned)));
  check('limpeza preserva chaves __', '__defaultZoom' in cleaned && '__urlRules' in cleaned);

  console.log('');
  console.log(failures === 0 ? 'TODOS OS TESTES DE INTEGRACAO PASSARAM' : failures + ' FALHA(S)');
  process.exit(failures === 0 ? 0 : 1);
})().catch(err => {
  console.error('ERRO NO HARNESS:', err);
  process.exit(1);
});
