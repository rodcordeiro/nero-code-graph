import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CodeGraph, MemoryGraphStore } from "../../src/codegraph/index.js";
import { DotnetAstExtractor } from "../../src/extractors/dotnet-ast-extractor.js";

const pilotRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/dotnet-pilot",
);

describe("DotnetAstExtractor (code-only)", () => {
  it("extracts using-scoped PlaceOrder callers with file:line", async () => {
    const cg = new CodeGraph({
      extractor: new DotnetAstExtractor({ boundRoot: pilotRoot }),
      store: new MemoryGraphStore(),
    });
    await cg.rebuild({
      repoKey: "dotnet-pilot",
      rootLabel: "fixtures/dotnet-pilot",
    });
    const placeOrder = "method:src/Orders/OrderService.cs#PlaceOrder";
    const res = await cg.getNeighbors({
      nodeId: placeOrder,
      direction: "incoming",
      relationFilter: ["calls"],
    });
    expect("hops" in res.payload).toBe(true);
    if (!("hops" in res.payload)) return;
    const hop = res.payload.hops.find((h) => h.kind === "calls");
    expect(hop?.provenance).toBe("EXTRACTED");
    expect(hop?.from).toBe("method:src/Api/OrdersController.cs#create");
    expect(hop?.evidence?.file).toBe("src/Api/OrdersController.cs");
    expect(hop?.evidence?.line).toBeGreaterThan(0);
  });

  it("extracts methods without access modifiers (implicit private)", async () => {
    const extractor = new DotnetAstExtractor({ boundRoot: pilotRoot });
    const doc = await extractor.extract({
      repoKey: "dotnet-pilot",
      rootLabel: "fixtures/dotnet-pilot",
    });
    const helper = doc.nodes.find(
      (n) => n.id === "method:src/Orders/OrderService.cs#InternalHelper",
    );
    expect(helper).toBeDefined();
    expect(helper?.kind).toBe("method");
    expect(helper?.name).toBe("InternalHelper");
  });

  it("does not persist string literal values as node fields", async () => {
    const extractor = new DotnetAstExtractor({ boundRoot: pilotRoot });
    const doc = await extractor.extract({
      repoKey: "dotnet-pilot",
      rootLabel: "fixtures/dotnet-pilot",
    });
    expect(doc.nodes.length).toBeGreaterThan(0);
    expect(doc.extractorId).toBe("dotnet-ast");
    expect(doc.extractorVersion).toBe("0.1.0");
    const blob = JSON.stringify(doc);
    expect(blob.includes("secret-should-not-appear")).toBe(false);
    for (const n of doc.nodes) {
      expect(Object.keys(n).sort()).toEqual(
        expect.arrayContaining(["id", "kind", "name", "location"]),
      );
      expect(n.language).toBe("csharp");
    }
  });
});
