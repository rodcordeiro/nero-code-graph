import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CodeGraph,
  FixtureExtractor,
  MemoryGraphStore,
} from "../../src/codegraph/index.js";
import { TypescriptAstExtractor } from "../../src/extractors/typescript-ast-extractor.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const goldenPath = join(root, "fixtures/minimal/graph.golden.json");
const pilotRoot = join(root, "fixtures/ts-pilot");

describe("freshness (stale + strict + V5)", () => {
  it("marks stale when HEAD diverges from indexed gitCommit", async () => {
    const store = new MemoryGraphStore();
    const indexed = new CodeGraph({
      extractor: new FixtureExtractor(goldenPath),
      store,
      currentGitCommit: "aaa",
    });
    await indexed.rebuild({
      repoKey: "fixture.minimal",
      rootLabel: "fixtures/minimal",
    });
    const drifted = new CodeGraph({
      extractor: new FixtureExtractor(goldenPath),
      store,
      currentGitCommit: "bbb",
    });
    const status = await drifted.status();
    expect(status.stale).toBe(true);
    const neighbors = await drifted.getNeighbors({
      nodeId: "method:src/orders/OrderService.ts#PlaceOrder",
      direction: "incoming",
    });
    expect(neighbors.envelope.stale).toBe(true);
  });

  it("strictFreshness refuses queries unless allowStale", async () => {
    const store = new MemoryGraphStore();
    await new CodeGraph({
      extractor: new FixtureExtractor(goldenPath),
      store,
      currentGitCommit: "aaa",
    }).rebuild({
      repoKey: "fixture.minimal",
      rootLabel: "fixtures/minimal",
    });
    const cg = new CodeGraph({
      extractor: new FixtureExtractor(goldenPath),
      store,
      currentGitCommit: "bbb",
      strictFreshness: true,
    });
    const blocked = await cg.getNode(
      "class:src/orders/OrderService.ts#OrderService",
    );
    expect(blocked.payload).toEqual({ error: "graph_stale" });
    const allowed = await cg.getNode(
      "class:src/orders/OrderService.ts#OrderService",
      { allowStale: true },
    );
    expect("node" in allowed.payload).toBe(true);
  });

  it("V5: rebuild after new caller updates fingerprint and neighbors", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "ncg-v5-"));
    for (const rel of [
      "src/api/OrdersController.ts",
      "src/orders/OrderService.ts",
      "src/payments/IPaymentClient.ts",
    ]) {
      const dest = join(tmp, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, readFileSync(join(pilotRoot, rel)));
    }

    const extractor = new TypescriptAstExtractor({ boundRoot: tmp });
    const cg = new CodeGraph({
      extractor,
      store: new MemoryGraphStore(),
      currentGitCommit: "c0",
    });
    await cg.rebuild({ repoKey: "v5", rootLabel: tmp });
    const before = await cg.status();
    expect(before.stale).toBe(false);
    const fpBefore = before.sourceFingerprint!;

    const placeOrder = "method:src/orders/OrderService.ts#PlaceOrder";
    const beforeNeighbors = await cg.getNeighbors({
      nodeId: placeOrder,
      direction: "incoming",
      relationFilter: ["calls"],
    });
    expect("hops" in beforeNeighbors.payload).toBe(true);
    if (!("hops" in beforeNeighbors.payload)) return;
    expect(beforeNeighbors.payload.hops).toHaveLength(1);

    // Drift: add a second caller without rebuilding yet.
    writeFileSync(
      join(tmp, "src/api/LegacyOrders.ts"),
      `import { OrderService } from "../orders/OrderService.js";

export class LegacyOrders {
  constructor(private readonly orders: OrderService) {}

  place(id: string): void {
    this.orders.PlaceOrder(id);
  }
}
`,
    );

    const drifted = await cg.status();
    expect(drifted.stale).toBe(true);

    await cg.rebuild({ repoKey: "v5", rootLabel: tmp });
    const after = await cg.status();
    expect(after.stale).toBe(false);
    expect(after.sourceFingerprint).not.toBe(fpBefore);

    const afterNeighbors = await cg.getNeighbors({
      nodeId: placeOrder,
      direction: "incoming",
      relationFilter: ["calls"],
    });
    expect("hops" in afterNeighbors.payload).toBe(true);
    if (!("hops" in afterNeighbors.payload)) return;
    const froms = afterNeighbors.payload.hops.map((h) => h.from).sort();
    expect(froms).toContain("method:src/api/OrdersController.ts#create");
    expect(froms).toContain("method:src/api/LegacyOrders.ts#place");
  });
});
