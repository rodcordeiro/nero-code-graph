import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type { GraphDocument } from "../contracts/types.js";
import type { GraphStore } from "../codegraph/ports.js";

export const DEFAULT_ARTIFACT_DIR = ".nero-code-graph";
export const DEFAULT_GRAPH_FILE = "graph.json";

export class PathSecurityError extends Error {
  readonly category = "Security";
  constructor(message: string) {
    super(message);
    this.name = "PathSecurityError";
  }
}

function realOrResolve(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** True if `candidate` is the root or a path under it (case-insensitive on win). */
export function isPathInsideRoot(rootReal: string, candidateReal: string): boolean {
  const root = rootReal.endsWith(sep) ? rootReal.slice(0, -1) : rootReal;
  const cand = candidateReal.endsWith(sep)
    ? candidateReal.slice(0, -1)
    : candidateReal;
  if (cand.toLowerCase() === root.toLowerCase()) return true;
  const prefix = root + sep;
  return cand.toLowerCase().startsWith(prefix.toLowerCase());
}

export function assertBoundRootAllowed(
  boundRoot: string,
  allowedRoots: string[],
): string {
  if (!existsSync(resolve(boundRoot))) {
    throw new PathSecurityError(`bound root does not exist: ${boundRoot}`);
  }
  const rootReal = realpathSync(resolve(boundRoot));
  const allowed = allowedRoots.some((a) => {
    try {
      const ar = realpathSync(resolve(a));
      return isPathInsideRoot(ar, rootReal);
    } catch {
      return false;
    }
  });
  if (!allowed) {
    throw new PathSecurityError(`bound root not in allowlist: ${boundRoot}`);
  }
  return rootReal;
}

export function assertUnderBoundRoot(
  boundRootReal: string,
  relativeOrAbsolute: string,
): string {
  if (relativeOrAbsolute.includes("..")) {
    throw new PathSecurityError(
      `path outside allowlisted bound root: ${relativeOrAbsolute}`,
    );
  }
  const candidate = resolve(boundRootReal, relativeOrAbsolute);
  // Resolve existing prefix for junction/symlink escape (Q11)
  let check = candidate;
  let probe = candidate;
  while (!existsSync(probe) && probe !== dirname(probe)) {
    probe = dirname(probe);
  }
  if (existsSync(probe)) {
    const probeReal = realpathSync(probe);
    const rest = candidate.slice(probe.length);
    check = resolve(probeReal + rest);
  }
  if (!isPathInsideRoot(boundRootReal, check)) {
    throw new PathSecurityError(
      `path outside allowlisted bound root: ${relativeOrAbsolute}`,
    );
  }
  return candidate;
}

export type ProjectArtifactStoreOptions = {
  boundRoot: string;
  allowedRoots: string[];
  artifactDir?: string;
  fileName?: string;
};

export class ProjectArtifactStore implements GraphStore {
  readonly artifactPath: string;
  readonly boundRootReal: string;

  constructor(options: ProjectArtifactStoreOptions) {
    this.boundRootReal = assertBoundRootAllowed(
      options.boundRoot,
      options.allowedRoots,
    );
    const dir = options.artifactDir ?? DEFAULT_ARTIFACT_DIR;
    const file = options.fileName ?? DEFAULT_GRAPH_FILE;
    this.artifactPath = assertUnderBoundRoot(
      this.boundRootReal,
      join(dir, file),
    );
  }

  async read(): Promise<GraphDocument | null> {
    try {
      const raw = await readFile(this.artifactPath, "utf8");
      return JSON.parse(raw) as GraphDocument;
    } catch {
      return null;
    }
  }

  async write(doc: GraphDocument): Promise<void> {
    await mkdir(dirname(this.artifactPath), { recursive: true });
    const tmp = `${this.artifactPath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(doc, null, 2), "utf8");
    await rename(tmp, this.artifactPath);
  }
}
