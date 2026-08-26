# Grill analysis — nero-code-graph (2026-08-26)

Síntese Supervisor + Sentinel + Nyx + Alaric + docs-researcher (Graphify), a partir do zettel `1-202607311620` **reframeado** para pack nero-core.

## Fronteira

| É | Não é |
| --- | --- |
| Pack complementar nero-core | Canônico `skills/nero/` |
| Grafo AST file/class/method | Knowledge operacional Nero |
| Dono generate/manage/query | Substituto do MCP Nero Knowledge |
| Dual storage projeto / knowledge artifact | Unificação de edges AST em `links:` |

## Settled

Pack nero-core; MCP próprio; agente prefere este MCP para estrutura; edges = imports/calls internos; dual storage; proveniência EXTRACTED/INFERRED; MVP query + manage; code-only.

## Recomendações consolidadas

1. Facade MCP + adapter Graphify code-only (não serve cru).
2. Seam única: CodeGraph.
3. Primary artifact no checkout; knowledge = mirror/manifest.
4. Calls import-reachable.
5. Segurança: allowlist, sem literais, envelope stale, stdio, mutations opt-in.

## Entregáveis desta sessão

- Spec: [spec-code-graph-pack.md](./spec-code-graph-pack.md)
- Abertas: [open-questions.md](./open-questions.md)
- Backlog: [`../backlog/`](../backlog/)
