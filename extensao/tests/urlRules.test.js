/**
 * Testes das regras de URL (matching puro, sem chrome APIs).
 * Executar: node --test extensao/tests/urlRules.test.js
 */
const test = require('node:test');
const assert = require('node:assert');

const {
  globToRegex,
  calculateSpecificity,
  getUrlMatchTarget,
  matchUrl,
  normalizePattern,
} = require('../urlRules.js');

test('globToRegex: host/* cobre o site inteiro, inclusive paths profundos', () => {
  const re = globToRegex('exemplo.com/*');
  assert.equal(re.test('exemplo.com'), true, 'home');
  assert.equal(re.test('exemplo.com/artigo'), true, 'um nivel');
  assert.equal(re.test('exemplo.com/a/b'), true, 'dois niveis');
  assert.equal(re.test('exemplo.com/a/b/c/d'), true, 'quatro niveis');
  assert.equal(re.test('outro.com/a'), false, 'outro host nao casa');
});

test('globToRegex: host/** continua cobrindo tudo', () => {
  const re = globToRegex('vps.exemplo.com.br/**');
  assert.equal(re.test('vps.exemplo.com.br'), true);
  assert.equal(re.test('vps.exemplo.com.br/painel/logs'), true);
});

test('globToRegex: * no meio do padrao limita a um segmento', () => {
  const re = globToRegex('site.com/*/page');
  assert.equal(re.test('site.com/a/page'), true, 'um segmento no meio');
  assert.equal(re.test('site.com/a/b/page'), false, 'dois segmentos no meio nao casam');
});

test('globToRegex: ? casa exatamente um caractere', () => {
  const re = globToRegex('site.com/v?deo');
  assert.equal(re.test('site.com/video'), true);
  assert.equal(re.test('site.com/vdeo'), false);
});

test('calculateSpecificity: conta segmentos literais', () => {
  assert.equal(calculateSpecificity('exemplo.com/*'), 1);
  assert.equal(calculateSpecificity('exemplo.com/a/b'), 3);
  assert.equal(calculateSpecificity('vps.exemplo.com.br/**'), 1);
});

test('getUrlMatchTarget: inclui porta e remove barra final', () => {
  assert.equal(getUrlMatchTarget('https://site.com/'), 'site.com');
  assert.equal(getUrlMatchTarget('https://site.com/a/b/'), 'site.com/a/b');
  assert.equal(getUrlMatchTarget('http://10.10.0.1:8787/dashboard'), '10.10.0.1:8787/dashboard');
  assert.equal(getUrlMatchTarget('url invalida'), '');
});

test('matchUrl: regra host/* (gravada pelo modelo antigo) e encontrada', () => {
  const rules = [{ pattern: 'exemplo.com/*', level: 0.9, specificity: 1 }];
  const m = matchUrl('https://exemplo.com/artigo', rules);
  assert.ok(m, 'deveria casar');
  assert.equal(m.level, 0.9);
});

test('matchUrl: regra mais especifica vence', () => {
  const rules = [
    { pattern: 'youtube.com/*', level: 0.9, specificity: 1 },
    { pattern: 'youtube.com/watch/**', level: 1.15, specificity: 2 },
  ];
  const m = matchUrl('https://youtube.com/watch?v=1', rules);
  assert.equal(m.pattern, 'youtube.com/watch/**');
});

test('matchUrl: overrideSmartZoom vence mesmo com menor especificidade', () => {
  const rules = [
    { pattern: 'site.com/path/deep', level: 1.2, specificity: 3 },
    { pattern: 'site.com/*', level: 0.8, specificity: 1, overrideSmartZoom: true },
  ];
  const m = matchUrl('https://site.com/path/deep', rules);
  assert.equal(m.pattern, 'site.com/*');
});

test('matchUrl: sem regras retorna null (nao 1.0)', () => {
  assert.equal(matchUrl('https://exemplo.com/', []), null);
  assert.equal(matchUrl('https://exemplo.com/', null), null);
});

test('matchUrl: regra de porta casa URL com porta', () => {
  const rules = [{ pattern: '10.10.0.1:8787/**', level: 0.9, specificity: 1 }];
  assert.ok(matchUrl('http://10.10.0.1:8787/dashboard', rules));
});

test('normalizePattern: host puro vira /**', () => {
  assert.equal(normalizePattern('https://www.facebook.com/'), 'www.facebook.com/**');
  assert.equal(normalizePattern('facebook.com'), 'facebook.com/**');
});

test('normalizePattern: path preservado e sem barra final', () => {
  assert.equal(normalizePattern('https://github.com/user/repo'), 'github.com/user/repo');
  assert.equal(normalizePattern('https://site.com/a/b/'), 'site.com/a/b');
});

test('normalizePattern: query e hash removidos', () => {
  assert.equal(normalizePattern('https://site.com/a?x=1#top'), 'site.com/a');
});

test('normalizePattern: glob existente preservado', () => {
  assert.equal(normalizePattern('youtube.com/watch/**'), 'youtube.com/watch/**');
});
