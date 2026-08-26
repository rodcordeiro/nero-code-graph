import type { NodeKind } from "./types.js";

export type NodeIdParts = {
  kind: NodeKind;
  relativePath: string;
  symbol: string;
};

const NODE_KINDS = new Set<NodeKind>(["file", "class", "method"]);

/** Normalize to forward-slash relative path (no leading `./`). */
export function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Stable Node.id: `kind:relative/path#symbol` (Q10).
 * Same inputs → same id across rebuilds.
 */
export function makeNodeId(parts: NodeIdParts): string {
  const relativePath = normalizeRelativePath(parts.relativePath);
  if (!parts.symbol) {
    throw new Error("Node.id requires a non-empty symbol");
  }
  return `${parts.kind}:${relativePath}#${parts.symbol}`;
}

export function parseNodeId(id: string): NodeIdParts {
  const hash = id.lastIndexOf("#");
  const colon = id.indexOf(":");
  if (colon <= 0 || hash <= colon) {
    throw new Error(`Invalid Node.id: ${id}`);
  }
  const kind = id.slice(0, colon) as NodeKind;
  if (!NODE_KINDS.has(kind)) {
    throw new Error(`Invalid Node.kind in id: ${kind}`);
  }
  return {
    kind,
    relativePath: id.slice(colon + 1, hash),
    symbol: id.slice(hash + 1),
  };
}
