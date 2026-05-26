# ⚡ RTK (Rust Token Killer) Mindset — Eficiência de Tokens

Este guia detalha os protocolos obrigatórios de economia de tokens nas operações do terminal e no gerenciamento de arquivos. Seguir essas regras economiza entre **60% e 90% dos tokens de conversação**, evitando lentidão do modelo e "Context Rot" (deterioração da memória da IA).

---

## 🏎️ O Protocolo de Busca Cirúrgica em 3 Camadas

Nunca leia arquivos grandes inteiros se puder extrair a informação cirurgicamente. Adote o fluxo de **Progressive Disclosure**:

### 1. Camada de Filtro (Precision Search)
Sempre localize IDs de observação ou trechos específicos via regex/busca no terminal ao invés de abrir o arquivo inteiro.
*   **PowerShell Ready:**
    ```powershell
    rtk powershell -Command "Select-String -Path .\resumo-de-trabalho.md -Pattern '\[OBS-20260525-'"
    ```
*   **Git Grep:**
    ```bash
    rtk git grep "OBS-20260525-01"
    ```

### 2. Camada de Scan (Linhas Imediatas)
Uma vez localizado o ID ou a ocorrência, leia apenas a linha correspondente e seu contexto imediato de linhas de borda para evitar inchaço do prompt:
*   **No PowerShell:**
    ```powershell
    rtk powershell -Command "Get-Content -Path .\resumo-de-trabalho.md | Select-Object -Index 10..15"
    ```

### 3. Camada de Deep Dive (Leitura Seletiva)
Apenas se o Scan apontar para uma decisão complexa, leia o bloco específico do arquivo ou abra o módulo referenciado utilizando o visualizador nativo ou delimitadores de linhas (ex: do caractere X ao Y ou linhas X a Y).

---

## 🔇 Supressão de Ruído no Terminal

Toda saída extensa e desnecessária deve ser silenciada na raiz das ferramentas. Utilize flags de supressão de ruído agressivas:

*   **Flags Silenciosas:** Sempre adicione `-q`, `--silent`, `-s` ou direcione saídas indesejadas para o nulo (`2>/dev/null` ou `out-null`).
*   **Git Resumido:** Nunca rode `git diff` sem filtros para contextos globais. Prefira o formato enxuto de metadados:
    ```bash
    rtk git diff --stat
    ```
*   **Sem Cores:** Desative caracteres de cor do ANSI que incham a conversão de tokens crus usando a variável de ambiente:
    ```bash
    NO_COLOR=1
    ```

---

## 🛡️ Prefixo RTK Obrigatório no Terminal

No ambiente operacional Windows, toda chamada no terminal deve priorizar o proxy de otimização `rtk` para monitoramento. Se o comando falhar, utilize o fallback UTF-8 estrito no PowerShell:

```powershell
rtk powershell -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::InputEncoding = [System.Text.Encoding]::UTF8; <comando>"
```
