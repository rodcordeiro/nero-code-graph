import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DotnetAstExtractor } from "../../src/extractors/dotnet-ast-extractor.js";
import { PhpAstExtractor } from "../../src/extractors/php-ast-extractor.js";
import { TypescriptAstExtractor } from "../../src/extractors/typescript-ast-extractor.js";
import {
  detectPrimaryLanguage,
  resolveExtractor,
  scoreBoundRootSignals,
} from "../../src/mcp/resolve-extractor.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pilotRoot = join(root, "fixtures/ts-pilot");
const phpPilotRoot = join(root, "fixtures/php-pilot");
const dotnetPilotRoot = join(root, "fixtures/dotnet-pilot");
const goldenPath = join(root, "fixtures/minimal/graph.golden.json");

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function write(rel: string, base: string, body = ""): void {
  const dest = join(base, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, body);
}

describe("resolveExtractor / bound-root signals", () => {
  it("TS pilot (.ts sources) resolves TypescriptAstExtractor", () => {
    const resolved = resolveExtractor({
      boundRoot: pilotRoot,
      env: {},
    });
    expect(resolved.language).toBe("typescript");
    expect(resolved.extractor.id).toBe("typescript-ast");
    expect(resolved.extractor).toBeInstanceOf(TypescriptAstExtractor);
    expect(detectPrimaryLanguage(pilotRoot)).toBe("typescript");
  });

  it("package.json + .ts temp root resolves typescript-ast", () => {
    const dir = tempRoot("ncg-ts-sig-");
    write("package.json", dir, "{}");
    write("src/app.ts", dir, "export const x = 1;\n");
    const resolved = resolveExtractor({ boundRoot: dir, env: {} });
    expect(resolved.extractor.id).toBe("typescript-ast");
    expect(scoreBoundRootSignals(dir).typescript).toBeGreaterThan(
      scoreBoundRootSignals(dir).php,
    );
  });

  it("PHP-looking root (composer + .php) resolves PhpAstExtractor", () => {
    const dir = tempRoot("ncg-php-sig-");
    write("composer.json", dir, "{}");
    write("src/Hello.php", dir, "<?php class Hello {}\n");
    expect(detectPrimaryLanguage(dir)).toBe("php");
    const resolved = resolveExtractor({ boundRoot: dir, env: {} });
    expect(resolved.language).toBe("php");
    expect(resolved.extractor.id).toBe("php-ast");
    expect(resolved.extractor).toBeInstanceOf(PhpAstExtractor);
  });

  it("php-pilot fixture resolves PhpAstExtractor via signals", () => {
    const resolved = resolveExtractor({
      boundRoot: phpPilotRoot,
      env: {},
    });
    expect(resolved.language).toBe("php");
    expect(resolved.extractor.id).toBe("php-ast");
    expect(resolved.extractor).toBeInstanceOf(PhpAstExtractor);
    expect(detectPrimaryLanguage(phpPilotRoot)).toBe("php");
  });

  it("env fixture override wins even with TS signals", () => {
    const dir = tempRoot("ncg-fix-env-");
    write("package.json", dir, "{}");
    write("src/app.ts", dir, "export const x = 1;\n");
    const viaFlag = resolveExtractor({
      boundRoot: dir,
      env: { NCG_USE_FIXTURE_EXTRACTOR: "true" },
      fixtureGoldenPath: goldenPath,
    });
    expect(viaFlag.language).toBe("fixture");
    expect(viaFlag.extractor.id).toBe("fake");
    expect(viaFlag.reason).toContain("NCG_USE_FIXTURE_EXTRACTOR");

    const viaExtractor = resolveExtractor({
      boundRoot: dir,
      env: { NCG_EXTRACTOR: "fixture" },
      fixtureGoldenPath: goldenPath,
    });
    expect(viaExtractor.language).toBe("fixture");
    expect(viaExtractor.extractor.id).toBe("fake");
  });

  it("env NCG_EXTRACTOR=typescript forces TS even with PHP signals", () => {
    const dir = tempRoot("ncg-force-ts-");
    write("composer.json", dir, "{}");
    write("src/Hello.php", dir, "<?php class Hello {}\n");
    const resolved = resolveExtractor({
      boundRoot: dir,
      env: { NCG_EXTRACTOR: "typescript" },
    });
    expect(resolved.language).toBe("typescript");
    expect(resolved.extractor.id).toBe("typescript-ast");
    expect(resolved.reason).toBe("env:NCG_EXTRACTOR=typescript");
  });

  it("env NCG_EXTRACTOR=php selects PhpAstExtractor without falling through to TS", () => {
    const dir = tempRoot("ncg-force-php-");
    write("package.json", dir, "{}");
    write("src/app.ts", dir, "export const x = 1;\n");
    const resolved = resolveExtractor({
      boundRoot: dir,
      env: { NCG_EXTRACTOR: "php" },
    });
    expect(resolved.language).toBe("php");
    expect(resolved.extractor.id).toBe("php-ast");
    expect(resolved.extractor).toBeInstanceOf(PhpAstExtractor);
    expect(resolved.reason).toBe("env:NCG_EXTRACTOR=php");
  });

  it("empty root falls back to typescript", () => {
    const dir = tempRoot("ncg-empty-");
    const resolved = resolveExtractor({ boundRoot: dir, env: {} });
    expect(resolved.language).toBe("typescript");
    expect(resolved.reason).toBe("fallback:typescript");
    expect(resolved.extractor.id).toBe("typescript-ast");
  });

  it("TS non-regression: TypescriptAstExtractor on ts-pilot yields nodes/edges", async () => {
    const resolved = resolveExtractor({ boundRoot: pilotRoot, env: {} });
    const doc = await resolved.extractor.extract({
      repoKey: "ts-pilot",
      rootLabel: "fixtures/ts-pilot",
    });
    expect(doc.nodes.length).toBeGreaterThan(0);
    expect(doc.edges.length).toBeGreaterThan(0);
    expect(doc.extractorId).toBe("typescript-ast");
    expect(doc.extractorVersion).toBeTruthy();
  });

  it("PHP non-regression: PhpAstExtractor on php-pilot yields nodes/edges + envelope fields", async () => {
    const resolved = resolveExtractor({ boundRoot: phpPilotRoot, env: {} });
    const doc = await resolved.extractor.extract({
      repoKey: "php-pilot",
      rootLabel: "fixtures/php-pilot",
    });
    expect(doc.nodes.length).toBeGreaterThan(0);
    expect(doc.edges.length).toBeGreaterThan(0);
    expect(doc.extractorId).toBe("php-ast");
    expect(doc.extractorVersion).toBe("0.1.0");
  });

  it(".NET-looking root (csproj + .cs) resolves DotnetAstExtractor", () => {
    const dir = tempRoot("ncg-dotnet-sig-");
    write("App.csproj", dir, "<Project Sdk=\"Microsoft.NET.Sdk\" />\n");
    write("src/Hello.cs", dir, "namespace App; public class Hello {}\n");
    expect(detectPrimaryLanguage(dir)).toBe("dotnet");
    const resolved = resolveExtractor({ boundRoot: dir, env: {} });
    expect(resolved.language).toBe("dotnet");
    expect(resolved.extractor.id).toBe("dotnet-ast");
    expect(resolved.extractor).toBeInstanceOf(DotnetAstExtractor);
  });

  it("dotnet-pilot fixture resolves DotnetAstExtractor via signals", () => {
    const resolved = resolveExtractor({
      boundRoot: dotnetPilotRoot,
      env: {},
    });
    expect(resolved.language).toBe("dotnet");
    expect(resolved.extractor.id).toBe("dotnet-ast");
    expect(resolved.extractor).toBeInstanceOf(DotnetAstExtractor);
    expect(detectPrimaryLanguage(dotnetPilotRoot)).toBe("dotnet");
  });

  it("global.json and .sln count as .NET manifests", () => {
    const dir = tempRoot("ncg-dotnet-manifest-");
    write("global.json", dir, '{ "sdk": { "version": "8.0.100" } }\n');
    write("App.sln", dir, "\n");
    write("src/A.cs", dir, "namespace A; public class A {}\n");
    const scores = scoreBoundRootSignals(dir);
    expect(scores.dotnet).toBeGreaterThan(scores.typescript);
    expect(scores.dotnet).toBeGreaterThan(scores.php);
    expect(detectPrimaryLanguage(dir)).toBe("dotnet");
  });

  it("env NCG_EXTRACTOR=dotnet forces DotnetAstExtractor even with TS signals", () => {
    const dir = tempRoot("ncg-force-dotnet-");
    write("package.json", dir, "{}");
    write("src/app.ts", dir, "export const x = 1;\n");
    const resolved = resolveExtractor({
      boundRoot: dir,
      env: { NCG_EXTRACTOR: "dotnet" },
    });
    expect(resolved.language).toBe("dotnet");
    expect(resolved.extractor.id).toBe("dotnet-ast");
    expect(resolved.extractor).toBeInstanceOf(DotnetAstExtractor);
    expect(resolved.reason).toBe("env:NCG_EXTRACTOR=dotnet");
  });

  it("tie between php and dotnet prefers php (deterministic; typescript preferred when also tied)", () => {
    const dir = tempRoot("ncg-php-dotnet-tie-");
    write("composer.json", dir, "{}");
    write("App.csproj", dir, "<Project Sdk=\"Microsoft.NET.Sdk\" />\n");
    const scores = scoreBoundRootSignals(dir);
    expect(scores.php).toBe(scores.dotnet);
    expect(detectPrimaryLanguage(dir)).toBe("php");
  });

  it(".NET non-regression: DotnetAstExtractor on dotnet-pilot yields nodes/edges + envelope fields", async () => {
    const resolved = resolveExtractor({ boundRoot: dotnetPilotRoot, env: {} });
    const doc = await resolved.extractor.extract({
      repoKey: "dotnet-pilot",
      rootLabel: "fixtures/dotnet-pilot",
    });
    expect(doc.nodes.length).toBeGreaterThan(0);
    expect(doc.edges.length).toBeGreaterThan(0);
    expect(doc.extractorId).toBe("dotnet-ast");
    expect(doc.extractorVersion).toBe("0.1.0");
  });
});
