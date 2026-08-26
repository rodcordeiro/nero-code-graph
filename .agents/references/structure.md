# Structure

Checkout factual:

```text
nero-code-graph/
  src/contracts/     # schemaVersion 1
  src/codegraph/     # CodeGraph + FixtureExtractor + MemoryStore
  src/store/         # ProjectArtifactStore + path allowlist
  src/mcp/           # cg_* host + stdio entry
  fixtures/minimal/
  tests/
  docs/
```

Start MCP: `npm run mcp` (see `.agents/references/runtime.md`).
