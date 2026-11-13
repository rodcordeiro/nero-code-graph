import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CodeGraph, MemoryGraphStore } from "../../src/codegraph/index.js";
import { TypescriptAstExtractor } from "../../src/extractors/typescript-ast-extractor.js";
import { PhpAstExtractor } from "../../src/extractors/php-ast-extractor.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "ncg-resolution-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content);
  return root;
}

describe.each(["typescript", "php"] as const)("%s receiver resolution through CodeGraph", (language) => {
  async function graph(known: boolean, includeOther = true) {
    const root = language === "typescript"
      ? fixture({
          "A.ts": "export class A { Run() {} }",
          ...(includeOther ? { "B.ts": "export class B { Run() {} }" } : {}),
          "Caller.ts": `${includeOther ? "import { B } from './B.js';" : ""}
import { A } from './A.js';
export class Caller {
  constructor(private service: ${known ? "A" : "any"}) {}
  Handle() { this.service.Run(); }
}`,
        })
      : fixture({
          "A.php": "<?php class A { public function Run() {} }",
          ...(includeOther ? { "B.php": "<?php class B { public function Run() {} }" } : {}),
          "Caller.php": `<?php
${includeOther ? "require_once __DIR__ . '/B.php';" : ""}
require_once __DIR__ . '/A.php';
class Caller {
  private ${known ? "A " : ""}$service;
  public function Handle() { $this->service->Run(); }
}`,
        });
    const cg = new CodeGraph({
      extractor: language === "typescript"
        ? new TypescriptAstExtractor({ boundRoot: root })
        : new PhpAstExtractor({ boundRoot: root }),
      store: new MemoryGraphStore(),
    });
    await cg.rebuild({ repoKey: "resolution", rootLabel: "resolution" });
    const extension = language === "typescript" ? "ts" : "php";
    const result = await cg.getNeighbors({
      nodeId: `method:Caller.${extension}#Handle`,
      relationFilter: ["calls"],
      direction: "outgoing",
    });
    expect("hops" in result.payload).toBe(true);
    if (!("hops" in result.payload)) throw new Error("missing hops");
    return { cg, extension, hops: result.payload.hops };
  }

  it("resolves a typed injected property without a false caller to a homonym", async () => {
    const { cg, extension, hops } = await graph(true);
    expect(hops.map(({ to, provenance }) => ({ to, provenance }))).toEqual([
      { to: `method:A.${extension}#Run`, provenance: "EXTRACTED" },
    ]);
    const wrong = await cg.getNeighbors({
      nodeId: `method:B.${extension}#Run`, direction: "incoming", relationFilter: ["calls"],
    });
    expect(wrong.payload).toEqual({ hops: [] });
  });

  it("retains all unknown-receiver candidates as ambiguous", async () => {
    const { extension, hops } = await graph(false);
    expect(hops.map(({ to }) => to).sort()).toEqual([
      `method:A.${extension}#Run`, `method:B.${extension}#Run`,
    ]);
    expect(hops.every(({ provenance }) => provenance === "AMBIGUOUS")).toBe(true);
  });

  it("does not treat a unique name match as proof of receiver type", async () => {
    const { extension, hops } = await graph(false, false);
    expect(hops.map(({ to, provenance }) => ({ to, provenance }))).toEqual([
      { to: `method:A.${extension}#Run`, provenance: "AMBIGUOUS" },
    ]);
  });

  it("does not confirm callers whose declarations collapse to the same v1 ID", async () => {
    const root = language === "typescript"
      ? fixture({
          "A.ts": "export class A { Run() {} }",
          "Caller.ts": `import { A } from './A.js';
class First { constructor(private service: A) {} Handle() { this.service.Run(); } }
class Second { constructor(private service: A) {} Handle() { this.service.Run(); } }`,
        })
      : fixture({
          "A.php": "<?php class A { public function Run() {} }",
          "Caller.php": `<?php require_once __DIR__ . '/A.php';
class First { private A $service; public function Handle() { $this->service->Run(); } }
class Second { private A $service; public function Handle() { $this->service->Run(); } }`,
        });
    const cg = new CodeGraph({
      extractor: language === "typescript"
        ? new TypescriptAstExtractor({ boundRoot: root })
        : new PhpAstExtractor({ boundRoot: root }),
      store: new MemoryGraphStore(),
    });
    await cg.rebuild({ repoKey: "collision", rootLabel: "fixture" });
    const extension = language === "typescript" ? "ts" : "php";
    const result = await cg.getNeighbors({
      nodeId: `method:Caller.${extension}#Handle`, direction: "outgoing", relationFilter: ["calls"],
    });
    if (!("hops" in result.payload)) throw new Error("missing hops");
    expect(result.payload.hops.length).toBeGreaterThan(0);
    expect(result.payload.hops.every(hop => hop.provenance === "AMBIGUOUS")).toBe(true);
  });
});

it.each(["", "namespace Domain;"])("does not confirm a PHP qualified static receiver using an unrelated simple class name (%s)", async (namespace) => {
  const root = fixture({
    "Service.php": `<?php ${namespace} class Service { public static function Run() {} }`,
    "Caller.php": `<?php require_once __DIR__ . '/Service.php';
class Caller { public function Handle() { External\\Service::Run(); } }`,
  });
  const cg = new CodeGraph({ extractor: new PhpAstExtractor({ boundRoot: root }), store: new MemoryGraphStore() });
  await cg.rebuild({ repoKey: "qualified", rootLabel: "fixture" });
  const result = await cg.getNeighbors({ nodeId: "method:Caller.php#Handle", direction: "outgoing", relationFilter: ["calls"] });
  if (!("hops" in result.payload)) throw new Error("missing hops");
  expect(result.payload.hops).toEqual([
    expect.objectContaining({ to: "method:Service.php#Run", provenance: "AMBIGUOUS" }),
  ]);
});
