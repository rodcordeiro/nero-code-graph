# Graphify research brief (nero-code-graph)

Fontes: [README](https://github.com/Graphify-Labs/graphify/blob/v8/README.md), [how-it-works](https://github.com/Graphify-Labs/graphify/blob/v8/docs/how-it-works.md), [ARCHITECTURE](https://github.com/Graphify-Labs/graphify/blob/v8/ARCHITECTURE.md), [SECURITY](https://github.com/Graphify-Labs/graphify/blob/v8/SECURITY.md), pacote PyPI `graphifyy`.

## Product model

Pipeline: detect → extract → build → cluster → analyze → report → export.

| Pass | Conteúdo | LLM? |
| --- | --- | --- |
| 1 Code | tree-sitter: classes, functions, imports, calls, comments; SQL FKs | Não |
| 2 Media | whisper | Não (local) |
| 3 Docs/images | semantic edges | Sim |

`--code-only` alinha ao MVP Nero.

## Provenance

`EXTRACTED` | `INFERRED` | `AMBIGUOUS`. Para código, INFERRED inclui resolução de call-graph — não só LLM.

## Relations úteis ao MVP

`imports`, `imports_from`, `re_exports`, `calls`, `contains`, `method`, `inherits`, `implements`, …

## MCP tools (upstream)

`query_graph`, `get_node`, `get_neighbors`, `shortest_path`, `get_community`, `god_nodes`, `graph_stats`, `list_prs`, `get_pr_impact`, `triage_prs`.

## Storage upstream

`graphify-out/graph.json` (NetworkX node-link) + `GRAPH_REPORT.md` + cache SHA256.

## Gaps vs nero-code-graph

| Need | Gap |
| --- | --- |
| Pack nero-core | Custom |
| Dual store projeto / Nero KR | Custom |
| Calls import-scoped | Apertar vs name-match |
| Generate via MCP | Upstream gera mais via CLI/skill |
| Naming/tools Pack | Facade própria |

## Recomendação

Reusar modelo mental + proveniência + verbos de query; **não** tratar `graphify.serve` como drop-in. Normalizar para `GraphDocument` do pack.
