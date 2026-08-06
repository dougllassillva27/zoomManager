/**
 * Testes das funções puras de disabledSites.js (domínio raiz e chave de desativação).
 * Executar: node --test extensao/tests/
 */

const test = require('node:test');
const assert = require('node:assert');

const { getRootDomain, getDisableKey } = require('../disabledSites.js');

test('getRootDomain: subdomínios colapsam para o domínio raiz', () => {
  assert.strictEqual(getRootDomain('app.docs.exemplo.com'), 'exemplo.com');
  assert.strictEqual(getRootDomain('www.google.com'), 'google.com');
});

test('getRootDomain: domínio já raiz permanece igual', () => {
  assert.strictEqual(getRootDomain('exemplo.com'), 'exemplo.com');
});

test('getRootDomain: TLDs compostos mantêm 3 labels', () => {
  assert.strictEqual(getRootDomain('www.loja.com.br'), 'loja.com.br');
  assert.strictEqual(getRootDomain('app.site.co.uk'), 'site.co.uk');
});

test('getRootDomain: normaliza maiúsculas', () => {
  assert.strictEqual(getRootDomain('App.Exemplo.COM'), 'exemplo.com');
});

test('getRootDomain: localhost e IP não têm subdomínio', () => {
  assert.strictEqual(getRootDomain('localhost'), 'localhost');
  assert.strictEqual(getRootDomain('192.168.0.10'), '192.168.0.10');
});

test('getRootDomain: hostname vazio retorna vazio', () => {
  assert.strictEqual(getRootDomain(''), '');
});

test('getDisableKey: URL http usa domínio raiz', () => {
  assert.strictEqual(getDisableKey('https://app.docs.exemplo.com/pagina?q=1'), 'exemplo.com');
});

test('getDisableKey: file:// cobre a origem inteira', () => {
  assert.strictEqual(getDisableKey('file:///C:/docs/nota.pdf'), 'file://');
});

test('getDisableKey: URL inválida retorna vazio', () => {
  assert.strictEqual(getDisableKey(''), '');
  assert.strictEqual(getDisableKey('não é url'), '');
});
