# 04 — MCP stdio: manage + query tools

**What to build:** Servidor MCP stdio do pack expondo generate/status/list + query_graph/get_node/get_neighbors/shortest_path sobre CodeGraph, com hints read-only nas queries e mutations explícitas — agente consegue indexar a fixture e perguntar “quem chama X?”.

**Blocked by:** 02 — Núcleo CodeGraph com fakes; 03 — Project artifact store + allowlist de roots

**Status:** ready-for-agent

- [ ] Tools listáveis com schemas estáveis (prefixo conforme Q3)
- [ ] Fluxo generate → status → neighbors/path na fixture
- [ ] Envelope de confiança em toda resposta de query
- [ ] Mutations respeitam policy opt-in / bound root
- [ ] Smoke stdio documentado no AGENTS/runtime
