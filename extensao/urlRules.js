/**
 * Native Zoom Manager - Regras de URL (matching puro)
 *
 * Fonte unica das regras de glob usadas pelo background (aplicacao) e pela
 * options page (validacao da UI). Importado pelo service worker via
 * importScripts. As funcoes sao exportadas para testes em Node.
 *
 * Semantica do glob:
 * - `*`  casa um segmento (pode ser vazio). `host/*` cobre o site inteiro.
 * - `**` casa qualquer coisa, inclusive `/`.
 * - `?`  casa um caractere qualquer (exceto `/`).
 */

/**
 * Converte padrao glob para RegExp.
 * @param {string} pattern - Padrao glob (ex: "google.com/maps/**")
 * @returns {RegExp}
 */
function globToRegex(pattern) {
  let regexStr = '';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === '*') {
      const isDouble = pattern[i + 1] === '*';
      const consumed = isDouble ? 2 : 1;
      // `*` ou `**` no fim do padrao cobre o site inteiro, inclusive paths
      // profundos. No meio do padrao, `*` vale por um segmento.
      const isTrailing = i + consumed >= pattern.length;
      const precededBySlash = regexStr.endsWith('/');

      if (isDouble || isTrailing) {
        if (precededBySlash) {
          regexStr = regexStr.slice(0, -1) + '(?:/.*)?';
        } else {
          regexStr += '.*';
        }
        i += consumed;
        // Pula a / que segue o glob (ja esta coberta)
        if (pattern[i] === '/') i++;
      } else {
        regexStr += '[^/]*';
        i++;
      }
    } else if (ch === '?') {
      regexStr += '[^/]';
      i++;
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      regexStr += '\\' + ch;
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }

  return new RegExp('^' + regexStr + '$');
}

/**
 * Calcula especificidade de um padrao glob.
 * Conta segmentos literais (sem glob) separados por /.
 * @param {string} pattern
 * @returns {number}
 */
function calculateSpecificity(pattern) {
  const segments = pattern.split('/');
  let count = 0;
  for (const seg of segments) {
    if (seg && !seg.includes('*') && !seg.includes('?')) {
      count++;
    }
  }
  return count;
}

/**
 * Extrai hostname+pathname de uma URL para matching contra padroes.
 * @param {string} url
 * @returns {string} hostname+pathname (com porta quando presente)
 */
function getUrlMatchTarget(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, '') || '';
    const host = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    return host + pathname;
  } catch {
    return '';
  }
}

/**
 * Encontra a regra que se aplica a URL.
 * Prioridade: regras com overrideSmartZoom (a mais especifica entre elas),
 * depois a de maior especificidade.
 * @param {string} url - URL completa
 * @param {Array<{pattern: string, level: number, specificity: number}>} rules
 * @returns {{pattern: string, level: number, specificity: number}|null}
 */
function matchUrl(url, rules) {
  const target = getUrlMatchTarget(url);
  if (!target) return null;
  if (!Array.isArray(rules) || rules.length === 0) return null;

  let bestOverride = null;
  let bestOverrideSpecificity = -1;
  let bestMatch = null;
  let bestSpecificity = -1;

  for (const rule of rules) {
    if (!rule || !rule.pattern) continue;
    if (!globToRegex(rule.pattern).test(target)) continue;

    const specificity = rule.specificity ?? calculateSpecificity(rule.pattern);

    if (rule.overrideSmartZoom) {
      if (specificity > bestOverrideSpecificity) {
        bestOverride = rule;
        bestOverrideSpecificity = specificity;
      }
    } else if (specificity > bestSpecificity) {
      bestMatch = rule;
      bestSpecificity = specificity;
    }
  }

  return bestOverride ?? bestMatch;
}

/**
 * Normaliza padrao colado da barra de enderecos.
 * Remove protocolo, query, hash e barra final. Host puro vira host/**.
 * @param {string} raw
 * @returns {string}
 */
function normalizePattern(raw) {
  let p = String(raw || '').trim();
  p = p.replace(/^https?:\/\//, '');
  p = p.split('?')[0].split('#')[0];
  p = p.replace(/\/+$/, '');
  // Host puro (sem /) vira host/** para cobrir o site inteiro
  if (p && !p.includes('/')) {
    p += '/**';
  }
  return p;
}

/**
 * Monta a regra canonica de um host, usada na limpeza de dados legados.
 * @param {string} hostname
 * @param {number} level
 * @returns {{pattern: string, level: number, specificity: number}}
 */
function makeHostRule(hostname, level) {
  const pattern = hostname + '/**';
  return { pattern, level, specificity: 1 };
}

// Export para testes em Node (inerte no service worker)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    globToRegex,
    calculateSpecificity,
    getUrlMatchTarget,
    matchUrl,
    normalizePattern,
    makeHostRule,
  };
}
