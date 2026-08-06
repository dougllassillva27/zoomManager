/**
 * Native Zoom Manager - Desativação por Site (estado de sessão)
 *
 * Controla a feature "Desativar neste site":
 * - Estado em chrome.storage.session (limpa ao fechar o navegador).
 * - Escopo: domínio raiz + todos subdomínios.
 * - Expiração antecipada: quando todas as abas do domínio são fechadas.
 *
 * Importado pelo service worker via importScripts. As funções puras
 * (getRootDomain/getDisableKey) são exportadas para testes em Node.
 */

const DISABLED_SITES_KEY = '__disabledSites';
const DOMAIN_TABS_KEY = '__domainTabs';
const TAB_DOMAINS_KEY = '__tabDomains';

/** TLDs compostos que exigem 3 labels para formar o domínio raiz */
const TWO_PART_TLDS = [
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'art.br', 'blog.br', 'dev.br',
  'co.uk', 'org.uk', 'ac.uk',
  'com.pt', 'com.au', 'net.au', 'org.au',
  'co.jp', 'ne.jp',
  'com.mx', 'com.ar', 'co.in', 'com.sg', 'com.hk', 'co.nz', 'com.tr'
];

/**
 * Extrai o domínio raiz (registrável) de um hostname.
 * app.docs.exemplo.com -> exemplo.com; site.com.br -> site.com.br.
 * @param {string} hostname
 * @returns {string} domínio raiz em minúsculas, ou string vazia
 */
function getRootDomain(hostname) {
  if (!hostname) return '';
  const host = hostname.toLowerCase();
  // localhost e IPs não têm subdomínios
  if (host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join('.');
  const parts = TWO_PART_TLDS.includes(lastTwo) ? 3 : 2;
  return labels.slice(-parts).join('.');
}

/**
 * Retorna a chave de desativação de uma URL (domínio raiz, ou 'file://' para arquivos locais).
 * @param {string} url
 * @returns {string} chave ou string vazia se URL inválida
 */
function getDisableKey(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return 'file://';
    return getRootDomain(parsed.hostname);
  } catch {
    return '';
  }
}

/**
 * Verifica se o site da URL está desativado.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function isSiteDisabled(url) {
  const key = getDisableKey(url);
  if (!key) return false;
  const result = await chrome.storage.session.get(DISABLED_SITES_KEY);
  const sites = result[DISABLED_SITES_KEY] ?? {};
  return !!sites[key];
}

/**
 * Ativa/desativa um site (chave = domínio raiz ou 'file://').
 * @param {string} key
 * @param {boolean} disable
 */
async function setSiteDisabled(key, disable) {
  if (!key) return;
  const result = await chrome.storage.session.get(DISABLED_SITES_KEY);
  const sites = result[DISABLED_SITES_KEY] ?? {};
  if (disable) {
    sites[key] = true;
  } else {
    delete sites[key];
  }
  await chrome.storage.session.set({ [DISABLED_SITES_KEY]: sites });
}

/**
 * Registra a aba no domínio da URL. Se a aba navegou para outro domínio,
 * remove do anterior; domínio anterior sem abas expira a desativação.
 * @param {number} tabId
 * @param {string} url
 */
async function registerTabDomain(tabId, url) {
  const key = getDisableKey(url);
  if (!key || tabId == null) return;
  const result = await chrome.storage.session.get([DISABLED_SITES_KEY, DOMAIN_TABS_KEY, TAB_DOMAINS_KEY]);
  const sites = result[DISABLED_SITES_KEY] ?? {};
  const domainTabs = result[DOMAIN_TABS_KEY] ?? {};
  const tabDomains = result[TAB_DOMAINS_KEY] ?? {};

  const prevKey = tabDomains[tabId];
  if (prevKey && prevKey !== key) {
    if (domainTabs[prevKey]) {
      delete domainTabs[prevKey][tabId];
      if (Object.keys(domainTabs[prevKey]).length === 0) {
        delete domainTabs[prevKey];
        // Domínio ficou sem abas: desativação expira
        delete sites[prevKey];
      }
    }
  }

  domainTabs[key] = domainTabs[key] ?? {};
  domainTabs[key][tabId] = true;
  tabDomains[tabId] = key;

  await chrome.storage.session.set({
    [DISABLED_SITES_KEY]: sites,
    [DOMAIN_TABS_KEY]: domainTabs,
    [TAB_DOMAINS_KEY]: tabDomains
  });
}

/**
 * Remove a aba do registro. Se o domínio ficar sem abas, a desativação expira.
 * @param {number} tabId
 */
async function unregisterTab(tabId) {
  if (tabId == null) return;
  const result = await chrome.storage.session.get([DISABLED_SITES_KEY, DOMAIN_TABS_KEY, TAB_DOMAINS_KEY]);
  const sites = result[DISABLED_SITES_KEY] ?? {};
  const domainTabs = result[DOMAIN_TABS_KEY] ?? {};
  const tabDomains = result[TAB_DOMAINS_KEY] ?? {};

  const key = tabDomains[tabId];
  delete tabDomains[tabId];
  if (key && domainTabs[key]) {
    delete domainTabs[key][tabId];
    if (Object.keys(domainTabs[key]).length === 0) {
      delete domainTabs[key];
      // Todas as abas do domínio fechadas: desativação expira
      delete sites[key];
    }
  }

  await chrome.storage.session.set({
    [DISABLED_SITES_KEY]: sites,
    [DOMAIN_TABS_KEY]: domainTabs,
    [TAB_DOMAINS_KEY]: tabDomains
  });
}

// Export para testes em Node (inerte no service worker)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getRootDomain, getDisableKey, TWO_PART_TLDS };
}
