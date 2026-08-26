# Routing — Nero Knowledge vs code-graph vs filesystem

When an agent working in Nero should call **which** surface.

## Routing table

| Question type | Use | Do not use |
| --- | --- | --- |
| Who calls / imports this symbol? Path A→B in code? Neighbors of a class/method? | **nero-code-graph** MCP (`cg_*`) | Nero Knowledge `find_related` / `links:` |
| What did we decide? Business rule? Troubleshooting? Project context? | **Nero Knowledge** MCP (`nero_*`) | code-graph |
| Exact file contents, edit buffer, unindexed WIP | **Filesystem** (Read/Grep) | Treating FS grep as a substitute for graph provenance |
| “Where is the graph artifact / is it stale?” | `cg_graph_status` / `cg_list_graphs` | Inventing paths |

**Freshness:** every query envelope includes `stale`. With `NCG_STRICT_FRESHNESS=true`, stale graphs return `graph_stale` unless the tool arg `allowStale: true`. Stale triggers: `NCG_GIT_COMMIT` ≠ indexed `gitCommit`, or live source fingerprint ≠ indexed `sourceFingerprint`. After source drift, call `cg_generate_graph` then re-query.

## Anti-patterns

1. **Do not** copy AST edges (`calls`, `imports`) into Nero Knowledge `links:` or `nero_link_knowledge`.
2. **Do not** answer structural “who calls X?” only with grep when the graph is indexed and fresh.
3. **Do not** treat Nero operational notes as a call graph.
4. **Do not** write GraphDocument blobs into Knowledge Repo git (Manifest only — Q13).

## Weak bridge (allowed)

Cite `file:line` from code-graph evidence inside a Nero note/evidence text. That is a citation, not an AST edge in the knowledge graph.

## Mixed scenarios

### A — Structure (code-graph)

Agent: “Who calls `PlaceOrder` in this checkout?”  
→ `cg_generate_graph` (if mutations on + stale/missing) → `cg_get_neighbors` / `cg_query_graph`.  
Expect `EXTRACTED` hops with `file:line`.

### B — Operation (Nero Knowledge)

Agent: “What is the active decision for dual storage of graphs?”  
→ `nero_get_project_context` / `nero_search_knowledge` on `nero-code-graph`.  
Do **not** invent edges in the GraphDocument.

### C — File (filesystem)

Agent: “Show me the body of `stdio-main.ts` to fix env parsing.”  
→ Read the file. Optionally confirm callers via code-graph after the edit + rebuild.
