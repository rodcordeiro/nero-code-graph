# Contracts

## Tools MCP (MVP — prefixo final: open-questions Q3)

| Tool ( Conceito ) | Efeito |
| --- | --- |
| generate / rebuild | Extrai e grava GraphDocument |
| status / list | Metadados, freshness, backends |
| query_graph | Subgrafo por pergunta/escopo |
| get_node | Detalhe do símbolo |
| get_neighbors | 1 hop + filtros de relação |
| shortest_path | Caminho A→B |

## Documento

Ver `docs/references/architecture-seams.md` e `docs/references/spec-code-graph-pack.md`.

Hints: queries `readOnlyHint`; rebuild destructive/write.
