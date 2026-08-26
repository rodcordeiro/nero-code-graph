import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GRAPH_SCHEMA_VERSION,
  makeNodeId,
  type GraphDocument,
  type QueryEnvelope,
} from "../../src/contracts/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const goldenPath = join(root, "fixtures/minimal/graph.golden.json");

describe("GraphDocument golden (schemaVersion 1)", () => {
  const doc = JSON.parse(readFileSync(goldenPath, "utf8")) as GraphDocument;

  it("uses schemaVersion 1", () => {
    expect(doc.schemaVersion).toBe(GRAPH_SCHEMA_VERSION);
  });

  it("has fingerprint and target identity", () => {
    expect(doc.sourceFingerprint).toBeTruthy();
    expect(doc.target.repoKey).toBe("fixture.minimal");
  });

  it("keeps every node id aligned with makeNodeId", () => {
    for (const node of doc.nodes) {
      const expected = makeNodeId({
        kind: node.kind,
        relativePath: node.location.file,
        symbol: node.kind === "file" ? node.name : node.name,
      });
      expect(node.id).toBe(expected);
    }
  });

  it("tags every edge with provenance", () => {
    for (const edge of doc.edges) {
      expect(["EXTRACTED", "INFERRED", "AMBIGUOUS"]).toContain(edge.provenance);
    }
  });

  it("includes the who-calls PlaceOrder EXTRACTED hop with file:line", () => {
    const hop = doc.edges.find(
      (e) =>
        e.kind === "calls" &&
        e.to === "method:src/orders/OrderService.ts#PlaceOrder",
    );
    expect(hop?.provenance).toBe("EXTRACTED");
    expect(hop?.from).toBe("method:src/api/OrdersController.ts#create");
    expect(hop?.evidence?.file).toBe("src/api/OrdersController.ts");
    expect(hop?.evidence?.line).toBe(10);
  });
});

describe("QueryEnvelope shape", () => {
  it("requires stale + backend + fingerprint fields", () => {
    const envelope: QueryEnvelope = {
      repoKey: "fixture.minimal",
      sourceFingerprint: "fixture-minimal-v1",
      stale: false,
      backend: "project_artifact",
      schemaVersion: GRAPH_SCHEMA_VERSION,
    };
    expect(envelope.stale).toBe(false);
    expect(envelope.backend).toBe("project_artifact");
  });
});
