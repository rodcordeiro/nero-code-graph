import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CodeGraph,
  FixtureExtractor,
  MemoryGraphStore,
} from "../../src/codegraph/index.js";
import { DotnetAstExtractor } from "../../src/extractors/dotnet-ast-extractor.js";
import { PhpAstExtractor } from "../../src/extractors/php-ast-extractor.js";
import { CodeGraphMcpHost } from "../../src/mcp/host.js";

const goldenPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/minimal/graph.golden.json",
);
const phpPilotRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/php-pilot",
);
const dotnetPilotRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/dotnet-pilot",
);

function host(mutations = true) {
  const cg = new CodeGraph({
    extractor: new FixtureExtractor(goldenPath),
    store: new MemoryGraphStore(),
  });
  return new CodeGraphMcpHost({
    codeGraph: cg,
    enableMutations: mutations,
    defaultRepoKey: "fixture.minimal",
    defaultRootLabel: "fixtures/minimal",
  });
}

describe("MCP host cg_* tools", () => {
  it("lists stable cg_* tool names", () => {
    expect(host().listToolNames()).toEqual([
      "cg_generate_graph",
      "cg_graph_status",
      "cg_list_graphs",
      "cg_query_graph",
      "cg_get_node",
      "cg_get_neighbors",
      "cg_shortest_path",
    ]);
  });

  it("refuses generate when mutations disabled", async () => {
    const h = host(false);
    const res = await h.cg_generate_graph({});
    expect(res.isError).toBe(true);
  });

  it("generate → status → neighbors who-calls PlaceOrder", async () => {
    const h = host(true);
    const gen = await h.cg_generate_graph({});
    expect(gen.isError).toBeUndefined();
    const genBody = JSON.parse(gen.content[0].text);
    expect(genBody.extractorId).toBe("fake");
    expect(genBody.extractorVersion).toBe("0.0.0");

    const status = await h.cg_graph_status();
    const statusBody = JSON.parse(status.content[0].text);
    expect(statusBody.exists).toBe(true);
    expect(statusBody.extractorId).toBe("fake");
    expect(statusBody.extractorVersion).toBe("0.0.0");

    const neighbors = await h.cg_get_neighbors({
      nodeId: "method:src/orders/OrderService.ts#PlaceOrder",
      direction: "incoming",
      relationFilter: ["calls"],
    });
    const body = JSON.parse(neighbors.content[0].text);
    expect(body.envelope.backend).toBe("project_artifact");
    expect(body.payload.hops[0].provenance).toBe("EXTRACTED");
    expect(body.payload.hops[0].evidence.line).toBe(10);
  });

  it("PHP path: generate/status expose php-ast extractorId/version", async () => {
    const cg = new CodeGraph({
      extractor: new PhpAstExtractor({ boundRoot: phpPilotRoot }),
      store: new MemoryGraphStore(),
    });
    const h = new CodeGraphMcpHost({
      codeGraph: cg,
      enableMutations: true,
      defaultRepoKey: "php-pilot",
      defaultRootLabel: "fixtures/php-pilot",
    });
    const gen = await h.cg_generate_graph({});
    expect(gen.isError).toBeUndefined();
    const genBody = JSON.parse(gen.content[0].text);
    expect(genBody.extractorId).toBe("php-ast");
    expect(genBody.extractorVersion).toBe("0.1.0");
    expect(genBody.nodeCount).toBeGreaterThan(0);

    const status = await h.cg_graph_status();
    const statusBody = JSON.parse(status.content[0].text);
    expect(statusBody.extractorId).toBe("php-ast");
    expect(statusBody.extractorVersion).toBe("0.1.0");
  });

  it(".NET path: generate/status expose dotnet-ast extractorId/version", async () => {
    const cg = new CodeGraph({
      extractor: new DotnetAstExtractor({ boundRoot: dotnetPilotRoot }),
      store: new MemoryGraphStore(),
    });
    const h = new CodeGraphMcpHost({
      codeGraph: cg,
      enableMutations: true,
      defaultRepoKey: "dotnet-pilot",
      defaultRootLabel: "fixtures/dotnet-pilot",
    });
    const gen = await h.cg_generate_graph({});
    expect(gen.isError).toBeUndefined();
    const genBody = JSON.parse(gen.content[0].text);
    expect(genBody.extractorId).toBe("dotnet-ast");
    expect(genBody.extractorVersion).toBe("0.1.0");
    expect(genBody.nodeCount).toBeGreaterThan(0);

    const status = await h.cg_graph_status();
    const statusBody = JSON.parse(status.content[0].text);
    expect(statusBody.extractorId).toBe("dotnet-ast");
    expect(statusBody.extractorVersion).toBe("0.1.0");
  });
});
