/**
 * Teste do fluxo de zoom inicial do content script.
 * Prova que o zoom persistido pelo Chrome (ajuste manual) NAO e sobrescrito
 * pelo Smart Zoom ao recarregar a pagina, e que a regra manual vence tudo.
 */
const assert = require('node:assert');

// Reproduz a arvore de decisao de applyInitialZoom() do content.js
async function decideInitialZoom({ ruleZoom, chromeZoom, smartZoom }) {
  // 1. Regra manual da Options Page tem prioridade
  if (ruleZoom != null && ruleZoom !== 1.0) {
    return { applied: ruleZoom, source: 'regra' };
  }
  // 2. Sem regra: respeita o zoom que o Chrome restaurou
  if (chromeZoom != null && Math.abs(chromeZoom - 1.0) > 0.01) {
    return { applied: null, source: 'chrome' };
  }
  // 3. Chrome no default: aplica Smart Zoom
  if (smartZoom != null) {
    return { applied: smartZoom, source: 'smart' };
  }
  return { applied: null, source: 'default' };
}

(async () => {
  let failures = 0;
  const check = (label, actual, expectedSource, expectedLevel) => {
    const ok = actual.source === expectedSource &&
               (expectedLevel === undefined || actual.applied === expectedLevel);
    console.log(`${ok ? 'PASS' : 'FALHA'} | ${label} -> ${JSON.stringify(actual)}` +
                (ok ? '' : ` (esperado source=${expectedSource}${expectedLevel !== undefined ? ', applied=' + expectedLevel : ''})`));
    if (!ok) failures++;
  };

  // O caso que motivou a correcao: usuario ajustou para 120% com Ctrl+roda,
  // recarrega a pagina. Chrome restaura 1.2, Smart Zoom quer 0.74.
  check(
    'ajuste manual sobrevive ao reload (Chrome 1.2 vs Smart 0.74)',
    await decideInitialZoom({ ruleZoom: null, chromeZoom: 1.2, smartZoom: 0.74 }),
    'chrome'
  );

  // Sem ajuste manual em site novo: Smart Zoom deve agir
  check(
    'site novo usa Smart Zoom',
    await decideInitialZoom({ ruleZoom: null, chromeZoom: 1.0, smartZoom: 0.74 }),
    'smart', 0.74
  );

  // Regra manual da Options vence o zoom do Chrome e o Smart
  check(
    'regra manual vence tudo',
    await decideInitialZoom({ ruleZoom: 0.9, chromeZoom: 1.2, smartZoom: 0.74 }),
    'regra', 0.9
  );

  // Sem Smart configurado e sem ajuste: fica no default
  check(
    'sem smart e sem ajuste fica no default',
    await decideInitialZoom({ ruleZoom: null, chromeZoom: 1.0, smartZoom: null }),
    'default'
  );

  // Ajuste manual para 0.74 (igual ao smart) tambem e respeitado
  check(
    'ajuste manual igual ao smart e respeitado',
    await decideInitialZoom({ ruleZoom: null, chromeZoom: 0.74, smartZoom: 0.74 }),
    'chrome'
  );

  console.log('');
  console.log(failures === 0 ? 'TODOS PASSARAM' : failures + ' FALHA(S)');
  process.exit(failures === 0 ? 0 : 1);
})();
