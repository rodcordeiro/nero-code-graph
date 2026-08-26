# CONTEXT.md — nero-code-graph

## Purpose

This pack builds a **code graph** from a project checkout. Agents use the MCP to generate, manage, and query that graph.

## Ubiquitous language

| Term | Meaning |
| --- | --- |
| **Pack** | Optional nero-core add-on (MCP + skill). Not part of Nero core schema. |
| **CodeGraph** | Core module. Loads, rebuilds, and queries the graph. |
| **GraphDocument** | Versioned graph snapshot (`schemaVersion`, nodes, edges, fingerprint). |
| **Node** | `file`, `class`, or `method` in the checkout. |
| **Edge** | Relation such as `imports` or `calls`, with provenance. |
| **Provenance** | `EXTRACTED` (from source) or `INFERRED` (resolved). |
| **Extractor** | Adapter that reads source and returns a `GraphDocument`. |
| **GraphStore** | Adapter that reads/writes a `GraphDocument`. |
| **project_artifact** | Graph file in the analyzed checkout (default `.nero-code-graph/`). |
| **knowledge_mirror** | Optional copy under the Nero Knowledge Repo. |
| **Manifest** | Small metadata note (fingerprint, built time, primary location). |
| **Opaque blob** | Full graph file (JSON bytes). Not a Nero operational note. **Not** committed to Knowledge Repo git (Q13). |
| **Bound root** | Allowlisted checkout root for read/rebuild. |
| **Pilot** | First real checkout used to prove “who calls X?”. |

## Product boundary

- Structural questions → this MCP (`cg_*`).
- Operational knowledge (decisions, rules) → Nero Knowledge MCP.
- Do not turn code-graph edges into Nero `links:`.
