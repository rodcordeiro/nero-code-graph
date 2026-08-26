# Structure

Checkout factual (2026-08-26):

```text
nero-code-graph/
  AGENTS.md
  CONTEXT.md
  README.md
  package.json
  src/contracts/          # schemaVersion 1 types + Node.id
  fixtures/minimal/       # graph.golden.json
  tests/contracts/
  docs/references/
  docs/agents/
  docs/backlog/           # seed index → GitHub Issues
  .agents/references/
```

Ainda **não** existem: entrypoint MCP, CodeGraph core, Extractor/Store adapters reais.

Alvo: host MCP fino → CodeGraph → Extractor + GraphStore.
