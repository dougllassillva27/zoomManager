# Graph Report - zoom  (2026-05-26)

## Corpus Check
- 6 files · ~7,763 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 38 nodes · 44 edges · 6 communities (3 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `588f849b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]

## God Nodes (most connected - your core abstractions)
1. `showStatus()` - 4 edges
2. `savePresets()` - 4 edges
3. `renderPresets()` - 3 edges
4. `addPreset()` - 3 edges
5. `removePreset()` - 3 edges
6. `sendMessage()` - 3 edges
7. `clampZoom()` - 2 edges
8. `handler()` - 2 edges
9. `sendMessage()` - 2 edges
10. `applyZoom()` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (6 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.36
Nodes (7): addPreset(), loadPresets(), removePreset(), renderPresets(), saveDefaultZoom(), savePresets(), showStatus()

### Community 1 - "Community 1"
Cohesion: 0.38
Nodes (3): applyAndSave(), loadAndRenderPresets(), sendMessage()

### Community 2 - "Community 2"
Cohesion: 0.29
Nodes (6): Garante que segredos reais sejam casados pelas regexes de segurança., Valida se caminhos protegidos e secretos são interceptados de forma correta., Valida se o formato Conventional Commit + ID de Observação é rigidamente exigido, test_commit_msg_validation(), test_pre_commit_protected_paths(), test_pre_commit_secret_detection()

## Knowledge Gaps
- **3 isolated node(s):** `Garante que segredos reais sejam casados pelas regexes de segurança.`, `Valida se caminhos protegidos e secretos são interceptados de forma correta.`, `Valida se o formato Conventional Commit + ID de Observação é rigidamente exigido`
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `Garante que segredos reais sejam casados pelas regexes de segurança.`, `Valida se caminhos protegidos e secretos são interceptados de forma correta.`, `Valida se o formato Conventional Commit + ID de Observação é rigidamente exigido` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._