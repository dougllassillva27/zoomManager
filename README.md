# Native Zoom Manager

![Status](https://img.shields.io/badge/status-active-success)
![License](https://img.shields.io/badge/license-MIT-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)

**Extensão Chrome MV3 para gerenciamento de zoom nativo por domínio com sincronização multi-dispositivo via Supabase.**

## Visão Geral Técnica

Native Zoom Manager é uma extensão para Google Chrome baseada em Manifest V3 que utiliza a API nativa `chrome.tabs.setZoom` para controlar o nível de zoom do navegador. Diferente de extensões que aplicam zoom via CSS ou JavaScript no DOM, esta extensão opera no nível do próprio navegador, garantindo renderização uniforme de texto, imagens e elementos de página.

A persistência local é realizada via `chrome.storage.sync`, indexada pelo hostname completo (incluindo subdomínios). Para sincronização entre dispositivos, a extensão integra-se opcionalmente ao Supabase via REST API direta (sem SDK), com compressão gzip nativa e fallback automático para storage local quando não configurado. A interface segue design system Dark Amoled OLED com variáveis CSS e tipografia monospace.

Opera inteiramente no contexto do navegador. O backend Supabase é opcional e configurável pelo usuário via Options Page.

## ⚙️ Highlights Técnicos

- Zoom nativo via `chrome.tabs.setZoom` (não CSS hack)
- Persistência automática por hostname via `chrome.storage.sync`
- Sincronização multi-dispositivo via Supabase REST API (opcional)
- Configuração dinâmica de credenciais Supabase pela Options Page
- Export/Import de configurações com compressão gzip nativa + base64
- Auto-sync periódico a cada 60min via `chrome.alarms`
- Interceptação de `Ctrl+Roda do Mouse` com `passive: false` e `capture: true`
- Step de 2% com arredondamento via `roundToStep2()`
- Presets customizáveis (até 8 níveis predefinidos)
- Zoom padrão configurável para reset
- Menu de contexto (botão direito) com presets e reset
- Design system Dark Amoled OLED com CSS variables
- Scrollbar e spinners estilizados via `color-scheme: dark`

## Arquitetura

```txt
Chrome Browser
   │
   ├── Content Script (content.js)
   │     ├── Intercepta Ctrl+Wheel
   │     ├── Restaura zoom ao carregar
   │     └── Envia mensagens ao Background
   │
   ├── Background Service Worker (background.js)
   │     ├── Gerencia chrome.storage.sync/local
   │     ├── Aplica chrome.tabs.setZoom
   │     ├── Handlers: GET/SAVE/RESET/APPLY_ZOOM
   │     ├── Handlers: GET/SAVE/APPLY_PRESETS
   │     ├── Supabase REST Client (dinâmico)
   │     ├── SYNC_PUSH/SYNC_PULL/EXPORT/IMPORT
   │     ├── Auto-sync via chrome.alarms (60min)
   │     ├── Context Menu (presets + reset)
   │     └── Comando Alt+Shift+R (reset)
   │
   ├── Popup UI (popup.html/css/js)
   │     ├── Slider + Input numérico (step 2%)
   │     ├── Grid de presets (2 colunas)
   │     ├── Botão Opções + Reset
   │     └── Sync via onZoomChange + storage.onChanged
   │
   └── Options Page (options.html/css/js)
         ├── Configuração Supabase (URL + Key)
         ├── Zoom padrão customizável
         ├── CRUD de presets
         └── Sync/Export/Import
```

## Estrutura do Projeto

```txt
extensao/
├── manifest.json        # Manifest V3 com permissões e commands
├── background.js        # Service Worker: storage, Supabase, sync, context menu
├── content.js           # Interceptação Ctrl+Wheel, restore on load
├── popup.html           # Estrutura UI do popup
├── popup.css            # Design system Dark Amoled OLED
├── popup.js             # Slider/input, presets, sync listeners
├── options.html         # Página de configurações
├── options.css          # Estilos Dark Amoled para options
├── options.js           # Config Supabase, presets, sync/export/import
├── sql/
│   └── setup.sql        # Schema Supabase (zoom_settings + presets)
└── icons/               # Ícones PNG (16, 32, 48, 128px)
```

## Responsabilidades por Módulo

### `manifest.json`
Declaração Manifest V3 com permissões `storage`, `activeTab`, `contextMenus`, `alarms` e `host_permissions` para Supabase. Content scripts para `<all_urls>`, service worker, popup, options page e comandos de teclado (`Ctrl+Shift+Z` para popup, `Alt+Shift+R` para reset).

### `background.js`
Service Worker responsável por toda a lógica de persistência, sincronização e aplicação de zoom. Expõe handlers via `chrome.runtime.onMessage`: `GET_ZOOM`, `SAVE_ZOOM`, `RESET_ZOOM`, `APPLY_ZOOM`, `GET_PRESETS`, `SAVE_PRESETS`, `APPLY_PRESET`, `SYNC_PUSH`, `SYNC_PULL`, `EXPORT_DATA`, `IMPORT_DATA`, `SAVE_SUPABASE_CONFIG`, `GET_SUPABASE_CONFIG`, `CLEAR_SUPABASE_CONFIG`, `TEST_SUPABASE`. Inclui cliente Supabase dinâmico (lê credenciais do `chrome.storage.local`), auto-sync via `chrome.alarms` a cada 60min, e menu de contexto com presets e reset.

### `content.js`
Content Script injetado em todas as páginas. Intercepta eventos `wheel` com `ctrlKey: true` usando `{ passive: false, capture: true }` para prevenir o comportamento nativo do Chrome. Calcula delta com step de 0.02, aplica clamp entre 0.25 e 5.0, e envia mensagens ao background. Restaura zoom salvo ao carregar via `requestAnimationFrame`.

### `popup.html/css/js`
Interface de ajuste fino com slider (range 26–500%, step 2), input numérico sincronizado, grid de presets em 2 colunas e botão reset. Usa `tabId` explícito obtido via `chrome.tabs.query` para aplicar zoom instantaneamente sem necessidade de recarregar a página. Design system Dark Amoled com CSS variables.

### `options.html/css/js`
Página de configurações acessível via clique direito no ícone da extensão. Seções: Configuração Supabase (URL + Anon Key com teste de conexão), Zoom Padrão para reset (`__defaultZoom`), CRUD de Presets (`__zoomPresets`, max 8), e Sincronização & Backup (Sync Push/Pull, Export/Import com compressão gzip + base64). Banner de aviso visível quando Supabase não está configurado.

## Fluxo Principal da Aplicação

```txt
1. Usuário instala extensão em chrome://extensions (modo desenvolvedor)
2. Content Script é injetado em todas as abas HTTP/HTTPS
3. Ao carregar página, content script consulta zoom salvo via GET_ZOOM
4. Se zoom salvo existir, aplica via APPLY_ZOOM com debounce
5. Ctrl+Roda interceptado → calcula novo nível → aplica e salva
6. Popup aberto → busca zoom atual → exibe slider/input/presets
7. Ajuste via popup → APPLY_ZOOM com tabId explícito → SAVE_ZOOM
8. Reset (Alt+Shift+R ou botão) → lê __defaultZoom → aplica e remove chave do domínio
9. Presets definidos em Options → aparecem como botões no popup → aplicação instantânea
10. Usuário configura Supabase na Options Page → credenciais salvas em chrome.storage.local
11. Sync Push envia dados locais ao Supabase | Sync Pull puxa dados remotos
12. Auto-sync executa PUSH silencioso a cada 60min via chrome.alarms
13. Export gera base64 comprimido | Import restaura de base64
```

## Persistência

- **`chrome.storage.sync`**: Armazenamento local primário sincronizado entre dispositivos logados na mesma conta Google.
- **`chrome.storage.local`**: Credenciais Supabase (`__supabaseUrl`, `__supabaseKey`) armazenadas localmente (não sincronizadas).
- **Chave por domínio**: `{hostname}: number` — nível de zoom salvo (ex: `"github.com": 1.2`)
- **`__defaultZoom`**: Nível de zoom padrão para reset (fallback: 1.0)
- **`__zoomPresets`**: Array de objetos `{ label: string, level: number }` (max 8)
- **Supabase (opcional)**: Tabelas `zoom_settings` e `presets` via REST API. Fallback automático para storage local quando não configurado.

## Segurança e Privacidade

- Extensão opera exclusivamente no contexto do navegador local.
- Credenciais Supabase armazenadas em `chrome.storage.local` (não sincronizadas entre dispositivos).
- Anon Key do Supabase é pública por design; segurança está no RLS do projeto Supabase.
- Não coleta, transmite ou armazena dados fora do `chrome.storage.sync` e Supabase configurado.
- Não requer permissões de cookies, histórico ou abas além da ativa.
- Content Script usa `passive: false` apenas para interceptar Ctrl+Wheel; scroll normal não é afetado.
- Sem analytics, sem tracking.

## Sistemas Principais

### Controle de Zoom Nativo
Utiliza `chrome.tabs.setZoom(tabId, level)` com clamp entre 0.25 e 5.0. Step de 2% (0.02) aplicado consistentemente em content script e popup via função `roundToStep2()`.

### Sistema de Presets
CRUD completo em Options Page com validação de limites. Presets renderizados dinamicamente no popup como grid 2 colunas. Aplicação instantânea via handler `APPLY_PRESET` com tabId explícito.

### Restauração Automática
Listener `chrome.tabs.onUpdated` no background detecta `status: 'complete'` e restaura zoom salvo para o hostname da aba. Content Script também restaura via mensagem `GET_ZOOM` ao carregar.

### Sincronização Supabase
Cliente REST dinâmico lê credenciais do `chrome.storage.local` a cada chamada. Handlers `SYNC_PUSH` (POST/UPSERT) e `SYNC_PULL` (GET + merge) com tratamento de respostas 204 No Content. Auto-sync via `chrome.alarms` a cada 60min. Fallback gracioso: quando Supabase não está configurado ou offline, todas as operações continuam funcionando localmente.

### Export/Import
Compressão gzip nativa via Compression Streams API. Export serializa todo o storage local para base64. Import descomprime, valida estrutura e restaura dados. Funciona independentemente do Supabase.

## Como Rodar Localmente

```bash
# 1. Abra o Chrome e navegue até:
chrome://extensions

# 2. Ative "Modo do desenvolvedor" (canto superior direito)

# 3. Clique em "Carregar sem compactação"

# 4. Selecione a pasta:
extensao/
```

Não há build, bundler ou processo de compilação. Os arquivos são carregados diretamente pelo Chrome.

## Tecnologias

| Tecnologia | Responsabilidade |
| --- | --- |
| Chrome Extension Manifest V3 | Plataforma da extensão |
| Vanilla JavaScript (ES6+) | Lógica de negócio, message passing, DOM |
| HTML5 + CSS3 | Interface popup e options page |
| chrome.tabs.setZoom API | Zoom nativo do navegador |
| chrome.storage.sync API | Persistência local por domínio |
| chrome.storage.local API | Credenciais Supabase (não sincronizado) |
| Supabase REST API | Sincronização multi-dispositivo (opcional) |
| Compression Streams API | Compressão gzip nativa para export/import |
| chrome.alarms API | Auto-sync periódico (60min) |
| Python 3.10+ / Pillow | Geração de ícones PNG (tooling apenas) |

## Testes

No estado atual, o projeto não possui testes automatizados para a extensão Chrome.

Validações manuais recomendadas:

```txt
1. Carregar extensão em chrome://extensions sem erros
2. Ctrl+Roda ajusta zoom em incrementos de 2%
3. Recarregar página restaura zoom salvo
4. Popup aplica zoom instantaneamente (sem F5)
5. Reset (Alt+Shift+R) retorna ao zoom padrão configurado
6. Presets salvos em Options aparecem e funcionam no popup
7. Subdomínios possuem configurações independentes
8. Scroll normal (sem Ctrl) não é interceptado
9. Configurar Supabase na Options → Testar Conexão → OK
10. Sync Push envia dados ao Supabase Dashboard
11. Sync Pull em outro navegador restaura configurações
12. Export gera base64 → Import restaura em outro dispositivo
13. Sem Supabase configurado → banner warning visível, dados locais funcionam
```

Testes automatizados existem para git hooks:

```bash
pytest tests/test_git_hooks.py
```

## Decisões Técnicas

- **Manifest V3 sobre MV2**: MV2 está descontinuado; MV3 é obrigatório para novas extensões.
- **Vanilla JS sobre framework**: Extensão simples não justifica React/Vue; zero bundle size.
- **`chrome.tabs.setZoom` sobre CSS zoom**: Zoom nativo escala tudo uniformemente; CSS zoom quebra layouts.
- **`passive: false, capture: true`**: Necessário para `preventDefault()` no evento wheel; sem isso, Ctrl+Roda faz scroll + zoom simultâneo.
- **`color-scheme: dark`**: Única forma W3C-padrão de estilizar spinners nativos do Chrome em modo escuro; pseudo-elementos `-webkit-inner-spin-button` não aceitam cores.
- **`Alt+Shift+R` sobre `Ctrl+0`**: `Ctrl+0` e `Ctrl+Shift+0` são reservados pelo Chrome; `Alt+Shift+R` não conflita.
- **Debounce de 300ms no save**: Evita escritas excessivas no storage durante scroll contínuo.
- **`tabId` explícito no popup**: `sender.tab?.id` é undefined no contexto do popup; bug fix crítico para aplicação instantânea.
- **Credenciais dinâmicas**: Supabase URL/Key lidas do `chrome.storage.local` a cada request; sem cache global permite alteração em tempo real.
- **`chrome.storage.local` para credenciais**: Separação intencional — credenciais não devem sincronizar via `chrome.storage.sync`.
- **Compression Streams API nativa**: Evita dependência externa para compressão gzip; suportado nativamente no Chrome.
- **RLS desabilitado temporariamente**: Anon key sem user auth requer RLS off; migrar para auth de usuário antes de produção.

## 📄 Licença

Este projeto está licenciado sob a [MIT License](LICENSE).

Copyright (c) 2026 Douglas Silva
