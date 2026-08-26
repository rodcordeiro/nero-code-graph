import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CodeGraph,
  FixtureExtractor,
  MemoryGraphStore,
} from "../../src/codegraph/index.js";
import { CodeGraphMcpHost } from "../../src/mcp/host.js";

const goldenPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/minimal/graph.golden.json",
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
    const status = await h.cg_graph_status();
    const statusBody = JSON.parse(status.content[0].text);
    expect(statusBody.exists).toBe(true);

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
});
