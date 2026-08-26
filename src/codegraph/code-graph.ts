import { createHash } from "node:crypto";
import {
  GRAPH_SCHEMA_VERSION,
  type EdgeKind,
  type GraphDocument,
  type GraphEdge,
  type GraphNode,
  type Provenance,
  type QueryEnvelope,
  type QueryHop,
  type QueryResponse,
  type StorageMode,
} from "../contracts/types.js";
import type { Extractor, GraphStore } from "./ports.js";

export type CodeGraphOptions = {
  extractor: Extractor;
  store: GraphStore;
  backend?: StorageMode;
  /** When set, compare to doc.gitCommit / fingerprint for stale. */
  currentGitCommit?: string;
  strictFreshness?: boolean;
};

export type GraphStatus = {
  exists: boolean;
  sourceFingerprint?: string;
  gitCommit?: string;
  nodeCount: number;
  edgeCount: number;
  extractorId?: string;
  stale: boolean;
  backend: StorageMode;
};

export type NeighborQuery = {
  nodeId: string;
  direction?: "outgoing" | "incoming" | "both";
  relationFilter?: EdgeKind[];
  provenanceFilter?: Provenance[];
};

function contentHash(doc: GraphDocument): string {
  return createHash("sha256")
    .update(JSON.stringify({ nodes: doc.nodes, edges: doc.edges }))
    .digest("hex")
    .slice(0, 16);
}

export class CodeGraph {
  private readonly extractor: Extractor;
  private readonly store: GraphStore;
  private readonly backend: StorageMode;
  private readonly currentGitCommit?: string;
  private readonly strictFreshness: boolean;

  constructor(options: CodeGraphOptions) {
    this.extractor = options.extractor;
    this.store = options.store;
    this.backend = options.backend ?? "project_artifact";
    this.currentGitCommit = options.currentGitCommit;
    this.strictFreshness = options.strictFreshness ?? false;
  }

  async load(): Promise<GraphDocument | null> {
    return this.store.read();
  }

  async rebuild(input: {
    repoKey: string;
    rootLabel: string;
  }): Promise<GraphDocument> {
    const doc = await this.extractor.extract(input);
    doc.stats = {
      nodeCount: doc.nodes.length,
      edgeCount: doc.edges.length,
    };
    await this.store.write(doc);
    return doc;
  }

  async status(): Promise<GraphStatus> {
    const doc = await this.store.read();
    if (!doc) {
      return {
        exists: false,
        nodeCount: 0,
        edgeCount: 0,
        stale: true,
        backend: this.backend,
      };
    }
    return {
      exists: true,
      sourceFingerprint: doc.sourceFingerprint,
      gitCommit: doc.gitCommit,
      nodeCount: doc.nodes.length,
      edgeCount: doc.edges.length,
      extractorId: doc.extractorId,
      stale: this.isStale(doc),
      backend: this.backend,
    };
  }

  async getNode(
    nodeId: string,
  ): Promise<QueryResponse<{ node: GraphNode } | { error: string }>> {
    const doc = await this.requireDoc();
    const envelope = this.envelope(doc);
    if (this.strictFreshness && envelope.stale) {
      return {
        envelope,
        payload: { error: "graph_stale" },
      };
    }
    const node = doc.nodes.find((n) => n.id === nodeId);
    if (!node) {
      return { envelope, payload: { error: "node_not_found" } };
    }
    return { envelope, payload: { node } };
  }

  async getNeighbors(
    query: NeighborQuery,
  ): Promise<QueryResponse<{ hops: QueryHop[] } | { error: string }>> {
    const doc = await this.requireDoc();
    const envelope = this.envelope(doc);
    if (this.strictFreshness && envelope.stale) {
      return { envelope, payload: { error: "graph_stale" } };
    }
    const direction = query.direction ?? "both";
    const hops: QueryHop[] = [];
    for (const edge of doc.edges) {
      if (query.relationFilter && !query.relationFilter.includes(edge.kind)) {
        continue;
      }
      if (
        query.provenanceFilter &&
        !query.provenanceFilter.includes(edge.provenance)
      ) {
        continue;
      }
      const out =
        (direction === "outgoing" || direction === "both") &&
        edge.from === query.nodeId;
      const inn =
        (direction === "incoming" || direction === "both") &&
        edge.to === query.nodeId;
      if (!out && !inn) continue;
      hops.push({
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
        provenance: edge.provenance,
        evidence: edge.evidence,
      });
    }
    return { envelope, payload: { hops } };
  }

  async shortestPath(
    sourceId: string,
    targetId: string,
  ): Promise<QueryResponse<{ hops: QueryHop[] } | { error: string }>> {
    const doc = await this.requireDoc();
    const envelope = this.envelope(doc);
    if (this.strictFreshness && envelope.stale) {
      return { envelope, payload: { error: "graph_stale" } };
    }
    const adj = new Map<string, GraphEdge[]>();
    for (const edge of doc.edges) {
      const list = adj.get(edge.from) ?? [];
      list.push(edge);
      adj.set(edge.from, list);
    }
    const queue: string[] = [sourceId];
    const prev = new Map<string, { from: string; edge: GraphEdge }>();
    const seen = new Set<string>([sourceId]);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === targetId) break;
      for (const edge of adj.get(cur) ?? []) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        prev.set(edge.to, { from: cur, edge });
        queue.push(edge.to);
      }
    }
    if (sourceId !== targetId && !prev.has(targetId)) {
      return { envelope, payload: { error: "path_not_found" } };
    }
    const hops: QueryHop[] = [];
    let walk = targetId;
    while (walk !== sourceId) {
      const step = prev.get(walk);
      if (!step) break;
      hops.unshift({
        from: step.edge.from,
        to: step.edge.to,
        kind: step.edge.kind,
        provenance: step.edge.provenance,
        evidence: step.edge.evidence,
      });
      walk = step.from;
    }
    return { envelope, payload: { hops } };
  }

  async queryGraph(
    question: string,
  ): Promise<QueryResponse<{ hops: QueryHop[]; matchedNodeIds: string[] } | { error: string }>> {
    const doc = await this.requireDoc();
    const envelope = this.envelope(doc);
    if (this.strictFreshness && envelope.stale) {
      return { envelope, payload: { error: "graph_stale" } };
    }
    const tokens = question
      .toLowerCase()
      .split(/[^a-z0-9_#./:-]+/i)
      .filter((t) => t.length > 2);
    const matched = doc.nodes.filter((n) => {
      const hay = `${n.id} ${n.name}`.toLowerCase();
      return tokens.some((t) => hay.includes(t));
    });
    if (matched.length === 0) {
      return { envelope, payload: { hops: [], matchedNodeIds: [] } };
    }
    const ids = new Set(matched.map((n) => n.id));
    const hops: QueryHop[] = [];
    for (const edge of doc.edges) {
      if (ids.has(edge.from) || ids.has(edge.to)) {
        hops.push({
          from: edge.from,
          to: edge.to,
          kind: edge.kind,
          provenance: edge.provenance,
          evidence: edge.evidence,
        });
      }
    }
    return {
      envelope,
      payload: { hops, matchedNodeIds: [...ids] },
    };
  }

  private async requireDoc(): Promise<GraphDocument> {
    const doc = await this.store.read();
    if (!doc) {
      throw new Error("graph_not_indexed");
    }
    return doc;
  }

  private isStale(doc: GraphDocument): boolean {
    if (!this.currentGitCommit || !doc.gitCommit) return false;
    return this.currentGitCommit !== doc.gitCommit;
  }

  private envelope(doc: GraphDocument): QueryEnvelope {
    return {
      repoKey: doc.target.repoKey,
      sourceFingerprint: doc.sourceFingerprint,
      gitCommit: doc.gitCommit,
      stale: this.isStale(doc),
      backend: this.backend,
      contentHash: contentHash(doc),
      schemaVersion: GRAPH_SCHEMA_VERSION,
    };
  }
}
