import { readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DotnetAstExtractor,
  FixtureExtractor,
  PhpAstExtractor,
  TypescriptAstExtractor,
  type Extractor,
} from "../codegraph/index.js";

/** Languages the host can select (fixture is env-only). */
export type LanguageId = "typescript" | "php" | "dotnet" | "fixture";

export type DetectedLanguage = "typescript" | "php" | "dotnet";

export type ResolveExtractorOptions = {
  boundRoot: string;
  /** Env map for overrides; defaults to `process.env` (injectable in tests). */
  env?: NodeJS.ProcessEnv;
  /** Golden path for FixtureExtractor when fixture is selected. */
  fixtureGoldenPath?: string;
};

export type ResolveExtractorResult = {
  extractor: Extractor;
  language: LanguageId;
  reason: string;
};

const SKIP_DIRS = new Set([
  "node_modules",
  "vendor",
  "bin",
  "obj",
  "dist",
  ".nero-code-graph",
  ".git",
]);

const TS_EXTS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const PHP_EXT = ".php";
const CS_EXT = ".cs";

/** Manifest signals weigh more than a single source file. */
const MANIFEST_WEIGHT = 100;

const DEFAULT_FIXTURE_GOLDEN = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/minimal/graph.golden.json",
);

function isTsConfigName(name: string): boolean {
  return name === "tsconfig.json" || /^tsconfig\..+\.json$/i.test(name);
}

function isCsprojName(name: string): boolean {
  return /\.csproj$/i.test(name);
}

function isSlnName(name: string): boolean {
  return /\.sln$/i.test(name);
}

export type LanguageScores = {
  typescript: number;
  php: number;
  dotnet: number;
};

/**
 * Score bound-root signals for primary language.
 *
 * Score = (manifest hits × MANIFEST_WEIGHT) + extension file count.
 * Highest score wins. Tie-break (including all zero): prefer
 * typescript > php > dotnet so empty/unknown roots keep the historical
 * default, PHP wins over a new equal .NET score, and mixed equal signals
 * do not silently pick the newest language.
 */
export function scoreBoundRootSignals(boundRoot: string): LanguageScores {
  const scores: LanguageScores = { typescript: 0, php: 0, dotnet: 0 };

  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (name === "package.json" || isTsConfigName(name)) {
        scores.typescript += MANIFEST_WEIGHT;
      } else if (name === "composer.json") {
        scores.php += MANIFEST_WEIGHT;
      } else if (
        isCsprojName(name) ||
        isSlnName(name) ||
        name === "global.json"
      ) {
        scores.dotnet += MANIFEST_WEIGHT;
      }
      const ext = extname(name).toLowerCase();
      if (TS_EXTS.has(ext)) scores.typescript += 1;
      else if (ext === PHP_EXT) scores.php += 1;
      else if (ext === CS_EXT) scores.dotnet += 1;
    }
  };

  walk(boundRoot);
  return scores;
}

/**
 * Pick primary language from bound-root signals (no env). Empty/unknown → typescript.
 * On equal scores: typescript > php > dotnet (see scoreBoundRootSignals).
 */
export function detectPrimaryLanguage(boundRoot: string): DetectedLanguage {
  const scores = scoreBoundRootSignals(boundRoot);
  const max = Math.max(scores.typescript, scores.php, scores.dotnet);
  if (max === 0) return "typescript";
  if (scores.typescript === max) return "typescript";
  if (scores.php === max) return "php";
  return "dotnet";
}

function normalizeExtractorEnv(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  return v.length > 0 ? v : undefined;
}

/**
 * Resolve Extractor with env override precedence (highest first):
 * 1. NCG_USE_FIXTURE_EXTRACTOR=true OR NCG_EXTRACTOR=fixture → FixtureExtractor
 * 2. NCG_EXTRACTOR=typescript | php | dotnet → force that language (ignore signals)
 * 3. Else detect from bound-root signals
 * 4. Fallback if no signals: typescript
 *
 * Unknown NCG_EXTRACTOR values fail closed (`extractor_unknown:<value>`).
 */
export function resolveExtractor(
  options: ResolveExtractorOptions,
): ResolveExtractorResult {
  const env = options.env ?? process.env;
  const boundRoot = options.boundRoot;
  const golden =
    options.fixtureGoldenPath ??
    env.NCG_FIXTURE_GOLDEN ??
    DEFAULT_FIXTURE_GOLDEN;

  const useFixtureFlag = env.NCG_USE_FIXTURE_EXTRACTOR === "true";
  const extractorEnv = normalizeExtractorEnv(env.NCG_EXTRACTOR);

  if (useFixtureFlag || extractorEnv === "fixture") {
    return {
      extractor: new FixtureExtractor(golden),
      language: "fixture",
      reason: useFixtureFlag
        ? "env:NCG_USE_FIXTURE_EXTRACTOR"
        : "env:NCG_EXTRACTOR=fixture",
    };
  }

  let language: DetectedLanguage;
  let reason: string;

  if (
    extractorEnv === "typescript" ||
    extractorEnv === "php" ||
    extractorEnv === "dotnet"
  ) {
    language = extractorEnv;
    reason = `env:NCG_EXTRACTOR=${extractorEnv}`;
  } else if (extractorEnv !== undefined) {
    throw new Error(`extractor_unknown:${extractorEnv}`);
  } else {
    const scores = scoreBoundRootSignals(boundRoot);
    language = detectPrimaryLanguage(boundRoot);
    if (
      scores.typescript === 0 &&
      scores.php === 0 &&
      scores.dotnet === 0
    ) {
      reason = "fallback:typescript";
    } else {
      reason = `signals:${language}(ts=${scores.typescript},php=${scores.php},dotnet=${scores.dotnet})`;
    }
  }

  return mapLanguageToExtractor(language, boundRoot, reason);
}

function mapLanguageToExtractor(
  language: DetectedLanguage,
  boundRoot: string,
  reason: string,
): ResolveExtractorResult {
  if (language === "php") {
    return {
      extractor: new PhpAstExtractor({ boundRoot }),
      language: "php",
      reason,
    };
  }
  if (language === "dotnet") {
    return {
      extractor: new DotnetAstExtractor({ boundRoot }),
      language: "dotnet",
      reason,
    };
  }
  return {
    extractor: new TypescriptAstExtractor({ boundRoot }),
    language: "typescript",
    reason,
  };
}
