/** schemaVersion 1 — GraphDocument and related contracts (issue #1). */

export const GRAPH_SCHEMA_VERSION = 1 as const;

export type NodeKind = "file" | "class" | "method";

export type EdgeKind =
  | "imports"
  | "imports_from"
  | "calls"
  | "contains"
  | "method";

export type Provenance = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

export type StorageMode = "project_artifact" | "knowledge_mirror";

export type SourceLocation = {
  /** Path relative to bound root; forward slashes only. */
  file: string;
  line: number;
  endLine?: number;
};

export type GraphNode = {
  /** `kind:relative/path#symbol` — stable across rebuilds if symbol unchanged. */
  id: string;
  kind: NodeKind;
  name: string;
  location: SourceLocation;
  language?: string;
};

export type GraphEdge = {
  from: string;
  to: string;
  kind: EdgeKind;
  provenance: Provenance;
  confidence?: number;
  evidence?: SourceLocation;
};

export type GraphDocument = {
  schemaVersion: typeof GRAPH_SCHEMA_VERSION;
  target: {
    repoKey: string;
    /** Logical root id; not an absolute machine path. */
    rootLabel: string;
  };
  builtAt: string;
  sourceFingerprint: string;
  gitCommit?: string;
  extractorId: string;
  extractorVersion: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats?: {
    nodeCount: number;
    edgeCount: number;
  };
};

export type StorageLocation = {
  mode: StorageMode;
  /** Relative dir under bound root for project_artifact (default `.nero-code-graph`). */
  projectArtifactDir?: string;
  /** Knowledge Repo relative path for Manifest only (Q13: blob not in KR git). */
  knowledgeManifestPath?: string;
};

export type RebuildPolicy = {
  trigger: "explicit" | "fingerprint_mismatch";
  codeOnly: true;
  writeTargets: StorageMode[];
  languages?: string[];
  includeGlobs?: string[];
  excludeGlobs?: string[];
};

/** Envelope required on every query/tool response (trust metadata). */
export type QueryEnvelope = {
  repoKey: string;
  sourceFingerprint: string;
  gitCommit?: string;
  stale: boolean;
  backend: StorageMode;
  contentHash?: string;
  schemaVersion: typeof GRAPH_SCHEMA_VERSION;
};

export type QueryHop = {
  from: string;
  to: string;
  kind: EdgeKind;
  provenance: Provenance;
  evidence?: SourceLocation;
};

export type QueryResponse<TPayload> = {
  envelope: QueryEnvelope;
  payload: TPayload;
};
