import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CodeGraph,
  FixtureExtractor,
  MemoryGraphStore,
} from "../../src/codegraph/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const goldenPath = join(root, "fixtures/minimal/graph.golden.json");

function createGraph(gitCommit?: string) {
  return new CodeGraph({
    extractor: new FixtureExtractor(goldenPath),
    store: new MemoryGraphStore(),
    currentGitCommit: gitCommit,
  });
}

describe("CodeGraph seam", () => {
  it("rebuild → status → getNeighbors who-calls PlaceOrder with EXTRACTED file:line", async () => {
    const cg = createGraph("0000000000000000000000000000000000000000");
    await cg.rebuild({
      repoKey: "fixture.minimal",
      rootLabel: "fixtures/minimal",
    });
    const status = await cg.status();
    expect(status.exists).toBe(true);
    expect(status.nodeCount).toBeGreaterThan(0);
    expect(status.sourceFingerprint).toBeTruthy();

    const placeOrder = "method:src/orders/OrderService.ts#PlaceOrder";
    const neighbors = await cg.getNeighbors({
      nodeId: placeOrder,
      direction: "incoming",
      relationFilter: ["calls"],
    });
    expect("hops" in neighbors.payload).toBe(true);
    if (!("hops" in neighbors.payload)) return;
    expect(neighbors.envelope.stale).toBe(false);
    expect(neighbors.envelope.backend).toBe("project_artifact");
    const hop = neighbors.payload.hops.find((h) => h.kind === "calls");
    expect(hop?.provenance).toBe("EXTRACTED");
    expect(hop?.from).toBe("method:src/api/OrdersController.ts#create");
    expect(hop?.evidence?.file).toBe("src/api/OrdersController.ts");
    expect(hop?.evidence?.line).toBe(10);
  });

  it("get_node round-trips a known class", async () => {
    const cg = createGraph();
    await cg.rebuild({
      repoKey: "fixture.minimal",
      rootLabel: "fixtures/minimal",
    });
    const id = "class:src/orders/OrderService.ts#OrderService";
    const res = await cg.getNode(id);
    expect("node" in res.payload).toBe(true);
    if (!("node" in res.payload)) return;
    expect(res.payload.node.id).toBe(id);
    expect(res.payload.node.location.line).toBe(5);
  });

  it("shortest_path finds controller create → PlaceOrder", async () => {
    const cg = createGraph();
    await cg.rebuild({
      repoKey: "fixture.minimal",
      rootLabel: "fixtures/minimal",
    });
    const res = await cg.shortestPath(
      "method:src/api/OrdersController.ts#create",
      "method:src/orders/OrderService.ts#PlaceOrder",
    );
    expect("hops" in res.payload).toBe(true);
    if (!("hops" in res.payload)) return;
    expect(res.payload.hops.length).toBeGreaterThan(0);
    expect(res.payload.hops.every((h) => h.provenance)).toBe(true);
  });

  it("query_graph matches PlaceOrder callers", async () => {
    const cg = createGraph();
    await cg.rebuild({
      repoKey: "fixture.minimal",
      rootLabel: "fixtures/minimal",
    });
    const res = await cg.queryGraph("who calls PlaceOrder");
    expect("hops" in res.payload).toBe(true);
    if (!("hops" in res.payload)) return;
    expect(res.payload.matchedNodeIds.some((id) => id.includes("PlaceOrder"))).toBe(
      true,
    );
    expect(
      res.payload.hops.some(
        (h) => h.kind === "calls" && h.provenance === "EXTRACTED",
      ),
    ).toBe(true);
  });
});
