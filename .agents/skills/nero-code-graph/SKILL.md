---
name: nero-code-graph
description: >-
  Code-graph Pack (MCP cg_*): who-calls, who-imports, neighbors, shortest path,
  GraphDocument freshness. Use for structural code questions on a bound checkout;
  complement to Nero Knowledge (ops/decisions) — never AST edges as Nero links.
---

# nero-code-graph

Optional **Pack** for nero-core. Server `nero-code-graph` exposes `cg_*` tools over a **CodeGraph**: rebuild and query a **GraphDocument** (file / class / method **Nodes**, `imports` / `calls` **Edges** with **Provenance**).

## Complement to Nero

| Surface | Owns | Typical tools |
| --- | --- | --- |
| **This Pack** | Structure of a checkout | `cg_*` |
| **Nero Knowledge** | Ops: decisions, rules, troubleshooting, project context | `nero_*` |
| **Filesystem** | Exact file body, unindexed WIP | Read / Grep |

**Bridge:** cite `file:line` from code-graph evidence inside a Nero note. Keep AST edges out of Nero `links:` / `nero_link_knowledge`. Optional **knowledge_mirror** writes a **Manifest** only into the Knowledge Repo; the **opaque blob** stays out of Knowledge Repo git.

When both skills apply: run structural queries here first; register operational conclusions with `$nero`.

## Process

### 1. Classify

Completion: one surface chosen.

- “Who calls / imports X?”, path A→B, neighbors of a symbol → **this Pack**
- Decision, rule, playbook, project inventory → **Nero Knowledge** (`$nero`)
- Show / edit this file’s body → **Filesystem**

### 2. Ready the graph

Completion: `cg_graph_status` shows `exists: true` and acceptable `stale`.

1. Call `cg_graph_status` (or `cg_list_graphs`).
2. If missing or stale and mutations are enabled → `cg_generate_graph`.
3. If `mutations_disabled` → tell the human to start the MCP with `NCG_ENABLE_MUTATIONS=true` (and a correct `NCG_BOUND_ROOT`).
4. Under strict freshness, pass `allowStale: true` only when a stale read is intentional; otherwise rebuild.

### 3. Query

Completion: response has envelope + payload; prefer **EXTRACTED** hops with `file:line`.

| Need | Tool |
| --- | --- |
| Keyword / “who calls …” phrasing | `cg_query_graph` |
| 1-hop callers/callees/imports | `cg_get_neighbors` |
| Node by id (`kind:path#symbol`) | `cg_get_node` |
| Directed path between two ids | `cg_shortest_path` |

Node ids: `method:src/orders/OrderService.ts#PlaceOrder` (see contracts in the Pack checkout).

### 4. Trust the envelope

Completion: every answer accounts for `stale`, `sourceFingerprint` / `gitCommit`, `backend`, and edge **Provenance**.

- Treat **EXTRACTED** as citable structure.
- After edits to the checkout, rebuild before treating callers as current.

### 5. Hand off to Nero (optional)

Completion: operational note cites evidence; no AST edges copied into knowledge links.

## Tool card

Full args and env: [tools.md](tools.md). Pack checkout pointers: `CONTEXT.md`, `.agents/references/routing.md`, `.agents/references/runtime.md`, `docs/references/testing-plan.md`.
