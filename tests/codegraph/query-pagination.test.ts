import { describe, expect, it } from "vitest";
import { CodeGraph, MemoryGraphStore } from "../../src/codegraph/index.js";
import type { GraphDocument } from "../../src/contracts/types.js";
import { CodeGraphMcpHost, querySchema } from "../../src/mcp/host.js";
import { z } from "zod";

function fixture(): GraphDocument {
  const nodes = Array.from({ length: 240 }, (_, index) => ({
    id: `method:src/Service${index}.ts#Execute`,
    kind: "method" as const,
    name: "Execute",
    location: { file: `src/Service${index}.ts`, line: 1 },
  }));
  return {
    schemaVersion: 1,
    target: { repoKey: "pagination", rootLabel: "fixture" },
    builtAt: "2026-11-13T00:00:00.000Z",
    sourceFingerprint: "fixture",
    extractorId: "fake",
    extractorVersion: "0.0.0",
    nodes,
    edges: Array.from({ length: 370 }, (_, index) => ({
      from: nodes[index % nodes.length].id,
      to: nodes[(index + 1) % nodes.length].id,
      kind: "calls" as const,
      provenance: "AMBIGUOUS" as const,
      evidence: { file: nodes[index % nodes.length].location.file, line: index + 2 },
    })),
  };
}

async function graph() {
  const doc = fixture();
  const store = new MemoryGraphStore();
  await store.write(doc);
  const cg = new CodeGraph({
    store,
    extractor: { id: "fake", version: "0.0.0", extract: async () => doc },
  });
  return { cg, store, doc };
}

describe("CodeGraph query pagination", () => {
  it.each([370, 10, 0])("bounds both result arrays and recovers every result once with %i hops", async (edgeCount) => {
    const { cg, store, doc } = await graph();
    doc.edges = doc.edges.slice(0, edgeCount);
    await store.write(doc);
    const nodeIds: string[] = [];
    const evidenceLines: number[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const response = await cg.queryGraph("Execute", { cursor });
      if ("error" in response.payload) throw new Error(response.payload.error);
      const { hops, matchedNodeIds, page } = response.payload;
      expect(hops.length).toBeLessThanOrEqual(25);
      expect(matchedNodeIds.length).toBeLessThanOrEqual(25);
      expect(page.totalHops).toBe(edgeCount);
      expect(page.totalMatchedNodes).toBe(240);
      expect(response.envelope.repoKey).toBe("pagination");
      expect(hops.every((hop) => hop.provenance === "AMBIGUOUS")).toBe(true);
      nodeIds.push(...matchedNodeIds);
      evidenceLines.push(...hops.map((hop) => hop.evidence!.line));
      expect(page.truncated).toBe(Boolean(page.nextCursor));
      cursor = page.nextCursor;
      pages++;
      if (pages > 20) throw new Error("pagination did not terminate");
    } while (cursor);
    expect(pages).toBe(Math.ceil(Math.max(240, edgeCount) / 25));
    expect(nodeIds).toEqual(doc.nodes.map((node) => node.id));
    expect(evidenceLines).toEqual(doc.edges.map((edge) => edge.evidence!.line));
  });

  it("rejects invalid limits in the core and MCP schema", async () => {
    const { cg } = await graph();
    for (const limit of [0, -1, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = await cg.queryGraph("Execute", { limit });
      expect(result.payload).toEqual({ error: "invalid_query_limit" });
      expect(z.object(querySchema).safeParse({ question: "Execute", limit }).success).toBe(false);
    }
    const maximum = await cg.queryGraph("Execute", { limit: 100 });
    if ("error" in maximum.payload) throw new Error(maximum.payload.error);
    expect(maximum.payload.hops).toHaveLength(100);
    expect(maximum.payload.matchedNodeIds).toHaveLength(100);
  });

  it("rejects malformed cursors and cursors for a different query or rebuilt graph", async () => {
    const { cg, store, doc } = await graph();
    const first = await cg.queryGraph("Execute", { limit: 2 });
    if ("error" in first.payload) throw new Error(first.payload.error);
    const cursor = first.payload.page.nextCursor;
    expect(cursor).toBeTruthy();
    for (const invalid of ["!invalid", "e30", "x".repeat(513)]) {
      expect((await cg.queryGraph("Execute", { cursor: invalid })).payload).toEqual({ error: "invalid_query_cursor" });
    }
    expect((await cg.queryGraph("Service", { cursor })).payload).toEqual({ error: "invalid_query_cursor" });
    await store.write({ ...doc, builtAt: "2026-11-13T00:01:00.000Z" });
    expect((await cg.queryGraph("Execute", { cursor })).payload).toEqual({ error: "invalid_query_cursor" });
  });

  it("invalidates continuation when graph content changes without a fingerprint change", async () => {
    const { cg, store, doc } = await graph();
    const first = await cg.queryGraph("Execute");
    if ("error" in first.payload) throw new Error(first.payload.error);
    await store.write({ ...doc, edges: doc.edges.slice(1) });
    expect((await cg.queryGraph("Execute", { cursor: first.payload.page.nextCursor })).payload).toEqual({ error: "invalid_query_cursor" });
  });

  it("returns explicit completed metadata for no matches", async () => {
    const { cg } = await graph();
    const result = await cg.queryGraph("no-matching-symbol");
    expect(result.payload).toEqual({
      hops: [], matchedNodeIds: [],
      page: { limit: 25, totalMatchedNodes: 0, totalHops: 0, truncated: false },
    });
  });

  it("passes limit and cursor through the MCP host before serialization", async () => {
    const { cg } = await graph();
    const host = new CodeGraphMcpHost({ codeGraph: cg });
    const first = JSON.parse((await host.cg_query_graph({ question: "Execute", limit: 3 })).content[0].text);
    expect(first.payload.hops).toHaveLength(3);
    expect(first.payload.matchedNodeIds).toHaveLength(3);
    const next = JSON.parse((await host.cg_query_graph({ question: "Execute", limit: 3, cursor: first.payload.page.nextCursor })).content[0].text);
    expect(next.payload.hops[0].evidence.line).toBe(5);
    expect(next.payload.page.truncated).toBe(true);
    expect(z.object(querySchema).parse({ question: "Execute", limit: 3, cursor: first.payload.page.nextCursor }).cursor).toBe(first.payload.page.nextCursor);
  });
});
