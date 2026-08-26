# Spec — nero-code-graph (pack nero-core)

**Status:** ready-for-agent (com perguntas em aberto documentadas)  
**Domínio:** `mcp`  
**Fonte:** grill-with-docs + Supervisor / Sentinel / Nyx / Alaric + research Graphify (2026-08-26)  
**Perguntas em aberto:** [open-questions.md](./open-questions.md)

## Problem Statement

Agentes que usam o Nero precisam responder perguntas estruturais sobre um checkout — “quem importa/chama este símbolo?”, “qual o caminho A→B?”, “quais vizinhos deste nó?” — sem misturar arestas de AST com o grafo operacional do Knowledge Repo (decisões, regras, troubleshooting) e sem depender só de grep ou embeddings.

Hoje não há um pack nero-core que gere, gerencie e consulte um grafo de código próprio, compatível com o ecossistema Nero, com armazenamento no projeto analisado ou no knowledge do Nero.

## Solution

Entregar o pack **nero-code-graph**: servidor MCP que analisa o código-fonte de um projeto (AST / tree-sitter, inspirado no Graphify), materializa um grafo consultável para agentes e expõe tools de generate / manage / query.

- Compatível com **nero-core** como pack complementar (fora do canônico).
- Artefato de grafo pode viver no **próprio projeto** ou no **Knowledge Repo do Nero** (dual storage), sem transformar arestas AST em `links:` tipados do knowledge operacional.
- Agentes Nero preferem este MCP para navegação estrutural de código.
- Escopo de “quem chama quem”: relações de **importação e chamada** entre arquivos, classes e métodos **dentro** do próprio código; resolução de `calls` restrita a alvos alcançáveis via imports (e same-file), não matching frouxo de nomes.

## User Stories

1. As an Nero agent, I want to generate a code-only graph for a bound checkout, so that I can answer structural questions without grepping the tree.
2. As an Nero agent, I want to know whether the active graph is stale relative to the checkout, so that I do not refactor from outdated callers.
3. As an Nero agent, I want `query_graph` to answer “who calls/imports X?”, so that I get a scoped subgraph with provenance.
4. As an Nero agent, I want `get_node` for a file, class, or method, so that I can inspect definition location and kind.
5. As an Nero agent, I want `get_neighbors` with relation filters (`imports`, `calls`), so that I can expand one hop deliberately.
6. As an Nero agent, I want `shortest_path` between two symbols, so that I can explain structural reachability A→B.
7. As an Nero agent, I want every edge to carry `EXTRACTED` or `INFERRED` (and optionally `AMBIGUOUS`), so that I can trust or hedge answers.
8. As an Nero agent, I want `file:line` (or an explicit “no locality”) on useful hops, so that I can open evidence in the editor.
9. As an Nero agent, I want query responses to include `repoKey`, `commit`/`fingerprint`, `stale`, and `backend`, so that I know which graph I am reading.
10. As an Nero agent, I want structural questions routed to this MCP and operational questions to Nero Knowledge, so that the two graphs stay separate.
11. As an operator, I want the graph artifact stored in the analyzed project by default, so that the structural truth travels with the code.
12. As an operator, I want an option to store or mirror the graph under Nero knowledge, so that agents without a local rebuild can still discover freshness and location.
13. As an operator, I want AST call/import edges never written as Nero operational `links:`, so that GraphDiscipline stays clean.
14. As an operator, I want rebuild mutations opt-in and path-allowlisted, so that agents cannot scan arbitrary filesystem roots.
15. As an operator, I want string literals and secret-like values excluded from persisted nodes, so that the graph does not become an exfiltration cache.
16. As a pack maintainer, I want a stable `GraphDocument` schema versioned independently of Graphify’s on-disk format, so that we can swap extractors later.
17. As a pack maintainer, I want Graphify used only as an optional extraction adapter (`code-only`), so that the product surface remains Nero-owned MCP tools.
18. As a pack maintainer, I want a thin MCP host over a deep `CodeGraph` core, so that tests hit one primary seam.
19. As a developer on a pilot repo, I want “who calls SymbolX?” to return at least the golden EXTRACTED callers with file:line, so that the MVP is demoable.
20. As a developer, I want `graph_status` / list graphs before querying, so that I can bind to the correct checkout.
21. As a developer, I want rebuild to be idempotent for the same fingerprint, so that CI and agents do not churn artifacts.
22. As a developer, I want incremental update after file changes (post-MVP acceptable if full rebuild ships first), so that large repos stay usable.
23. As a security reviewer, I want symlink/junction escapes outside the bound root rejected, so that rebuild cannot read secrets outside the allowlist.
24. As a security reviewer, I want stdio-only transport in MVP, so that the graph is not exposed on the LAN.
25. As an Nero skill author, I want anti-patterns documented (do not copy AST edges into knowledge links), so that agents do not unify the two graphs.
26. As an Nero skill author, I want tool names that do not collide with `nero_*` or raw Graphify MCP, so that hosts can load both safely.
27. As a QA engineer, I want a versioned fixture mini-repo and golden EXTRACTED hops, so that CI validates agent-visible behavior.
28. As a QA engineer, I want dual-backend parity for EXTRACTED edges when both stores are enabled, so that storage choice does not change facts.
29. As a product owner, I want PR blast-radius / communities / LLM doc pass out of MVP, so that the first ship stays structural and local.
30. As a product owner, I want docs and knowledge to describe only the nero-core pack identity, so that agents route correctly.

## Implementation Decisions

- **Product boundary:** Pack complementar do nero-core (skill/roteamento + MCP sidecar). Fora do canônico Nero. Sem tools `nero_*`. Sem novos tipos de Schema para File/Class/Call.
- **Core module:** `CodeGraph` (load, rebuild, query, getNode, neighbors, shortestPath) é a única seam profunda de produto/teste. Extractor e GraphStore são adapters.
- **Extractor:** pluggable via **adapter** (Q7). O núcleo só fala `extract(checkout) → GraphDocument`. Graphify (`code-only`) é um adapter opcional no piloto — pode ser omitido, trocado por fake/stub nos testes, ou por outro engine depois. Não expor `graphify.serve` como superfície do pack.
- **Edge scope MVP:** node kinds `file` | `class` | `method` (module opcional); relations `imports` | `imports_from` | `calls` (+ containment `contains`/`method` para topologia). Calls cross-file só para alvos import-reachable (ou same-file); unresolved → sem aresta ou `AMBIGUOUS`, não INFERRED por homônimo.
- **Provenance:** `EXTRACTED` | `INFERRED` | `AMBIGUOUS` em toda aresta; EXTRACTED = fato AST; INFERRED = resolução estrutural (não passe LLM de docs no MVP).
- **Contracts (conceitual):** `GraphDocument`, `Node`, `Edge`, `StorageLocation` (`project_artifact` | `knowledge_mirror`), `RebuildPolicy`.
- **Storage:** primary default = `.nero-code-graph/graph.json` no checkout (Q1). Knowledge = **Manifest** no KR git + opaque blob **fora** do KR git (Q2, Q13); MVP demoável só com project store; mirror na fatia 07 (Q5). Proibido promover arestas AST a `links:` / `nero_link_knowledge`.
- **MCP tools MVP:** server `nero-code-graph`; `cg_generate_graph`, `cg_graph_status`, `cg_list_graphs`, `cg_query_graph`, `cg_get_node`, `cg_get_neighbors`, `cg_shortest_path` (Q3). Mutations **opt-in** (`enableMutations`; Q9); queries read-only hints.
- **Aceite:** golden CI bloqueia só EXTRACTED (Q6).
- **Node.id:** `kind` + path relativo + símbolo; estável entre rebuilds se o símbolo não mudou (Q10).
- **Git do artefato:** `.nero-code-graph/` gitignored por default; versionar só sob demanda do time do alvo (Q8).
- **Transport MVP:** stdio only.
- **Pilot (Q4):** Banky API, TypeScript.
- **Windows paths (Q11):** resolve final path; reject if outside allowlisted bound root (junction/symlink escape = fail closed).
- **Pack install (Q12):** future discussion; manual MCP host config for now.
- **Security defaults:** allowlist de roots + realpath; sem literais de string no grafo; envelope de confiança em toda query; paths relativos ao bound root; sem HTTP/clone/multimodal.
- **Freshness:** fingerprint/`gitCommit` no documento; `stale` nas respostas; política strict configurável.
- **Greenfield:** `schemaVersion: 1` agora; sem expand/contract até haver consumidor externo do formato.
## Testing Decisions

- Bom teste = comportamento externo visível ao agente (nós/arestas, proveniência, file:line, stale, erros tipados) — não detalhes do extractor.
- **Seam P0:** `CodeGraph` in-process com Extractor/Store fakes + golden JSON; espelho black-box MCP sobre a mesma fixture.
- Aceite MVP mede hops **EXTRACTED** contra golden; INFERRED visível mas não bloqueia pass salvo política explícita.
- Fatias demoáveis: (A) rebuild+status, (B) query tools, (C) dual storage parity quando ambos existirem, (D) stale flag.
- Cenários V1–V5: who-calls method; who-imports type; shortest_path controller→ledger; get_node; rebuild after new caller.
- Prior art: contratos Graphify MCP (mesmos verbos de query); guidelines Nero MCP (schema, hints, security path).
- Não preferir asserts em prosa LLM nem `GRAPH_REPORT.md` como oracle.

## Out of Scope

- Unificar arestas AST com `find_related` / knowledge tipado Nero.
- Passe LLM de docs/PDF/imagens/vídeo; extras multimodais Graphify.
- PR blast-radius / triage / Leiden communities / god_nodes no MVP (candidatos pós-MVP).
- Engine AST próprio como obrigação do dia 1 (facade permite depois).
- HTTP MCP multi-tenant / LAN.
- Secret scanner de produto (redaction estrutural ≠ compliance scan).
- Garantia de call-graph interprocedural perfeita (INFERRED é best-effort).

## Further Notes

- Research Graphify: [graphify-research.md](./graphify-research.md).
- Segurança: [security-decisions.md](./security-decisions.md).
- Arquitetura: [architecture-seams.md](./architecture-seams.md).
- QA: [qa-acceptance.md](./qa-acceptance.md).
- Backlog fatiado: [`docs/backlog/`](../backlog/).
- Inspiração pública: [Graphify](https://github.com/Graphify-Labs/graphify), [how-it-works](https://github.com/Graphify-Labs/graphify/blob/v8/docs/how-it-works.md).
