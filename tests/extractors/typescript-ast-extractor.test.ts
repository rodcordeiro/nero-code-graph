import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CodeGraph, MemoryGraphStore } from "../../src/codegraph/index.js";
import { TypescriptAstExtractor } from "../../src/extractors/typescript-ast-extractor.js";

const pilotRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/ts-pilot",
);

describe("TypescriptAstExtractor (code-only)", () => {
  it("extracts import-scoped PlaceOrder callers with file:line", async () => {
    const cg = new CodeGraph({
      extractor: new TypescriptAstExtractor({ boundRoot: pilotRoot }),
      store: new MemoryGraphStore(),
    });
    await cg.rebuild({ repoKey: "ts-pilot", rootLabel: "fixtures/ts-pilot" });
    const placeOrder = "method:src/orders/OrderService.ts#PlaceOrder";
    const res = await cg.getNeighbors({
      nodeId: placeOrder,
      direction: "incoming",
      relationFilter: ["calls"],
    });
    expect("hops" in res.payload).toBe(true);
    if (!("hops" in res.payload)) return;
    const hop = res.payload.hops.find((h) => h.kind === "calls");
    expect(hop?.provenance).toBe("EXTRACTED");
    expect(hop?.from).toBe("method:src/api/OrdersController.ts#create");
    expect(hop?.evidence?.file).toBe("src/api/OrdersController.ts");
    expect(hop?.evidence?.line).toBeGreaterThan(0);
  });

  it("does not persist string literal values as node fields", async () => {
    const extractor = new TypescriptAstExtractor({ boundRoot: pilotRoot });
    const doc = await extractor.extract({
      repoKey: "ts-pilot",
      rootLabel: "fixtures/ts-pilot",
    });
    const blob = JSON.stringify(doc);
    expect(blob.includes("secret-should-not-appear")).toBe(false);
    for (const n of doc.nodes) {
      expect(Object.keys(n).sort()).toEqual(
        expect.arrayContaining(["id", "kind", "name", "location"]),
      );
    }
  });
});
