# Patterns

Observados no checkout:

- **Facade MCP** sobre núcleo CodeGraph (Pack pattern nero-core)
- **Extractor pluggable** — port `Extractor` + `resolveExtractor` por sinais / env
- **Dual GraphStore** — project_artifact primary; knowledge_mirror opcional (Manifest only)
- **Envelope de confiança** em generate/status/query (repoKey, stale, backend, extractor meta)
- **Import-scoped calls** — sem homônimo frouxo cross-file
