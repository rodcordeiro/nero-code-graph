import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CodeGraph,
  FixtureExtractor,
  TypescriptAstExtractor,
} from "../codegraph/index.js";
import { ProjectArtifactStore, DualGraphStore, KnowledgeMirrorStore } from "../store/index.js";
import { createMcpServer } from "./server.js";

async function main() {
  const boundRoot = process.env.NCG_BOUND_ROOT ?? process.cwd();
  const allowed = (process.env.NCG_ALLOWED_ROOTS ?? boundRoot)
    .split(pathSep())
    .map((s) => s.trim())
    .filter(Boolean);
  const enableMutations = process.env.NCG_ENABLE_MUTATIONS === "true";
  const useFixture = process.env.NCG_USE_FIXTURE_EXTRACTOR === "true";
  const fixtureGolden =
    process.env.NCG_FIXTURE_GOLDEN ??
    join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/minimal/graph.golden.json");

  const projectStore = new ProjectArtifactStore({
    boundRoot,
    allowedRoots: allowed,
  });
  const knowledgeRoot = process.env.NCG_KNOWLEDGE_ROOT;
  const blobRoot = process.env.NCG_MIRROR_BLOB_ROOT;
  const store =
    knowledgeRoot && blobRoot
      ? new DualGraphStore(
          projectStore,
          new KnowledgeMirrorStore({
            knowledgeRoot,
            blobRoot,
            allowedRoots: [...allowed, knowledgeRoot, blobRoot],
            manifestRelativePath: process.env.NCG_KNOWLEDGE_MANIFEST_PATH,
            primaryRelativePath: ".nero-code-graph/graph.json",
          }),
        )
      : projectStore;
  const extractor = useFixture
    ? new FixtureExtractor(fixtureGolden)
    : new TypescriptAstExtractor({ boundRoot });
  const codeGraph = new CodeGraph({
    extractor,
    store,
    backend: "project_artifact",
    currentGitCommit: process.env.NCG_GIT_COMMIT,
    strictFreshness: process.env.NCG_STRICT_FRESHNESS === "true",
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
