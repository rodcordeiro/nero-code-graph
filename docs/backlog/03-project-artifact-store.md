# 03 — Project artifact store + allowlist de roots

**What to build:** Persistência real do grafo no checkout bound (path canônico do pack), com rejeição de path traversal/symlink escape e paths relativos no artefato — rebuild escreve só no diretório de artefato.

**Blocked by:** 01 — Congelar contratos GraphDocument e envelope de resposta

**Status:** ready-for-agent

- [ ] Store `project_artifact` lê/escreve documento atomicamente
- [ ] Allowlist + realpath; rebuild fora da allowlist falha sem ler arquivos
- [ ] Artefato usa apenas paths relativos ao root
- [ ] Diretório de saída documentado e gitignore default do pack
- [ ] AC de segurança de path cobertos por teste
