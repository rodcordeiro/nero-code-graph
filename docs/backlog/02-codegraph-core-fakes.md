# 02 — Núcleo CodeGraph com fakes (generate → status → query)

**What to build:** Comportamento ponta a ponta do núcleo: rebuild a partir de um Extractor fake, persistência via Store fake, e consultas `get_node` / `get_neighbors` / `shortest_path` / `query_graph` sobre a fixture golden — demoável sem MCP ainda.

**Blocked by:** 01 — Congelar contratos GraphDocument e envelope de resposta

**Status:** ready-for-agent

- [ ] CodeGraph expõe load/rebuild/query/neighbors/path
- [ ] Fixture sintética com callers/imports conhecidos passa golden EXTRACTED
- [ ] Respostas incluem proveniência e file:line (ou “sem localidade”)
- [ ] Status reporta fingerprint e contagens
- [ ] Testes no seam CodeGraph (sem JSON-RPC)
