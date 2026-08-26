# Contracts

## schemaVersion 1

See `docs/references/contracts-v1.md` and `src/contracts/`.

## Tools MCP (MVP)

| Tool | Efeito |
| --- | --- |
| `cg_generate_graph` | Extrai e grava GraphDocument |
| `cg_graph_status` | Metadados, freshness, backends |
| `cg_list_graphs` | Inventário |
| `cg_query_graph` | Subgrafo por pergunta/escopo |
| `cg_get_node` | Detalhe do símbolo |
| `cg_get_neighbors` | 1 hop + filtros |
| `cg_shortest_path` | Caminho A→B |

Hints: queries `readOnlyHint`; generate destructive/write (`enableMutations`).
