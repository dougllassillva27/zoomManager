# Graph Report - zoom  (2026-05-28)

## Corpus Check
- 7 files · ~14,601 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 56 nodes · 78 edges · 9 communities (6 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8c1aa16e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]

## God Nodes (most connected - your core abstractions)
1. `handler()` - 8 edges
2. `showStatus()` - 5 edges
3. `savePresets()` - 4 edges
4. `deleteSmartProfile()` - 4 edges
5. `sendMessage()` - 4 edges
6. `getSupabaseConfig()` - 3 edges
7. `supabaseRequest()` - 3 edges
8. `sendMessage()` - 3 edges
9. `applyInitialZoom()` - 3 edges
10. `renderPresets()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `deleteSmartProfile()` --calls--> `showStatus()`  [EXTRACTED]
  extensao/options.js → extensao/options.js  _Bridges community 5 → community 7_
- `savePresets()` --calls--> `renderPresets()`  [EXTRACTED]
  extensao/options.js → extensao/options.js  _Bridges community 1 → community 5_
- `loadSupabaseConfig()` --calls--> `sendMessage()`  [EXTRACTED]
  extensao/options.js → extensao/options.js  _Bridges community 8 → community 7_

## Communities (9 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.38
Nodes (8): buildContextMenu(), clampZoom(), compressToBase64(), decompressFromBase64(), getSupabaseConfig(), getZoomKey(), handler(), supabaseRequest()

### Community 2 - "Community 2"
Cohesion: 0.43
Nodes (4): applyInitialZoom(), applyZoom(), detectPdf(), sendMessage()

### Community 3 - "Community 3"
Cohesion: 0.38
Nodes (3): applyAndSave(), loadAndRenderPresets(), sendMessage()

### Community 4 - "Community 4"
Cohesion: 0.29
Nodes (6): Garante que segredos reais sejam casados pelas regexes de segurança., Valida se caminhos protegidos e secretos são interceptados de forma correta., Valida se o formato Conventional Commit + ID de Observação é rigidamente exigido, test_commit_msg_validation(), test_pre_commit_protected_paths(), test_pre_commit_secret_detection()

### Community 5 - "Community 5"
Cohesion: 0.5
Nodes (5): addPreset(), removePreset(), saveDefaultZoom(), savePresets(), showStatus()

### Community 7 - "Community 7"
Cohesion: 0.67
Nodes (4): deleteSmartProfile(), loadSmartProfiles(), renderSmartProfiles(), sendMessage()

## Knowledge Gaps
- **3 isolated node(s):** `Garante que segredos reais sejam casados pelas regexes de segurança.`, `Valida se caminhos protegidos e secretos são interceptados de forma correta.`, `Valida se o formato Conventional Commit + ID de Observação é rigidamente exigido`
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `Garante que segredos reais sejam casados pelas regexes de segurança.`, `Valida se caminhos protegidos e secretos são interceptados de forma correta.`, `Valida se o formato Conventional Commit + ID de Observação é rigidamente exigido` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._