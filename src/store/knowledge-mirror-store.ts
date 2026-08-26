import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GraphDocument } from "../contracts/types.js";
import type { GraphStore } from "../codegraph/ports.js";
import {
  PathSecurityError,
  assertBoundRootAllowed,
  assertUnderBoundRoot,
  isPathInsideRoot,
} from "./project-artifact-store.js";

export const MANIFEST_KIND = "code-graph-manifest" as const;

/**
 * Commitable Manifest only — no nodes/edges/links (Q13).
 * Opaque GraphDocument lives under `blobRoot`, outside Knowledge Repo git.
 */
export type CodeGraphManifest = {
  schemaVersion: 1;
  kind: typeof MANIFEST_KIND;
  repoKey: string;
  rootLabel: string;
  sourceFingerprint: string;
  builtAt: string;
  gitCommit?: string;
  extractorId: string;
  extractorVersion: string;
  /** Where agents load the GraphDocument (project artifact or opaque local). */
  primaryLocation: {
    mode: "project_artifact" | "opaque_local";
    /** Relative path label — never absolute machine secrets. */
    relativePath: string;
  };
  stats?: {
    nodeCount: number;
    edgeCount: number;
  };
};

export type KnowledgeMirrorStoreOptions = {
  /** Knowledge Repo root (allowlisted). Manifest is written under it. */
  knowledgeRoot: string;
  allowedRoots: string[];
  /** Relative path under knowledgeRoot for the Manifest JSON. */
  manifestRelativePath?: string;
  /**
   * Root for opaque GraphDocument blob — must NOT be under knowledgeRoot
   * (kept out of KR git — Q13). Allowlisted separately.
   */
  blobRoot: string;
  blobRelativePath?: string;
  /** Logical primary location written into the Manifest (agent-facing). */
  primaryRelativePath?: string;
};

const DEFAULT_MANIFEST = join(
  "knowledge",
  "projects",
  "local",
  "code-graph.manifest.json",
);
const DEFAULT_BLOB = "graph.json";

/**
 * GraphStore for knowledge_mirror: Manifest in KR + opaque blob outside KR git.
 */
export class KnowledgeMirrorStore implements GraphStore {
  readonly knowledgeRootReal: string;
  readonly blobRootReal: string;
  readonly manifestPath: string;
  readonly blobPath: string;
  readonly primaryRelativePath: string;

  constructor(options: KnowledgeMirrorStoreOptions) {
    this.knowledgeRootReal = assertBoundRootAllowed(
      options.knowledgeRoot,
      options.allowedRoots,
    );
    this.blobRootReal = assertBoundRootAllowed(
      options.blobRoot,
      options.allowedRoots,
    );
    if (isPathInsideRoot(this.knowledgeRootReal, this.blobRootReal)) {
      throw new PathSecurityError(
        "opaque blob root must be outside Knowledge Repo root (Q13)",
      );
    }
    this.manifestPath = assertUnderBoundRoot(
      this.knowledgeRootReal,
      options.manifestRelativePath ?? DEFAULT_MANIFEST,
    );
    this.blobPath = assertUnderBoundRoot(
      this.blobRootReal,
      options.blobRelativePath ?? DEFAULT_BLOB,
    );
    this.primaryRelativePath =
      options.primaryRelativePath ?? join(".nero-code-graph", "graph.json");
  }

  async read(): Promise<GraphDocument | null> {
    try {
      const raw = await readFile(this.blobPath, "utf8");
      return JSON.parse(raw) as GraphDocument;
    } catch {
      return null;
    }
  }

  async write(doc: GraphDocument): Promise<void> {
    await this.writeBlob(doc);
    await this.writeManifest(doc);
  }

  async readManifest(): Promise<CodeGraphManifest | null> {
    try {
      const raw = await readFile(this.manifestPath, "utf8");
      const m = JSON.parse(raw) as CodeGraphManifest;
      if (m.kind !== MANIFEST_KIND) {
        throw new PathSecurityError("invalid knowledge mirror manifest kind");
      }
      return m;
    } catch (e) {
      if (e instanceof PathSecurityError) throw e;
      return null;
    }
  }

  private async writeBlob(doc: GraphDocument): Promise<void> {
    await mkdir(dirname(this.blobPath), { recursive: true });
    const tmp = `${this.blobPath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(doc, null, 2), "utf8");
    await rename(tmp, this.blobPath);
  }

  private async writeManifest(doc: GraphDocument): Promise<void> {
    const manifest: CodeGraphManifest = {
      schemaVersion: 1,
      kind: MANIFEST_KIND,
      repoKey: doc.target.repoKey,
      rootLabel: doc.target.rootLabel,
      sourceFingerprint: doc.sourceFingerprint,
      builtAt: doc.builtAt,
      gitCommit: doc.gitCommit,
      extractorId: doc.extractorId,
      extractorVersion: doc.extractorVersion,
      primaryLocation: {
        mode: "project_artifact",
        relativePath: this.primaryRelativePath.replace(/\\/g, "/"),
      },
      stats: {
        nodeCount: doc.nodes.length,
        edgeCount: doc.edges.length,
      },
    };
    const text = JSON.stringify(manifest, null, 2);
    if (/"nodes"\s*:|"edges"\s*:|"links"\s*:/.test(text)) {
      throw new PathSecurityError("manifest must not contain graph payload");
    }
    await mkdir(dirname(this.manifestPath), { recursive: true });
    const tmp = `${this.manifestPath}.${process.pid}.tmp`;
    await writeFile(tmp, text, "utf8");
    await rename(tmp, this.manifestPath);
  }
}

/**
 * Dual-write: project_artifact + knowledge_mirror without sharing mutable state.
 * Read prefers project store; falls back to mirror blob.
 */
export class DualGraphStore implements GraphStore {
  constructor(
    private readonly project: GraphStore,
    private readonly mirror: KnowledgeMirrorStore,
  ) {}

  async read(): Promise<GraphDocument | null> {
    return (await this.project.read()) ?? (await this.mirror.read());
  }

  async write(doc: GraphDocument): Promise<void> {
    await this.project.write(doc);
    await this.mirror.write(doc);
  }
}
