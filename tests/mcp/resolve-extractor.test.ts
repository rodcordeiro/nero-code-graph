import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TypescriptAstExtractor } from "../../src/extractors/typescript-ast-extractor.js";
import {
  detectPrimaryLanguage,
  resolveExtractor,
  scoreBoundRootSignals,
} from "../../src/mcp/resolve-extractor.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pilotRoot = join(root, "fixtures/ts-pilot");
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

  it("PHP-looking root (composer + .php) fails closed", () => {
    const dir = tempRoot("ncg-php-sig-");
    write("composer.json", dir, "{}");
    write("src/Hello.php", dir, "<?php class Hello {}\n");
    expect(detectPrimaryLanguage(dir)).toBe("php");
    expect(() => resolveExtractor({ boundRoot: dir, env: {} })).toThrow(
      "extractor_unavailable:php",
    );
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

  it("env NCG_EXTRACTOR=php fails closed without falling through to TS", () => {
    const dir = tempRoot("ncg-force-php-");
    write("package.json", dir, "{}");
    write("src/app.ts", dir, "export const x = 1;\n");
    expect(() =>
      resolveExtractor({
        boundRoot: dir,
        env: { NCG_EXTRACTOR: "php" },
      }),
    ).toThrow("extractor_unavailable:php");
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
});
