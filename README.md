# nero-code-graph

Pack **nero-core** (domínio `mcp`): servidor MCP de **code-graph** que analisa um checkout e gera um grafo consultável para agentes — generate, manage e query.

Inspiração de produto: [Graphify](https://github.com/Graphify-Labs/graphify). Superfície e storage compatíveis com o ecossistema Nero (artefato no projeto e/ou mirror no Knowledge Repo), **sem** misturar arestas AST com o vocabulário operacional do knowledge.

## Status

MVP Iteration 1 entregue. Host resolve o `Extractor` por sinais do bound root + override env (`#16`). Adapters: `typescript-ast`, `php-ast`, `dotnet-ast` (MVP regex para PHP/.NET).

| | |
| --- | --- |
| **Entrypoint** | `npm run mcp` — ver [`.agents/references/runtime.md`](.agents/references/runtime.md) |
| **Stack** | TypeScript · MCP stdio · CodeGraph · extractors TS / PHP / .NET |
| **Validação** | `npm test` · `npm run typecheck` |

## Uso rápido

```bash
NCG_ENABLE_MUTATIONS=true NCG_BOUND_ROOT=<checkout> npm run mcp
```

Tools: `cg_generate_graph`, `cg_graph_status`, `cg_list_graphs`, `cg_query_graph`, `cg_get_node`, `cg_get_neighbors`, `cg_shortest_path`.

Override de linguagem: `NCG_EXTRACTOR=fixture|typescript|php|dotnet`. Sem override, sinais do checkout (`package.json` / `tsconfig` / `.ts*`, `composer.json` / `.php`, `*.csproj` / `*.sln` / `.cs`).

## Escopo

- Nós: file / class / method  
- Arestas: imports e calls **import-reachable**  
- Proveniência: `EXTRACTED` / `INFERRED`  
- Perguntas estruturais → `cg_*`; ops/decisões → Nero Knowledge (`nero_*`)

## Documentação

| Doc | Path |
| --- | --- |
| Agentes (índice) | [`AGENTS.md`](AGENTS.md) |
| Runtime / env | [`.agents/references/runtime.md`](.agents/references/runtime.md) |
| Spec | [`docs/references/spec-code-graph-pack.md`](docs/references/spec-code-graph-pack.md) |
| Testing plan | [`docs/references/testing-plan.md`](docs/references/testing-plan.md) |
| Backlog | GitHub Issues · [`docs/backlog/`](docs/backlog/) |

## Próximo passo

Viewer (`#10`). Aprofundar parsers PHP/.NET além do MVP regex quando necessário.
