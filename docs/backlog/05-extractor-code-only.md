# 05 — Extractor code-only (adapter Graphify ou equivalente)

**What to build:** Extração real AST code-only de um checkout piloto via **adapter** pluggable (Graphify `code-only` candidato; o núcleo não depende dele), normalizada para GraphDocument, com calls cross-file apenas import-reachable — “quem chama Symbol?” no piloto retorna file:line EXTRACTED.

**Blocked by:** 04 — MCP stdio: manage + query tools

**Status:** ready-for-agent

- [ ] Adapter de extração pluggable atrás de CodeGraph
- [ ] Code-only (sem passe LLM de docs)
- [ ] Política import-scoped para `calls` aplicada
- [ ] Piloto **Banky API (TypeScript)** responde who-calls com evidência
- [ ] Nós sem literais de string / secrets no artefato
- [ ] Path Windows: realpath + reject escape fora do bound root (Q11)
