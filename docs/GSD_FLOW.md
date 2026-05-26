# 🚀 Fluxo GSD (Get Shit Done) 4-D & Protocolo de Memória

Este guia estabelece o padrão operacional obrigatório para garantir estabilidade técnica, evitar regressões silenciosas e organizar o histórico de desenvolvimento através do **Fluxo GSD 4-D** e do **Protocolo de Memória ID-Based**.

---

## 🏛️ O Fluxo GSD 4-D em Quatro Etapas

### Fase 1: Discuss & Diagnose (A Regra do Mago Acadêmico)
Antes de escrever uma única linha de código, o engenheiro ou agente IA deve:
*   Aprofundar os requisitos e eliminar todas as premissas ocultas.
*   Questionar exaustivamente até que não reste nenhuma dúvida técnica ou conceitual.
*   *Nota (Modo Express):* Para correções de texto ou refatorações de um único arquivo trivial, é permitido pular esta fase com no máximo 1 pergunta.

### Fase 2: Plan & Develop (O Planejamento Checklist)
Após diagnosticar os requisitos, crie o plano de ação dividido em tarefas atômicas utilizando o formato estrito:
*   `**Tarefa X: [Nome da Tarefa]**`
*   Use checklists Markdown (`- [ ]`, `- [/]`, `- [x]`) para demonstrar o estado de cada tarefa.
*   **Testes automatizados devem ser incluídos como tarefas explícitas.**

### Fase 3: Execute & Deliver (Execução Atômica e Testabilidade)
Execute exatamente uma tarefa por vez.
*   Não avance para a tarefa seguinte até que a atual esteja 100% concluída.
*   **Código sem teste não entra no repositório.** Escreva testes unitários/integrados para validar o caso feliz e ao menos um edge case.
*   Rode linters e formatadores rápidos (`ruff`, `prettier`) localmente após cada modificação de arquivo.

### Fase 4: Verify & Commit (UAT e Auditoria de Mutação)
Antes de finalizar e submeter:
*   Faça o UAT (User Acceptance Testing) simulando ou testando o fluxo ponta a ponta.
*   Exiba o **Relatório de Mutação de Arquivos** no formato minimalista (apenas caminhos modificados).
*   Gere o commit em Conventional Commits contendo obrigatoriamente o ID de observação.

---

## 🧠 A Lei da Memória Virtual (ID-Based)

Para combater a "perda de contexto" em conversas longas, documentamos as decisões técnicas, logs e mutações no histórico persistente do projeto no arquivo `resumo-de-trabalho.md` localizado na raiz.

### O Padrão de ID de Observação
Cada modificação relevante ou encerramento de etapa recebe um ID exclusivo no formato:
`[OBS-YYYYMMDD-NN]`

Onde:
*   `YYYYMMDD` é a data atual (Ano, Mês, Dia).
*   `NN` é um sequencial de dois dígitos iniciando em `01` para cada dia.

### O Arquivo `resumo-de-trabalho.md`
Este arquivo é o log central da inteligência e auditoria do projeto. Ele é atualizado proativamente pelo subagente `gsd_recorder` e serve como referência imediata no início de novas interações.
Ao debater decisões passadas, cite sempre o ID da observação correspondente (ex: *"Conforme OBS-20260525-01, a stack base foi..."*).
