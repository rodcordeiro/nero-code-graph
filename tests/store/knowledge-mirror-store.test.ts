import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CodeGraph,
  FixtureExtractor,
} from "../../src/codegraph/index.js";
import {
  DualGraphStore,
  KnowledgeMirrorStore,
  PathSecurityError,
  ProjectArtifactStore,
} from "../../src/store/index.js";

const goldenPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/minimal/graph.golden.json",
);

describe("KnowledgeMirrorStore (Q13)", () => {
  it("writes Manifest in KR and opaque blob outside KR", async () => {
    const base = mkdtempSync(join(tmpdir(), "ncg-km-"));
    const knowledgeRoot = join(base, "knowledge-repo");
    const blobRoot = join(base, "opaque-blobs");
    mkdirSync(knowledgeRoot);
    mkdirSync(blobRoot);

    const mirror = new KnowledgeMirrorStore({
      knowledgeRoot,
      blobRoot,
      allowedRoots: [base],
      manifestRelativePath: "projects/demo/code-graph.manifest.json",
      blobRelativePath: "demo/graph.json",
    });

    const cg = new CodeGraph({
      extractor: new FixtureExtractor(goldenPath),
      store: mirror,
      backend: "knowledge_mirror",
      currentGitCommit: "abc",
    });
    await cg.rebuild({ repoKey: "demo", rootLabel: "fixtures/minimal" });

    const manifest = await mirror.readManifest();
    expect(manifest?.kind).toBe("code-graph-manifest");
    expect(manifest?.sourceFingerprint).toBeTruthy();
    expect(manifest?.primaryLocation.relativePath).toContain(".nero-code-graph");
    expect(JSON.stringify(manifest)).not.toMatch(/"nodes"\s*:/);
    expect(JSON.stringify(manifest)).not.toMatch(/"edges"\s*:/);
    expect(JSON.stringify(manifest)).not.toMatch(/"links"\s*:/);

    const blob = JSON.parse(readFileSync(mirror.blobPath, "utf8"));
    expect(blob.nodes.length).toBeGreaterThan(0);
    expect(mirror.blobPath.toLowerCase().includes("knowledge-repo")).toBe(false);

    const neighbors = await cg.getNeighbors({
      nodeId: "method:src/orders/OrderService.ts#PlaceOrder",
      direction: "incoming",
      relationFilter: ["calls"],
    });
    expect(neighbors.envelope.backend).toBe("knowledge_mirror");
    expect("hops" in neighbors.payload).toBe(true);
  });

  it("rejects blob root inside Knowledge Repo", () => {
    const base = mkdtempSync(join(tmpdir(), "ncg-km-bad-"));
    const knowledgeRoot = join(base, "kr");
    mkdirSync(join(knowledgeRoot, "nested"), { recursive: true });
    expect(
      () =>
        new KnowledgeMirrorStore({
          knowledgeRoot,
          blobRoot: join(knowledgeRoot, "nested"),
          allowedRoots: [base],
        }),
    ).toThrow(PathSecurityError);
  });

  it("dual write keeps project and mirror isolated; EXTRACTED parity", async () => {
    const base = mkdtempSync(join(tmpdir(), "ncg-dual-"));
    const projectRoot = join(base, "checkout");
    const knowledgeRoot = join(base, "kr");
    const blobRoot = join(base, "opaque");
    mkdirSync(projectRoot);
    mkdirSync(knowledgeRoot);
    mkdirSync(blobRoot);

    const project = new ProjectArtifactStore({
      boundRoot: projectRoot,
      allowedRoots: [base],
    });
    const mirror = new KnowledgeMirrorStore({
      knowledgeRoot,
      blobRoot,
      allowedRoots: [base],
      manifestRelativePath: "code-graph.manifest.json",
    });
    const dual = new DualGraphStore(project, mirror);

    const cg = new CodeGraph({
      extractor: new FixtureExtractor(goldenPath),
      store: dual,
      currentGitCommit: "parity1",
    });
    await cg.rebuild({ repoKey: "demo", rootLabel: "fixtures/minimal" });

    const fromProject = await project.read();
    const fromMirror = await mirror.read();
    expect(fromProject?.sourceFingerprint).toBe(fromMirror?.sourceFingerprint);
    expect(fromProject?.gitCommit).toBe("parity1");
    expect(fromMirror?.gitCommit).toBe("parity1");

    const projectCalls = fromProject!.edges.filter(
      (e) => e.kind === "calls" && e.provenance === "EXTRACTED",
    );
    const mirrorCalls = fromMirror!.edges.filter(
      (e) => e.kind === "calls" && e.provenance === "EXTRACTED",
    );
    expect(mirrorCalls).toEqual(projectCalls);

    // Corrupt project only — dual falls back to mirror blob (isolation).
    writeFileSync(project.artifactPath, "{");
    const viaDual = await dual.read();
    expect(viaDual?.nodes.length).toBe(fromMirror!.nodes.length);
    expect((await mirror.readManifest())?.sourceFingerprint).toBe(
      fromMirror!.sourceFingerprint,
    );
  });
});
