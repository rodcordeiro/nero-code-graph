# 06 — Freshness stale + rebuild após drift

**What to build:** Toda query declara se o grafo está stale vs checkout; após mudança que adiciona caller, rebuild atualiza fingerprint e a nova aresta aparece na consulta.

**Blocked by:** 05 — Extractor code-only (adapter Graphify ou equivalente)

**Status:** ready-for-agent

- [ ] Metadados de fingerprint/commit no GraphDocument
- [ ] `stale: true` quando HEAD/fingerprint diverge
- [ ] Política strict (recusar ou exigir allowStale) configurável
- [ ] Cenário V5 (novo caller) passa
- [ ] Documentado para agentes no skill/AGENTS
