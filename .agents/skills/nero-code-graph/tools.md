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

### Keyword query pages

`cg_query_graph({ question, limit?, cursor?, allowStale? })` returns at most
`limit` entries in each of `payload.hops` and `payload.matchedNodeIds` (default
25; integer 1–100). `payload.page` includes the applied `limit`,
`totalMatchedNodes`, `totalHops`, and `truncated`.

If `page.nextCursor` is present, repeat the **exact same question** with that
cursor until `truncated` is false. Nodes and hops advance independently; after
one array is exhausted, later pages may contain entries only in the other. Hop
endpoints need not be among the matched nodes of that page. Do not interpret the
first page as a complete list of callers.

```text
cg_query_graph({ question: "PlaceOrder", limit: 10 })
cg_query_graph({ question: "PlaceOrder", limit: 10, cursor: "<page.nextCursor>" })
```

Cursors are opaque and tied to the query and indexed artifact. Rebuilds or graph
changes invalidate continuation: restart from the first page on
`invalid_query_cursor`. The schemaVersion and envelope are unchanged; large
responses are now paginated even when `limit` is omitted.

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

Inspect each hop's provenance and `evidence.file` / `evidence.line`.
`EXTRACTED` is a resolved structural relation; `INFERRED` is a likely relation;
`AMBIGUOUS` is a candidate, not a confirmed caller. Do not promote a candidate
to a confirmed impact merely because it is the only returned candidate.

### Classes and method calls

`calls` edges join method nodes. A class query with `relationFilter: ["calls"]`
does not aggregate the calls of its methods. First get the class's outgoing
`method` edges, then query the resulting method IDs with the `calls` filter.
Class neighbors without that filter can include these structural membership edges.

### Extractor resolution limits and upgrades

Rebuild artifacts created by extractor version `0.1.0` after upgrading to
`0.1.1`. Extractor ID/version drift marks the artifact stale even when the
consumer's source fingerprint is unchanged. Strict freshness refuses it until
rebuild (unless `allowStale` is explicitly requested).

- C#: immediate class/interface members become methods, including implicit-private,
  abstract and expression-bodied members. Lambdas, delegates and local functions
  do not become method nodes; their calls belong to the containing method.
- C#: supported receiver sources include declared fields/parameters/locals,
  `var x = new T()`, `GetRequiredService<T>()` and known method return types.
  `Task<T>` / `ValueTask<T>` returns unwrap only when the initializer uses `await`.
  Interfaces are explicit destinations; implementation dispatch is not inferred
  from DI configuration. Namespace expansion produces `INFERRED` file imports.
- C#: this remains a lightweight structural scan, not Roslyn. Aliases, inheritance,
  extension methods, complex expression chains and multiple namespaces per file
  do not have full semantic resolution. Unresolved receiver calls produce
  `AMBIGUOUS` reachable candidates or are omitted. Canonical v1 IDs still collapse
  same-name methods within a file; such destination collisions stay ambiguous.
- TypeScript: compiler-resolved indexed methods can be confirmed; unresolved
  receivers use ambiguous import-reachable candidates. Compiler options are
  conservative defaults; consumer tsconfig aliases are not loaded.
- PHP: simple typed properties and explicit static class receivers can resolve;
  unsupported/dynamic receivers use ambiguous include-reachable candidates.

Freshness records the sources and extractor, not completeness of language coverage.

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
| `invalid_query_limit` | Core query limit outside integer 1–100; MCP also validates the argument |
| `invalid_query_cursor` | Malformed cursor, different question, or changed/rebuilt artifact; restart query |
| `extractor_unknown:<id>` | `NCG_EXTRACTOR` set to an unsupported value |
