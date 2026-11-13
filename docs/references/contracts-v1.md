# Contracts — schemaVersion 1

Canonical TypeScript types: `src/contracts/`. Golden fixture: `fixtures/minimal/graph.golden.json`.

## GraphDocument

| Field | Notes |
| --- | --- |
| `schemaVersion` | `1` |
| `target.repoKey` / `rootLabel` | Identity; no absolute machine paths |
| `builtAt` | ISO-8601 |
| `sourceFingerprint` | Hash/fingerprint of indexed sources |
| `gitCommit` | Optional HEAD at build |
| `extractorId` / `extractorVersion` | Which Extractor adapter produced the doc |
| `nodes` / `edges` | See below |
| `stats` | Optional counts |

## Node

- `id` = `kind:relative/path#symbol` via `makeNodeId` (Q10)
- `kind`: `file` \| `class` \| `method`
- `location.file`: relative, `/` separators; `line` required

## Edge

- `from` / `to`: Node ids
- `kind`: `imports` \| `imports_from` \| `calls` \| `contains` \| `method`
- `provenance`: `EXTRACTED` \| `INFERRED` \| `AMBIGUOUS`
- `evidence`: optional `file` + `line`

## StorageLocation / RebuildPolicy

- Modes: `project_artifact` (default `.nero-code-graph/graph.json`) \| `knowledge_mirror` (Manifest in KR git; blob out of KR git — Q13)
- Manifest (`kind: code-graph-manifest`): fingerprint, builtAt, primaryLocation relative path, counts — **no** nodes/edges/`links:`
- Rebuild MVP: `trigger` explicit or fingerprint mismatch; `codeOnly: true`

## QueryEnvelope (every query response)

Required: `repoKey`, `sourceFingerprint`, `stale`, `backend`, `schemaVersion`.  
Optional: `gitCommit`, `contentHash`.

Wrapped as `QueryResponse<T> = { envelope, payload }`.

Freshness also compares the stored `extractorId` / `extractorVersion` with the
active adapter. After upgrading the TypeScript, PHP or .NET adapters from 0.1.0
to 0.1.1, existing artifacts are stale even when sources and git commit are
unchanged. Rebuild with `cg_generate_graph` before citing corrected structure;
strict freshness refuses the old artifact unless `allowStale` is explicit. No
storage migration is required. Downgrading the adapter likewise requires rebuild.

### Keyword query pagination

`cg_query_graph` / `CodeGraph.queryGraph` accepts optional `limit` (integer 1–100,
default 25) and opaque `cursor`. The successful payload remains `hops` plus
`matchedNodeIds`, with additive `page` metadata:

```json
{
  "hops": [],
  "matchedNodeIds": [],
  "page": {
    "limit": 25,
    "totalMatchedNodes": 0,
    "totalHops": 0,
    "truncated": false
  }
}
```

Each array contains at most `limit` entries. `page.nextCursor` exists when
`truncated` is true; repeat the exact question with that cursor to continue.
Nodes and hops are paged independently in artifact order: a page can contain
hops with no matched nodes (or the reverse) after the shorter array is exhausted.
Following every cursor recovers both complete arrays without replaying entries.
Hop endpoints need not appear in the current page's `matchedNodeIds`.

Continuation is bound to the question, target identity, build metadata and graph
content. After a rebuild or graph change, discard the cursor and restart the
query. Invalid continuations return `payload.error: "invalid_query_cursor"`;
invalid core limits return `invalid_query_limit` (the MCP schema also rejects
invalid limits). Freshness checks and the trust envelope remain unchanged.

Compatibility: `schemaVersion: 1`, GraphDocument storage, existing arguments and
result arrays are preserved. Large queries now return partial arrays by default;
consumers must follow `page.nextCursor` before claiming complete coverage. Rollback
requires reverting query/host pagination together; no persisted data migration is
needed.

## Gitignore

Pack/pilot default ignores `.nero-code-graph/` (Q8).
