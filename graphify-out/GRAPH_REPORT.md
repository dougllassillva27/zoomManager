# Graph Report - zoom  (2026-05-26)

## Corpus Check
- 2 files · ~2,127 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 12 nodes · 11 edges · 3 communities (1 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]

## God Nodes (most connected - your core abstractions)
1. `test_pre_commit_secret_detection()` - 2 edges
2. `test_pre_commit_protected_paths()` - 2 edges
3. `test_commit_msg_validation()` - 2 edges
4. `gerarHash()` - 2 edges
5. `processarUrl()` - 2 edges
6. `Garante que segredos reais sejam casados pelas regexes de segurança.` - 1 edges
7. `Valida se caminhos protegidos e secretos são interceptados de forma correta.` - 1 edges
8. `Valida se o formato Conventional Commit + ID de Observação é rigidamente exigido` - 1 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (3 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.4
Nodes (4): Garante que segredos reais sejam casados pelas regexes de segurança., Valida se caminhos protegidos e secretos são interceptados de forma correta., test_pre_commit_protected_paths(), test_pre_commit_secret_detection()

## Knowledge Gaps
- **3 isolated node(s):** `Garante que segredos reais sejam casados pelas regexes de segurança.`, `Valida se caminhos protegidos e secretos são interceptados de forma correta.`, `Valida se o formato Conventional Commit + ID de Observação é rigidamente exigido`
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `test_commit_msg_validation()` connect `Community 2` to `Community 0`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **What connects `Garante que segredos reais sejam casados pelas regexes de segurança.`, `Valida se caminhos protegidos e secretos são interceptados de forma correta.`, `Valida se o formato Conventional Commit + ID de Observação é rigidamente exigido` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._