import { z } from "zod";
import type { CodeGraph } from "../codegraph/code-graph.js";
import type { EdgeKind, Provenance } from "../contracts/types.js";

export type McpHostOptions = {
  codeGraph: CodeGraph;
  /** When false, mutating tools refuse (Q9). Default false. */
  enableMutations?: boolean;
  defaultRepoKey?: string;
  defaultRootLabel?: string;
};

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  };
}

/**
 * Tool host for cg_* MCP tools — testable without stdio.
 */
export class CodeGraphMcpHost {
  private readonly cg: CodeGraph;
  private readonly enableMutations: boolean;
  private readonly defaultRepoKey: string;
  private readonly defaultRootLabel: string;

  constructor(options: McpHostOptions) {
    this.cg = options.codeGraph;
    this.enableMutations = options.enableMutations ?? false;
    this.defaultRepoKey = options.defaultRepoKey ?? "local";
    this.defaultRootLabel = options.defaultRootLabel ?? ".";
  }

  listToolNames(): string[] {
    return [
      "cg_generate_graph",
      "cg_graph_status",
      "cg_list_graphs",
      "cg_query_graph",
      "cg_get_node",
      "cg_get_neighbors",
      "cg_shortest_path",
    ];
  }

  async cg_generate_graph(args: {
    repoKey?: string;
    rootLabel?: string;
  }) {
    if (!this.enableMutations) {
      return errorResult("mutations_disabled");
    }
    const doc = await this.cg.rebuild({
      repoKey: args.repoKey ?? this.defaultRepoKey,
      rootLabel: args.rootLabel ?? this.defaultRootLabel,
    });
    return jsonResult({
      ok: true,
      sourceFingerprint: doc.sourceFingerprint,
      nodeCount: doc.nodes.length,
      edgeCount: doc.edges.length,
    });
  }

  async cg_graph_status() {
    return jsonResult(await this.cg.status());
  }

  async cg_list_graphs() {
    const status = await this.cg.status();
    return jsonResult({
      graphs: status.exists
        ? [
            {
              repoKey: this.defaultRepoKey,
              backend: status.backend,
              sourceFingerprint: status.sourceFingerprint,
              stale: status.stale,
            },
          ]
        : [],
    });
  }

  async cg_query_graph(args: { question: string; allowStale?: boolean }) {
    try {
      return jsonResult(
        await this.cg.queryGraph(args.question, {
          allowStale: args.allowStale,
        }),
      );
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  }

  async cg_get_node(args: { nodeId: string; allowStale?: boolean }) {
    try {
      return jsonResult(
        await this.cg.getNode(args.nodeId, { allowStale: args.allowStale }),
      );
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  }

  async cg_get_neighbors(args: {
    nodeId: string;
    direction?: "outgoing" | "incoming" | "both";
    relationFilter?: EdgeKind[];
    provenanceFilter?: Provenance[];
    allowStale?: boolean;
  }) {
    try {
      return jsonResult(await this.cg.getNeighbors(args));
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  }

  async cg_shortest_path(args: {
    sourceId: string;
    targetId: string;
    allowStale?: boolean;
  }) {
    try {
      return jsonResult(
        await this.cg.shortestPath(args.sourceId, args.targetId, {
          allowStale: args.allowStale,
        }),
      );
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  }
}

export const generateSchema = {
  repoKey: z.string().optional(),
  rootLabel: z.string().optional(),
};

export const querySchema = {
  question: z.string(),
  allowStale: z.boolean().optional(),
};

export const nodeSchema = {
  nodeId: z.string(),
  allowStale: z.boolean().optional(),
};

export const neighborsSchema = {
  nodeId: z.string(),
  direction: z.enum(["outgoing", "incoming", "both"]).optional(),
  relationFilter: z
    .array(z.enum(["imports", "imports_from", "calls", "contains", "method"]))
    .optional(),
  provenanceFilter: z
    .array(z.enum(["EXTRACTED", "INFERRED", "AMBIGUOUS"]))
    .optional(),
  allowStale: z.boolean().optional(),
};

export const pathSchema = {
  sourceId: z.string(),
  targetId: z.string(),
  allowStale: z.boolean().optional(),
};
