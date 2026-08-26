# 07 — Knowledge mirror (manifest; blob out of KR git)

**What to build:** Segundo backend que grava o **Manifest** no Knowledge Repo (fingerprint, builtAt, primaryLocation) sem `links:` AST. O **opaque blob** (GraphDocument completo) fica fora do git do Knowledge Repo (Q13) — local ou store não-git. Agente lista/descobre via manifesto; carrega o grafo do `project_artifact` (ou path apontado) com paridade EXTRACTED no mesmo commit quando ambos existem.

**Blocked by:** 06 — Freshness stale + rebuild após drift

**Status:** ready-for-agent

- [ ] `StorageLocation.knowledge_mirror` implementado
- [ ] Manifesto commitável no KR; sem edges tipados Nero
- [ ] Opaque blob **não** versionado no git do Knowledge Repo (Q13)
- [ ] Rebuild isolado: mirror não corrompe project store e vice-versa
- [ ] Paridade EXTRACTED (AC dual) no mesmo commit quando blob/local disponível
- [ ] Segurança: sem path escape; sem secrets no manifesto
