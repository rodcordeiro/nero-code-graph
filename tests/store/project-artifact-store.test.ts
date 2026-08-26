import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  CodeGraph,
  FixtureExtractor,
} from "../../src/codegraph/index.js";
import {
  PathSecurityError,
  ProjectArtifactStore,
  assertBoundRootAllowed,
} from "../../src/store/project-artifact-store.js";
import type { GraphDocument } from "../../src/contracts/types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const goldenPath = join(root, "fixtures/minimal/graph.golden.json");

const temps: string[] = [];

afterEach(async () => {
  for (const t of temps.splice(0)) {
    await rm(t, { recursive: true, force: true });
  }
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ncg-"));
  temps.push(dir);
  return dir;
}

describe("ProjectArtifactStore", () => {
  it("writes and reads GraphDocument under .nero-code-graph/", async () => {
    const bound = await tempRoot();
    const store = new ProjectArtifactStore({
      boundRoot: bound,
      allowedRoots: [bound],
    });
    const cg = new CodeGraph({
      extractor: new FixtureExtractor(goldenPath),
      store,
    });
    await cg.rebuild({ repoKey: "t", rootLabel: "t" });
    const again = await store.read();
    expect(again?.nodes.length).toBeGreaterThan(0);
    const raw = await readFile(store.artifactPath, "utf8");
    const parsed = JSON.parse(raw) as GraphDocument;
    expect(parsed.schemaVersion).toBe(1);
    expect(store.artifactPath.replace(/\\/g, "/")).toContain(
      ".nero-code-graph/graph.json",
    );
  });

  it("rejects bound root outside allowlist without reading files", async () => {
    const allowed = await tempRoot();
    const other = await tempRoot();
    expect(() =>
      assertBoundRootAllowed(other, [allowed]),
    ).toThrow(PathSecurityError);
  });

  it("rejects artifact paths with ..", async () => {
    const bound = await tempRoot();
    expect(
      () =>
        new ProjectArtifactStore({
          boundRoot: bound,
          allowedRoots: [bound],
          artifactDir: "../escape",
        }),
    ).toThrow(PathSecurityError);
  });

  it("uses relative paths only inside persisted nodes", async () => {
    const bound = await tempRoot();
    await mkdir(join(bound, "src"), { recursive: true });
    await writeFile(join(bound, "src", "a.ts"), "//", "utf8");
    const store = new ProjectArtifactStore({
      boundRoot: bound,
      allowedRoots: [bound],
    });
    const cg = new CodeGraph({
      extractor: new FixtureExtractor(goldenPath),
      store,
    });
    const doc = await cg.rebuild({ repoKey: "t", rootLabel: "t" });
    for (const node of doc.nodes) {
      expect(node.location.file.includes("\\")).toBe(false);
      expect(node.location.file.startsWith("/")).toBe(false);
      expect(/^[A-Za-z]:/.test(node.location.file)).toBe(false);
    }
  });
});
