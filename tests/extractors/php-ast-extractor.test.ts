import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CodeGraph, MemoryGraphStore } from "../../src/codegraph/index.js";
import { PhpAstExtractor } from "../../src/extractors/php-ast-extractor.js";

const pilotRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/php-pilot",
);

describe("PhpAstExtractor (code-only)", () => {
  it("extracts require-scoped PlaceOrder callers with file:line", async () => {
    const cg = new CodeGraph({
      extractor: new PhpAstExtractor({ boundRoot: pilotRoot }),
      store: new MemoryGraphStore(),
    });
    await cg.rebuild({ repoKey: "php-pilot", rootLabel: "fixtures/php-pilot" });
    const placeOrder = "method:src/Orders/OrderService.php#PlaceOrder";
    const res = await cg.getNeighbors({
      nodeId: placeOrder,
      direction: "incoming",
      relationFilter: ["calls"],
    });
    expect("hops" in res.payload).toBe(true);
    if (!("hops" in res.payload)) return;
    const hop = res.payload.hops.find((h) => h.kind === "calls");
    expect(hop?.provenance).toBe("EXTRACTED");
    expect(hop?.from).toBe("method:src/Api/OrdersController.php#create");
    expect(hop?.evidence?.file).toBe("src/Api/OrdersController.php");
    expect(hop?.evidence?.line).toBeGreaterThan(0);
  });

  it("does not persist string literal values as node fields", async () => {
    const extractor = new PhpAstExtractor({ boundRoot: pilotRoot });
    const doc = await extractor.extract({
      repoKey: "php-pilot",
      rootLabel: "fixtures/php-pilot",
    });
    expect(doc.nodes.length).toBeGreaterThan(0);
    expect(doc.extractorId).toBe("php-ast");
    expect(doc.extractorVersion).toBe("0.1.0");
    const blob = JSON.stringify(doc);
    expect(blob.includes("secret-should-not-appear")).toBe(false);
    for (const n of doc.nodes) {
      expect(Object.keys(n).sort()).toEqual(
        expect.arrayContaining(["id", "kind", "name", "location"]),
      );
      expect(n.language).toBe("php");
    }
  });
});
