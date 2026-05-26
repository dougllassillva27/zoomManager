# 🦤 Dodo Starter Pack - Manifesto Anti-Vibe Coding

> Esse arquivo é lido pelo Claude no início de toda conversa.
> **Mantenha curto e direto.** Para regras determinísticas, use `.claude/settings.json`.
> Para conhecimento sob demanda e guias operacionais, consulte `.claude/skills/`.

## 🛠️ Stack do Projeto

- **Frontend:** HTML5, CSS3 Vanilla, JavaScript Moderno (ES6+)
- **Backend/Scripting:** Python 3.10+
- **Quality & Linting:** Ruff (Python), ESLint/Prettier (JS/HTML/CSS)
- **Testing:** Pytest (Python)

## 🚀 Comandos Essenciais

```bash
# Setup de Ambiente
python -m venv .venv               # Cria ambiente virtual Python
.venv\Scripts\activate             # Ativa virtualenv (Windows PowerShell)
pip install -r requirements.txt     # Instala dependências (se houver)

# Qualidade e Lints Rápidos (RTK Mindset)
ruff check .                       # Executa linter Ruff em Python
ruff format .                      # Formata código Python
npx prettier --write .             # Formata JS, HTML, CSS, JSON
pytest                             # Executa testes unitários

# Auditoria e Commits (Padrão GSD Flow)
./commit.sh "[OBS-YYYYMMDD-NN] msg" # Executa script assistido de auditoria e commit
```

## 🔒 Regras Inegociáveis (Anti-Vibe Coding)

1.  **Código Sem Testes Não Entra**: Cada nova lógica pública ou funcionalidade deve ser acompanhada por testes equivalentes.
2.  **Não Simule Execuções**: Proibido fingir que um comando ou linter funcionou sem de fato rodá-lo e obter o resultado real.
3.  **Auditoria Paginada (ID-Based)**: Qualquer mutação ou decisão arquitetural deve ser registrada no `resumo-de-trabalho.md` sob um ID de observação estruturado `[OBS-YYYYMMDD-NN]`.
4.  **Uso de Proxy RTK**: Toda interação de terminal de desenvolvimento deve ser realizada de forma otimizada para tokens.

## 📁 Estrutura de Domínio Recomendada

```
dodo-project/
├── .claude/                   # Configurações do Claude Code
│   ├── settings.json          # Permissões determinísticas e hooks wired
│   └── skills/                # progressive disclosure de conhecimentos
├── .githooks/                 # Hooks de git integrados para segurança
├── docs/                      # Documentação técnica do GSD Flow e RTK
├── tests/                     # Suíte de testes automatizados
├── resumo-de-trabalho.md      # Histórico linear de auditoria técnica (GSD)
└── CLAUDE.md                  # Esse manifesto
```
