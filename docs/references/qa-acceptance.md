# QA acceptance — nero-code-graph

## Bom comportamento externo

Respostas estruturadas (nós/arestas), proveniência obrigatória, `file:line` citável, freshness explícita, erros tipados sem inventar callers, paridade EXTRACTED entre backends quando ambos existirem.

## Fatias

- **A** rebuild + status (allowlist, contagens, fingerprint)
- **B** query tools Graphify-shaped + golden EXTRACTED
- **C** dual storage parity (quando habilitado)
- **D** stale após drift de HEAD

## Seam

P0: CodeGraph / MCP black-box + fixture + golden JSON.  
P1: Query API in-process com o mesmo oracle.

## Cenários

| ID | Pergunta | Pass |
| --- | --- | --- |
| V1 | Quem chama método X? | callers + file:line + EXTRACTED ⊆ golden |
| V2 | Quem importa tipo Y? | files + relation imports |
| V3 | Path A→B | hops tipados + proveniência |
| V4 | Detalha nó Z | kind + definição + id estável |
| V5 | Rebuild após novo caller | status atualiza; novo caller aparece |

## Bloqueios ready-for-agent (ver open-questions)

Fixture golden, política INFERRED, nomes manage tools, stale vs HEAD, piloto.
