# Structure

Checkout factual:

```text
nero-code-graph/
  src/contracts/     # schemaVersion 1
  src/codegraph/     # CodeGraph + FixtureExtractor + MemoryStore
  src/extractors/    # typescript-ast, php-ast, dotnet-ast
  src/store/         # ProjectArtifactStore + knowledge_mirror + allowlist
  src/mcp/           # cg_* host, resolve-extractor, stdio entry
  fixtures/          # minimal, ts-pilot, php-pilot, dotnet-pilot
  tests/
  docs/
  .agents/           # skill + references
```

Start MCP: `npm run mcp` (see `.agents/references/runtime.md`).
