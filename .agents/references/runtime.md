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
| `NCG_GIT_COMMIT` | Optional HEAD for stale checks (stamped on rebuild) |
| `NCG_STRICT_FRESHNESS` | `true` → queries refuse when stale unless `allowStale` |
| `NCG_KNOWLEDGE_ROOT` | Optional KR root; with `NCG_MIRROR_BLOB_ROOT` enables dual write |
| `NCG_MIRROR_BLOB_ROOT` | Opaque GraphDocument root **outside** KR (Q13) |
| `NCG_KNOWLEDGE_MANIFEST_PATH` | Relative Manifest path under KR (default `knowledge/projects/local/code-graph.manifest.json`) |
| `NCG_USE_FIXTURE_EXTRACTOR` | `true` → FixtureExtractor instead of TS AST (dev) |
| `NCG_FIXTURE_GOLDEN` | Override FixtureExtractor golden path (dev) |

When knowledge mirror is enabled, rebuild dual-writes: project `.nero-code-graph/graph.json` + Manifest in KR + opaque blob under `NCG_MIRROR_BLOB_ROOT`. Manifest never contains nodes/edges/`links:`.

HTTP MCP: fora do MVP.

Artefato: `<bound>/.nero-code-graph/graph.json`.

## Smoke

1. `NCG_ENABLE_MUTATIONS=true NCG_BOUND_ROOT=<tmp> npm run mcp`
2. Client: `cg_generate_graph` → `cg_graph_status` → `cg_get_neighbors` on a known symbol.
