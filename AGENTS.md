# nero-code-graph

Pack **nero-core** (domínio `mcp`): MCP de code-graph estrutural — gera, gerencia e consulta grafo AST (imports/calls file→class→method) para agentes.

| | |
| --- | --- |
| **Status** | Bootstrap / spec (implementação pendente) |
| **Entrypoint** | A definir (MCP stdio) — ver `.agents/references/runtime.md` |
| **Stack alvo** | MCP stdio + núcleo CodeGraph; extractor code-only pluggable (Graphify adapter candidato) |

## Como usar este contexto

| Quando | Onde |
| --- | --- |
| Identidade e regras rápidas | este `AGENTS.md` |
| Estrutura / runtime / contratos / segurança | `.agents/references/` |
| Guideline domínio MCP | `$nero` → `references/guidelines/mcp-guidelines.md` |
| Spec e grill | `docs/references/spec-code-graph-pack.md` |
| Perguntas abertas | `docs/references/open-questions.md` |
| Backlog (seed → GH) | `docs/backlog/README.md` — canônico: GitHub Issues |
| Issue tracker / triage / domain-docs skills | `docs/agents/` |

## Regras rápidas

1. Perguntas estruturais de código (“quem chama/importa X?”) → este MCP; decisões/regras/ops → Nero Knowledge — **não** unificar edges AST em `links:`.
2. Mudanças localizadas: contratos → núcleo CodeGraph → adapters → MCP host; testes no seam CodeGraph antes de detalhe de extractor.
3. Pack complementar nero-core — não misturar com knowledge operacional.
4. Validação: quando houver código, preferir testes do núcleo + smoke MCP stdio (comandos em `runtime.md`).

## Skills condicionais

| Condicao | Skill |
| --- | --- |
| Servidor/consumidor MCP | `$nero` + guideline mcp |
| Knowledge workflow | `$nero` |

## Agent skills

### Issue tracker

Issues live in GitHub Issues for this repo (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/` (+ `.agents/references/` for checkout ops). See `docs/agents/domain.md`.

### Iteration / Project board

Nero Scrum board iterations: prefer **current** pending work; new tasks default to **next**. See `docs/agents/iteration-workflow.md`.
