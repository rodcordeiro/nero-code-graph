# nero-code-graph

Pack **nero-core** (domínio `mcp`): servidor MCP de **code-graph** que analisa um checkout (AST/tree-sitter) e gera um grafo consultável para agentes — generate, manage e query.

Inspiração de produto: [Graphify](https://github.com/Graphify-Labs/graphify). Superfície e storage compatíveis com o ecossistema Nero (artefato no projeto e/ou mirror no Knowledge Repo), **sem** misturar arestas AST com o vocabulário operacional do knowledge.

## Documentação

| Doc | Path |
| --- | --- |
| Spec | [`docs/references/spec-code-graph-pack.md`](docs/references/spec-code-graph-pack.md) |
| Perguntas abertas | [`docs/references/open-questions.md`](docs/references/open-questions.md) |
| Grill | [`docs/references/grill-analysis-2026-08-26.md`](docs/references/grill-analysis-2026-08-26.md) |
| Backlog | [`docs/backlog/`](docs/backlog/) |
| Agentes | [`AGENTS.md`](AGENTS.md) |

## Escopo MVP

- Nós: file / class / method  
- Arestas: imports e calls **import-reachable** dentro do código  
- Tools: rebuild/status + `query_graph` / `get_node` / `get_neighbors` / `shortest_path`  
- Proveniência: `EXTRACTED` / `INFERRED`

## Próximo passo

Q1–Q13 fechadas. Piloto: Banky API (TypeScript). Começar backlog `01`.
