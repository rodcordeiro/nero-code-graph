# 01 — Congelar contratos GraphDocument e envelope de resposta

**What to build:** Um contrato versionado (`schemaVersion: 1`) para documento de grafo, nós (file/class/method), arestas (imports/calls + proveniência) e envelope de query (`repoKey`, fingerprint/commit, stale, backend, file:line), verificável por testes golden sem depender de Graphify.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `GraphDocument` / `Node` / `Edge` / `StorageLocation` / `RebuildPolicy` documentados (`schemaVersion: 1`)
- [ ] `Node.id` = `kind` + path relativo + símbolo (Q10); round-trip estável documentado
- [ ] Envelope de resposta de query definido (campos obrigatórios)
- [ ] Golden JSON de exemplo versionado sob fixture mínima (mesmo sem extractor real)
- [ ] Gitignore default `.nero-code-graph/` alinhado a Q8
