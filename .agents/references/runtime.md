# Runtime

| Item | Estado |
| --- | --- |
| Transport | stdio (MVP) |
| Start | `NCG_ENABLE_MUTATIONS=true NCG_BOUND_ROOT=<checkout> npm run mcp` |
| Entrypoint | `src/mcp/stdio-main.ts` |
| Host | Cursor / clientes MCP stdio |

## Env

| Var | Meaning |
| --- | --- |
| `NCG_BOUND_ROOT` | Checkout to index (default cwd) |
| `NCG_ALLOWED_ROOTS` | Allowlist, `:` / `;` separated (default = bound root) |
| `NCG_ENABLE_MUTATIONS` | `true` to allow `cg_generate_graph` (default off) |
| `NCG_REPO_KEY` | repoKey in status/list |
| `NCG_GIT_COMMIT` | Optional HEAD for stale checks |
| `NCG_FIXTURE_GOLDEN` | Override FixtureExtractor golden path (dev) |

HTTP MCP: fora do MVP.

Artefato: `<bound>/.nero-code-graph/graph.json`.

## Smoke

1. `NCG_ENABLE_MUTATIONS=true NCG_BOUND_ROOT=<tmp> npm run mcp`
2. Client: `cg_generate_graph` → `cg_graph_status` → `cg_get_neighbors` on a known symbol.
