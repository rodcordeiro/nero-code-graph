import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CodeGraph } from "../codegraph/index.js";
import { ProjectArtifactStore, DualGraphStore, KnowledgeMirrorStore } from "../store/index.js";
import { createMcpServer } from "./server.js";
import { resolveExtractor } from "./resolve-extractor.js";

async function main() {
  const boundRoot = process.env.NCG_BOUND_ROOT ?? process.cwd();
  const allowed = (process.env.NCG_ALLOWED_ROOTS ?? boundRoot)
    .split(pathSep())
    .map((s) => s.trim())
    .filter(Boolean);
  const enableMutations = process.env.NCG_ENABLE_MUTATIONS === "true";

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

  const resolved = resolveExtractor({ boundRoot });
  const codeGraph = new CodeGraph({
    extractor: resolved.extractor,
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
    `nero-code-graph MCP stdio (mutations=${enableMutations}) root=${boundRoot} extractor=${resolved.extractor.id} language=${resolved.language} reason=${resolved.reason}`,
  );
}

function pathSep(): string | RegExp {
  return process.platform === "win32" ? /;/ : /:/;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
