# Testing plan — nero-code-graph

How to prove the Pack works: unit seam → fixtures → MCP client → pilot checkout.

Acceptance oracle: [`qa-acceptance.md`](qa-acceptance.md). Skill consumer flow: `.cursor/skills/nero-code-graph/`.

## Ladder

| Level | What | Pass |
| --- | --- | --- |
| **L0** | `npm test` + `npm run typecheck` | All green |
| **L1** | Golden / fixture Extractor via MCP | V1 who-calls PlaceOrder matches golden |
| **L2** | TS AST on `fixtures/ts-pilot` | Same who-calls from real sources |
| **L3** | MCP in Cursor / Codex | Agent can generate → status → neighbors |
| **L4** | Banky API pilot | Real callers on a known method; envelope fresh |

Do not type into a bare `npm run mcp` terminal — stdio waits for an MCP client.

---

## L0 — Automated (always)

From Pack checkout:

```powershell
cd d:\projetos\personal\nero-code-graph
npm test
npm run typecheck
```

Covers contracts, CodeGraph, project store, freshness (incl. V5), TS Extractor, MCP host, knowledge_mirror.

---

## L1 — Fixture Extractor (no AST)

Uses `fixtures/minimal/graph.golden.json` — known `OrdersController.create` → `OrderService.PlaceOrder`.

### In-process (already in L0)

- `tests/contracts/golden.test.ts`
- `tests/codegraph/code-graph.test.ts`
- `tests/mcp/host.test.ts`

### MCP + fixture

Inspector spawns the MCP server from its own config. Shell `$env:…` alone is often **not** passed through — use Inspector `-e` flags (or the UI **Environment Variables** panel), then Connect.

```powershell
cd d:\projetos\personal\nero-code-graph
npx @modelcontextprotocol/inspector `
  -e NCG_ENABLE_MUTATIONS=true `
  -e NCG_USE_FIXTURE_EXTRACTOR=true `
  -e NCG_BOUND_ROOT="$PWD" `
  -e NCG_REPO_KEY=fixture.minimal `
  -- npm run start:mcp
```

In the Inspector UI, confirm the same keys appear under Environment before connecting. If you reconnect from the UI without those rows, generate returns `mutations_disabled`.

In Inspector:

1. `cg_generate_graph` → ok + fingerprint  
2. `cg_graph_status` → `exists: true`, `stale: false` (if no HEAD drift)  
3. `cg_get_neighbors`  

```json
{
  "nodeId": "method:src/orders/OrderService.ts#PlaceOrder",
  "direction": "incoming",
  "relationFilter": ["calls"]
}
```

**Pass:** hop `from` = `method:src/api/OrdersController.ts#create`, `provenance` = `EXTRACTED`, `evidence.line` = `10`.

Without `NCG_ENABLE_MUTATIONS=true`, generate returns `mutations_disabled`.

---

## L2 — TS AST fixture (`ts-pilot`)

Real sources under `fixtures/ts-pilot/` (default Extractor).

```powershell
cd d:\projetos\personal\nero-code-graph
npx --yes @modelcontextprotocol/inspector `
  -e NCG_ENABLE_MUTATIONS=true `
  -e NCG_BOUND_ROOT="$PWD\fixtures\ts-pilot" `
  -e NCG_REPO_KEY=ts-pilot `
  -- npm run start:mcp
```

Do **not** set `NCG_USE_FIXTURE_EXTRACTOR` (default = TS AST).

Same neighbors call as L1.

**Pass:** incoming `calls` to PlaceOrder from `OrdersController.create` with `file:line`. Artifact: `fixtures/ts-pilot/.nero-code-graph/graph.json` (gitignored).

---

## L3 — Cursor / Codex connected

### Cursor MCP config

Add a server (user or project MCP settings), adjust paths:

```json
{
  "mcpServers": {
    "nero-code-graph": {
      "command": "npx",
      "args": ["tsx", "d:/projetos/personal/nero-code-graph/src/mcp/stdio-main.ts"],
      "env": {
        "NCG_ENABLE_MUTATIONS": "true",
        "NCG_BOUND_ROOT": "d:/projetos/personal/nero-code-graph/fixtures/ts-pilot",
        "NCG_REPO_KEY": "ts-pilot"
      }
    }
  }
}
```

For fixture-only sessions, add `"NCG_USE_FIXTURE_EXTRACTOR": "true"` and set `NCG_BOUND_ROOT` to the Pack root.

Restart MCP / reload window. Confirm tools `cg_*` are listed.

### Agent checklist (skill `nero-code-graph`)

1. Ask: “Who calls PlaceOrder?”  
2. Agent: `cg_graph_status` → `cg_generate_graph` if needed → `cg_get_neighbors` / `cg_query_graph`  
3. Answer cites **EXTRACTED** + `file:line`  
4. Ask an ops question (“what did we decide about dual storage?”) → agent uses Nero Knowledge (`nero_*`), not `cg_*`

### Codex

Same stdio command + env as Cursor. Point Codex MCP config at `tsx …/stdio-main.ts` with `NCG_BOUND_ROOT` for the checkout under test. Use skill `nero-code-graph` for routing.

**Pass:** agent completes generate → query without inventing callers; stale/missing handled via status/rebuild.

---

## L4 — Banky API pilot

Bound root: `d:\projetos\personal\banky\banky_api` (Nest/TS).

```powershell
cd d:\projetos\personal\nero-code-graph
$banky = "d:\projetos\personal\banky\banky_api"
$sha = git -C $banky rev-parse HEAD
npx @modelcontextprotocol/inspector `
  -e NCG_ENABLE_MUTATIONS=true `
  -e NCG_BOUND_ROOT=$banky `
  -e NCG_ALLOWED_ROOTS=$banky `
  -e NCG_REPO_KEY=banky.api `
  -e NCG_GIT_COMMIT=$sha `
  -- npm run start:mcp
```

Suggested flow:

1. `cg_generate_graph` — expect non-trivial `nodeCount` / `edgeCount`  
2. `cg_graph_status` — fingerprint + `gitCommit`; `stale: false`  
3. Pick a real method from Banky (e.g. a service method you know has a controller caller)  
4. `cg_query_graph` with that symbol name, or `cg_get_neighbors` with the resolved node id  
5. Spot-check one hop against the file on disk

**Pass:** at least one **EXTRACTED** call edge matches source; no string-literal secrets in the artifact; regenerate after a small edit flips `stale` then restores callers (V5 mindset).

Optional dual-write (Manifest only in KR) — add more `-e` flags:

```powershell
  -e NCG_KNOWLEDGE_ROOT=<path-to-knowledge-repo> `
  -e NCG_MIRROR_BLOB_ROOT=<path-outside-kr> `
```

**Pass:** Manifest has fingerprint / `primaryLocation`, no `nodes`/`edges`/`links:`; blob outside KR.

---

## Freshness smoke (any level)

1. Index with `NCG_GIT_COMMIT=<sha>`  
2. Restart MCP with a different `NCG_GIT_COMMIT` → status `stale: true`  
3. With `NCG_STRICT_FRESHNESS=true`, query without `allowStale` → `graph_stale`  
4. Rebuild → `stale: false`

---

## What not to treat as a pass

| Signal | Meaning |
| --- | --- |
| Hang on `npm run mcp` / `start:mcp` with no client | Expected — use Inspector / Cursor / Codex |
| `mutations_disabled` | Env not on the **server** process — for Inspector use `-e NCG_ENABLE_MUTATIONS=true` (shell `$env:` alone often ignored) |
| Empty neighbors on Banky | Wrong node id, or Extractor limits (import-scoped calls only) — verify imports reach the callee |
| Grep-only answer while graph is fresh | Skill/routing miss — prefer `cg_*` |

---

## Quick matrix

| Goal | Command / setup |
| --- | --- |
| CI / local gate | `npm test` && `npm run typecheck` |
| Golden who-calls | L1 Inspector + fixture extractor |
| Real TS mini checkout | L2 `fixtures/ts-pilot` |
| Agent UX | L3 Cursor/Codex MCP + skill |
| Pilot | L4 `banky_api` bound root |
