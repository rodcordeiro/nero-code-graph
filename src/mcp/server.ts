import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CodeGraphMcpHost,
  generateSchema,
  neighborsSchema,
  nodeSchema,
  pathSchema,
  querySchema,
  type McpHostOptions,
} from "./host.js";

export function createMcpServer(options: McpHostOptions): McpServer {
  const host = new CodeGraphMcpHost(options);
  const server = new McpServer({
    name: "nero-code-graph",
    version: "0.1.0",
  });

  server.registerTool(
    "cg_generate_graph",
    {
      description:
        "Generate/rebuild the code graph for the bound checkout (mutation; requires enableMutations).",
      inputSchema: generateSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async (args) => host.cg_generate_graph(args),
  );

  server.registerTool(
    "cg_graph_status",
    {
      description: "Status of the active graph (fingerprint, counts, stale).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => host.cg_graph_status(),
  );

  server.registerTool(
    "cg_list_graphs",
    {
      description: "List known graphs for this MCP process.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => host.cg_list_graphs(),
  );

  server.registerTool(
    "cg_query_graph",
    {
      description: "Query the code graph with a natural-language / keyword question.",
      inputSchema: querySchema,
      annotations: { readOnlyHint: true },
    },
    async (args) => host.cg_query_graph(args),
  );

  server.registerTool(
    "cg_get_node",
    {
      description: "Get a graph node by id (kind:path#symbol).",
      inputSchema: nodeSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) => host.cg_get_node(args),
  );

  server.registerTool(
    "cg_get_neighbors",
    {
      description: "1-hop neighbors with optional relation/provenance filters.",
      inputSchema: neighborsSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) => host.cg_get_neighbors(args),
  );

  server.registerTool(
    "cg_shortest_path",
    {
      description: "Shortest directed path between two node ids.",
      inputSchema: pathSchema,
      annotations: { readOnlyHint: true },
    },
    async (args) => host.cg_shortest_path(args),
  );

  return server;
}

export { CodeGraphMcpHost } from "./host.js";
