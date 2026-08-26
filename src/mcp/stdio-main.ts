import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CodeGraph,
  FixtureExtractor,
} from "../codegraph/index.js";
import { ProjectArtifactStore } from "../store/index.js";
import { createMcpServer } from "./server.js";

async function main() {
  const boundRoot = process.env.NCG_BOUND_ROOT ?? process.cwd();
  const allowed = (process.env.NCG_ALLOWED_ROOTS ?? boundRoot)
    .split(pathSep())
    .map((s) => s.trim())
    .filter(Boolean);
  const enableMutations = process.env.NCG_ENABLE_MUTATIONS === "true";
  const fixtureGolden =
    process.env.NCG_FIXTURE_GOLDEN ??
    join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/minimal/graph.golden.json");

  const store = new ProjectArtifactStore({
    boundRoot,
    allowedRoots: allowed,
  });
  const codeGraph = new CodeGraph({
    extractor: new FixtureExtractor(fixtureGolden),
    store,
    currentGitCommit: process.env.NCG_GIT_COMMIT,
  });

  const server = createMcpServer({
    codeGraph,
    enableMutations,
    defaultRepoKey: process.env.NCG_REPO_KEY ?? "local",
    defaultRootLabel: boundRoot,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `nero-code-graph MCP stdio (mutations=${enableMutations}) root=${boundRoot}`,
  );
}

function pathSep(): string | RegExp {
  return process.platform === "win32" ? /;/ : /:/;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
