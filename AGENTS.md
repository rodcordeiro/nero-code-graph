# nero-code-graph

Pack **nero-core** (domínio `mcp`): MCP de code-graph estrutural — gera, gerencia e consulta grafo AST (imports/calls file→class→method) para agentes.

| | |
| --- | --- |
| **Status** | MVP Iteration 1 — CodeGraph + TS Extractor + MCP stdio + freshness + optional knowledge_mirror |
| **Entrypoint** | `npm run mcp` — ver `.agents/references/runtime.md` |
| **Stack** | MCP stdio + núcleo CodeGraph; Extractor TS AST (fixture opt-in) |

## Como usar este contexto

| Quando | Onde |
| --- | --- |
| Identidade e regras rápidas | este `AGENTS.md` |
| **Consumir o Pack (tools / Nero complement)** | skill `nero-code-graph` (`.cursor/skills/nero-code-graph/`) |
| Estrutura / runtime / contratos / segurança | `.agents/references/` |
| Roteamento Nero vs code-graph vs FS | `.agents/references/routing.md` |
| Guideline domínio MCP | `$nero` → `references/guidelines/mcp-guidelines.md` |
| Spec e grill | `docs/references/spec-code-graph-pack.md` |
| Perguntas abertas | `docs/references/open-questions.md` |
| Backlog | GitHub Issues — `docs/backlog/README.md` |
| Issue tracker / triage / domain-docs | `docs/agents/` |

## Regras rápidas

1. Perguntas estruturais (“quem chama/importa X?”) → MCP `cg_*` / skill `nero-code-graph`; decisões/regras/ops → Nero Knowledge — edges AST fora de `links:` (`routing.md`).
2. Mudanças localizadas: contratos → núcleo CodeGraph → adapters → MCP host; testes no seam CodeGraph antes de detalhe de extractor.
3. Pack complementar nero-core — não misturar com knowledge operacional.
4. Validação: `npm test`; smoke MCP em `runtime.md`.

## Skills condicionais

| Condicao | Skill |
| --- | --- |
| Who-calls / imports / path / GraphDocument / cg_* | `nero-code-graph` |
| Servidor/consumidor MCP knowledge / ops | `$nero` + guideline mcp |
| Knowledge workflow | `$nero` |

## Agent skills

### Issue tracker

Issues live in GitHub Issues for this repo (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/` (+ `.agents/references/` for checkout ops). See `docs/agents/domain.md`.

### Iteration / Project board

Nero Scrum board iterations: prefer **current** pending work; new tasks default to **next**. See `docs/agents/iteration-workflow.md`. Hub: `nero-core` (`docs/agents/iteration-workflow.md` lá).
