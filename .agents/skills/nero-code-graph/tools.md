# cg_* tools and runtime

Disclosed from [SKILL.md](SKILL.md). Single source for tool shapes and env.

## Tools

| Tool | Role | Mutation |
| --- | --- | --- |
| `cg_generate_graph` | Rebuild **GraphDocument** via **Extractor** → **GraphStore** | Yes — needs `NCG_ENABLE_MUTATIONS=true` |
| `cg_graph_status` | exists, fingerprint, counts, `stale`, backend | No |
| `cg_list_graphs` | Known graphs for this process | No |
| `cg_query_graph` | Keyword / NL-ish question → matched nodes + related hops | No |
| `cg_get_node` | One **Node** by id | No |
| `cg_get_neighbors` | 1-hop **Edges** (`direction`, `relationFilter`, `provenanceFilter`) | No |
| `cg_shortest_path` | Shortest directed path `sourceId` → `targetId` | No |

Shared query arg: `allowStale` (boolean). Required when `NCG_STRICT_FRESHNESS=true` and the graph is stale.

### Neighbors filters

- `direction`: `outgoing` \| `incoming` \| `both`
- `relationFilter`: `imports` \| `imports_from` \| `calls` \| `contains` \| `method`
- `provenanceFilter`: `EXTRACTED` \| `INFERRED` \| `AMBIGUOUS`

### Typical who-calls

```text
cg_get_neighbors({
  nodeId: "method:src/orders/OrderService.ts#PlaceOrder",
  direction: "incoming",
  relationFilter: ["calls"]
})
```

Expect hops with `provenance: "EXTRACTED"` and `evidence.file` / `evidence.line`.

## Storage

| Mode | What |
| --- | --- |
| **project_artifact** (default) | `<bound>/.nero-code-graph/graph.json` |
| **knowledge_mirror** (optional dual-write) | **Manifest** under `NCG_KNOWLEDGE_ROOT`; **opaque blob** under `NCG_MIRROR_BLOB_ROOT` (outside KR) |

## Env (MCP process)

| Var | Meaning |
| --- | --- |
| `NCG_BOUND_ROOT` | Checkout to index |
| `NCG_ALLOWED_ROOTS` | Allowlist (`:` / `;`) |
| `NCG_ENABLE_MUTATIONS` | Allow `cg_generate_graph` |
| `NCG_REPO_KEY` | repoKey in status/list |
| `NCG_GIT_COMMIT` | HEAD stamped on rebuild; drift → `stale` |
| `NCG_STRICT_FRESHNESS` | Refuse stale queries unless `allowStale` |
| `NCG_KNOWLEDGE_ROOT` + `NCG_MIRROR_BLOB_ROOT` | Enable dual-write mirror |
| `NCG_KNOWLEDGE_MANIFEST_PATH` | Manifest path under KR |
| `NCG_EXTRACTOR` | Force: `fixture` \| `typescript` \| `php` \| `dotnet`. Else host picks from bound-root signals (TS / PHP / .NET manifests + extensions). Tie-break: typescript > php > dotnet |
| `NCG_USE_FIXTURE_EXTRACTOR` | Dev: golden fixture (`true` same as `NCG_EXTRACTOR=fixture`) |
| `NCG_FIXTURE_GOLDEN` | Override FixtureExtractor golden path |

Start (Pack checkout): `NCG_ENABLE_MUTATIONS=true NCG_BOUND_ROOT=<checkout> npm run mcp`

Smoke: generate → status → neighbors on a known method id.

## Error shapes

| Signal | Meaning |
| --- | --- |
| `mutations_disabled` | Generate refused — enable mutations |
| `graph_not_indexed` | No artifact yet — generate |
| `graph_stale` | Strict freshness and stale — rebuild or `allowStale` |
| `node_not_found` / `path_not_found` | Id or path missing in current **GraphDocument** |
| `extractor_unknown:<id>` | `NCG_EXTRACTOR` set to an unsupported value |
