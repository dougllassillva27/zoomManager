# Design: Desativar neste site (v5.1.0)

> Feature: suspender o funcionamento da extensão em um domínio, temporariamente,
> até fechar todas as abas do site ou fechar o navegador.

## Resumo do Entendimento

- Botão "Desativar neste site" no popup, abaixo de "Resetar", como toggle bidirecional
  ("Ativar neste site" quando desativado).
- Escopo: domínio raiz + todos os subdomínios (`app.docs.ex.com` → `ex.com`).
- Ao desativar: zoom da aba atual reseta imediatamente para 100% (literal 1.0).
- Enquanto desativado: Ctrl+Roda, Smart Zoom, presets, auto-apply e restauração em
  navegação ficam bloqueados. Presets persistidos NÃO são apagados, só ignorados.
- Expiração: o que vier primeiro — todas as abas do domínio fechadas OU navegador fechado.
- Estado de sessão: nada persiste entre sessões, nada sincroniza com Supabase.

## Premissas

- **[A1]** Estado em `chrome.storage.session` (sobrevive a restart do service worker MV3,
  limpa automaticamente ao fechar o navegador). Permission `storage` já cobre.
- **[A2]** Extensão passiva quando desativada: não intercepta Ctrl+Roda (o zoom nativo do
  navegador volta ao comportamento padrão) e não aplica nada.
- **[A3]** Ao desativar, o reset usa literal 100% (1.0), independente do nível padrão
  customizado nas Options.
- **[A4]** `file://` cobre a origem inteira (chave `file://`). Viewer PDF nativo
  (`chrome-extension://mhjfb...`) fica fora do escopo; botão oculto em abas PDF.
- **[A5]** Domínio raiz derivado por heurística com lista curta de TLDs compostos
  (`com.br`, `co.uk`, etc.). Suficiente para uso pessoal; não é uma PSL completa.
- **[A6]** Abas abertas antes de instalar/atualizar a extensão não são registradas no
  contador do domínio (content script só roda em páginas carregadas após o update).

## Decision Log

| # | Decisão | Alternativas consideradas | Motivo |
|---|---------|---------------------------|--------|
| 1 | Estado em `chrome.storage.session` | Memória do service worker; `chrome.storage.local` com limpeza manual | Session storage é nativa MV3, sobrevive a restart do SW e limpa sozinha ao fechar o navegador — os dois critérios de expiração de graça |
| 2 | Contador de abas por domínio via `REGISTER_TAB` do content script + `tabs.onRemoved` | Permission `tabs` + `chrome.tabs.query` periódico | Não adiciona permission; content script já roda em `<all_urls>`; expiração reage a evento, sem polling |
| 3 | Módulo novo `disabledSites.js` via `importScripts` | Tudo inline em `background.js` | Regra de modularização do projeto; funções puras testáveis em Node |
| 4 | Heurística de domínio raiz com lista de TLDs compostos | Biblioteca PSL completa | YAGNI — uso pessoal; lista cobre `.com.br` e casos comuns |
| 5 | Reset ao desativar usa literal 1.0 (100%) | `__defaultZoom` das Options | Escolha do usuário: desativar deve devolver o site ao zoom neutro do navegador, mesmo com default customizado (revisão 2026-08-06) |
| 6 | Sem badge no ícone | Badge "OFF" | Escopo fechado; estado visível no toggle do popup |

## Arquitetura

```
popup.js ──TOGGLE_SITE_DISABLED──▶ background.js ──▶ storage.session.__disabledSites
popup.js ──IS_SITE_DISABLED──────▶        │
content.js ─REGISTER_TAB─────────▶        ├── __domainTabs (abas por domínio)
content.js ◀─storage.onChanged──── session └── __tabDomains (domínio por aba)
```

- `disabledSites.js`: `getRootDomain`, `getDisableKey`, `isSiteDisabled`,
  `setSiteDisabled`, `registerTabDomain`, `unregisterTab`.
- Gates no background: `APPLY_ZOOM`, `SAVE_ZOOM`, `APPLY_PRESET`, `APPLY_SMART_ZOOM`,
  `tabs.onUpdated` (restore), presets do menu de contexto.
- Gate no content: handler `wheel` e `applyInitialZoom` (flag local `siteDisabled`,
  atualizada via `storage.onChanged` da área `session`).
- Expiração: `unregisterTab` remove a chave de `__disabledSites` quando o domínio fica
  sem abas; fechar o navegador limpa a session storage inteira.

## Testes

- `extensao/tests/disabledSites.test.js` (node:test): extração de domínio raiz,
  TLDs compostos, `file://`, URLs inválidas. Rodar:
  `node --test "extensao/tests/**/*.test.js"`

## Riscos conhecidos

- Heurística de TLD falha em TLDs compostos fora da lista (aceito, [A5]).
- Abas pré-update não contam para expiração ([A6]).
