# Architecture seams — nero-code-graph

## Veredito

Greenfield. Núcleo profundo **CodeGraph** = única seam primária de teste. Graphify (se usado) = adapter de extração. Primary storage = artefato no projeto; knowledge = mirror/manifest, nunca vocabulário AST operacional.

## Módulos

| Módulo | Papel |
| --- | --- |
| MCP Host | Fino: tools ↔ CodeGraph |
| CodeGraph | load / rebuild / query / neighbors / path |
| Extractor | checkout → GraphDocument (**adapter**; Graphify opcional) |
| GraphStore | project_artifact \| knowledge_mirror |

## Contratos

- `GraphDocument` — schemaVersion, target, fingerprint, nodes, edges, extractor meta
- `Node` — id estável, kind, name, location relativa
- `Edge` — from/to, kind, provenance, evidence opcional
- `StorageLocation` — mode + âncoras
- `RebuildPolicy` — trigger, scope, codeOnly, writeTargets

## Pack compliance (nero-core)

- Fora do canônico; Core não depende do pack
- Sem tools `nero_*`
- Sem novos KnowledgeNodeTypes para File/Class/Call
- Skill do pack roteia estrutura → este MCP; operação → Nero Knowledge

## Anti-padrões

- Persistência canônica = JSON cru Graphify
- `nero_link_knowledge` para calls/imports
- Expor HTTP Graphify como produto do pack
