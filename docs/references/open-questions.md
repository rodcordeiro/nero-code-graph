# Open questions — nero-code-graph

No product blockers open.  
Closed decisions below (do not reopen without a new grill round).

Reference: [spec-code-graph-pack.md](./spec-code-graph-pack.md)

---

## Closed (2026-08-26)

| ID | Decision |
| --- | --- |
| **Q1** | Default artifact: `.nero-code-graph/graph.json` (+ optional cache; gitignore in pack) |
| **Q2** | Knowledge: manifest + optional opaque blob; this MCP owns I/O; no AST `links:` |
| **Q3** | Server `nero-code-graph`; tools `cg_*` |
| **Q4** | Pilot: **TypeScript** checkout of the **Banky API**; prove who-calls with `file:line` |
| **Q5** | MVP demos `project_artifact`; dual contract + parity AC in spec; `knowledge_mirror` in ticket 07 |
| **Q6** | CI gate = **EXTRACTED** hops only; INFERRED typed but not golden-blocking |
| **Q7** | Pluggable Extractor adapter; Graphify optional (`code-only`); contract = `GraphDocument` |
| **Q8** | Artifact **gitignored** by default + local rebuild; commit only if the target team wants it |
| **Q9** | Mutations/`cg_generate_graph` **opt-in** (`enableMutations`); always require allowlisted bound root |
| **Q10** | `Node.id` = `kind` + relative path + symbol; stable across rebuilds if symbol unchanged |
| **Q11** | Windows paths: **resolve final path**; **fail closed** if outside allowlisted bound root |
| **Q12** | Pack discovery/install in nero-core = **future discussion** (manual MCP host config for now) |
| **Q13** | Knowledge Repo **git**: commit **Manifest only**. Keep the **opaque blob** out of Knowledge Repo git (local / non-git store unless a later need forces otherwise) |

## Already closed (product)

| Decision | State |
| --- | --- |
| Pack nero-core | Closed |
| MCP separate from operational Nero Knowledge | Closed |
| Dual storage allowed | Closed |
| Scope = in-repo AST imports/calls | Closed |
| Nero agents prefer this MCP for code structure | Closed |
| Import-reachable calls | Closed |
| No AST edges as Nero `links:` | Closed |

---

## Frontier

None blocking. Ticket `01` can start.
