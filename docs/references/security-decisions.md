# Security decisions — nero-code-graph

## Hard requirements (MVP)

1. Allowlist + realpath do `rootPath`; fail closed; deny symlink/junction **escape** (resolved path must stay under bound root; Q11).
2. Primary graph artifact **não** sob KnowledgeRoot sem contrato explícito de mirror; MVP escreve no checkout bound.
3. Nós sem string literals / source body; spans + nomes simbólicos.
4. Redaction/secret patterns antes do write (defesa em profundidade).
5. Mutations opt-in; queries read-only.
6. Envelope: `repoKey`, `gitCommit`/fingerprint, `stale`, `contentHash`, `backend`.
7. Paths relativos only no artefato.
8. stdio only; sem clone remoto; sem multimodal.
9. Diretório de artefato no `.gitignore` do pack/piloto por default.

## Defaults

| Tema | Default |
| --- | --- |
| Store | `<checkout>/.nero-code-graph/` (path final: open-questions Q1) |
| Knowledge | **Manifest** no KR git; opaque blob **fora** do KR git (Q13); nunca edges tipados |
| Transport | stdio |
| Freshness | strict configurável; stale sempre visível |
| Graphify | adapter code-only pinado **ou** extractor próprio; sem HTTP |

## Out of scope (segurança)

HTTP/LAN, multi-tenant auth, dump completo do grafo como notas operacionais Nero, `graphify clone`, garantia de call-graph perfeita.

## ACs de segurança (checklist)

- Rebuild fora de allowlist → erro Security; zero reads
- Junction/symlink cujo path final sai do bound root → rejeitado
- Fixture com Bearer/connection string → valor ausente no JSON
- Query sempre com envelope de confiança
- HEAD ≠ indexed + strict → query sem `allowStale` falha
- Mutations off → rebuild Forbidden/ausente
- Sem TCP listener no MVP
