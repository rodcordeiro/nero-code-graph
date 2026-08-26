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
- Rebuild MVP: `trigger` explicit or fingerprint mismatch; `codeOnly: true`

## QueryEnvelope (every query response)

Required: `repoKey`, `sourceFingerprint`, `stale`, `backend`, `schemaVersion`.  
Optional: `gitCommit`, `contentHash`.

Wrapped as `QueryResponse<T> = { envelope, payload }`.

## Gitignore

Pack/pilot default ignores `.nero-code-graph/` (Q8).
