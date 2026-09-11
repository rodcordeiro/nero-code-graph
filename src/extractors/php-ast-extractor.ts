import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { makeNodeId } from "../contracts/node-id.js";
import {
  GRAPH_SCHEMA_VERSION,
  type GraphDocument,
  type GraphEdge,
  type GraphNode,
} from "../contracts/types.js";
import type { Extractor } from "../codegraph/ports.js";

const CODE_EXTS = new Set([".php"]);

export type PhpAstExtractorOptions = {
  /** Absolute bound root (already allowlisted by caller). */
  boundRoot: string;
};

function listPhpFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (
        name === "node_modules" ||
        name === "vendor" ||
        name === "dist" ||
        name === ".nero-code-graph"
      ) {
        continue;
      }
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (CODE_EXTS.has(extname(name).toLowerCase())) out.push(full);
    }
  };
  walk(root);
  return out;
}

function rel(root: string, abs: string): string {
  return relative(root, abs).replace(/\\/g, "/");
}

/** Content-ish fingerprint of PHP sources under root (path + mtime). */
export function fingerprintPhpSources(root: string): string {
  const files = listPhpFiles(resolve(root)).sort();
  return createHash("sha256")
    .update(files.map((f) => rel(resolve(root), f) + ":" + statSync(f).mtimeMs).join("|"))
    .digest("hex")
    .slice(0, 16);
}

function isPathInsideRoot(root: string, candidate: string): string | null {
  const abs = resolve(candidate);
  const relPath = relative(resolve(root), abs);
  if (relPath === "" || (!relPath.startsWith("..") && !isAbsolute(relPath))) {
    return abs;
  }
  return null;
}

function resolvePhpInclude(
  fromFile: string,
  spec: string,
  root: string,
): string | null {
  const cleaned = spec.replace(/\\/g, "/").trim();
  if (!cleaned || cleaned.includes("://")) return null;

  // `__DIR__ . '/../Foo.php'` captures `/../Foo.php` — leading `/` means
  // concatenate onto DIR, not filesystem root. Prefer relative resolve.
  const relativeSpec = cleaned.replace(/^\//, "");
  const candidates = [
    resolve(dirname(fromFile), relativeSpec),
    resolve(dirname(fromFile), cleaned),
  ];
  if (cleaned.startsWith("/") || /^[A-Za-z]:\//.test(cleaned)) {
    candidates.push(cleaned);
  }

  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) {
        const inside = isPathInsideRoot(root, c);
        if (inside) return inside;
      }
    } catch {
      /* continue */
    }
    // Try with .php if omitted
    if (!relativeSpec.toLowerCase().endsWith(".php")) {
      try {
        const withExt = `${c}.php`;
        if (statSync(withExt).isFile()) {
          const inside = isPathInsideRoot(root, withExt);
          if (inside) return inside;
        }
      } catch {
        /* continue */
      }
    }
  }
  return null;
}

/** Line number (1-based) for a character offset. */
function lineAt(text: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Strip string/heredoc-ish literals so regex structure scan does not
 * treat quoted class/method names as declarations. Does not store literals.
 */
function maskLiterals(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    // Line comment
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (ch === "#") {
      while (i < text.length && text[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    // Block comment
    if (ch === "/" && text[i + 1] === "*") {
      out += "  ";
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        out += text[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < text.length) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    // Single / double quoted strings
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += " ";
      i++;
      while (i < text.length) {
        if (text[i] === "\\") {
          out += "  ";
          i += 2;
          continue;
        }
        if (text[i] === quote) {
          out += " ";
          i++;
          break;
        }
        out += text[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

type IncludeHit = { abs: string; line: number };
type ClassHit = { name: string; line: number; bodyStart: number; bodyEnd: number };
type MethodHit = { name: string; line: number; className: string | null };

const INCLUDE_RE =
  /\b(?:include_once|require_once|include|require)\b\s*(?:\(?\s*)?(?:__DIR__\s*\.\s*)?['"]([^'"]+)['"]\s*\)?/gi;

const CLASS_RE = /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;

const FUNCTION_RE =
  /\b(?:(?:public|protected|private|static|final|abstract)\s+)*function\s+&?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

const CALL_RE = /(?:->|::)\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

function findMatchingBrace(text: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}

function extractClasses(masked: string): ClassHit[] {
  const hits: ClassHit[] = [];
  CLASS_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLASS_RE.exec(masked)) !== null) {
    const name = m[1];
    const after = masked.indexOf("{", m.index + m[0].length);
    if (after < 0) continue;
    const bodyEnd = findMatchingBrace(masked, after);
    hits.push({
      name,
      line: lineAt(masked, m.index),
      bodyStart: after,
      bodyEnd,
    });
  }
  return hits;
}

function extractMethods(masked: string, classes: ClassHit[]): MethodHit[] {
  const methods: MethodHit[] = [];
  FUNCTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FUNCTION_RE.exec(masked)) !== null) {
    const name = m[1];
    if (name === "__construct" || name === "__destruct") continue;
    const owning = classes.find(
      (c) => m!.index > c.bodyStart && m!.index < c.bodyEnd,
    );
    methods.push({
      name,
      line: lineAt(masked, m.index),
      className: owning?.name ?? null,
    });
  }
  return methods;
}

function extractIncludes(
  text: string,
  fromFile: string,
  root: string,
): IncludeHit[] {
  // Use original source so quoted paths remain intact (maskLiterals blanks strings).
  const hits: IncludeHit[] = [];
  INCLUDE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INCLUDE_RE.exec(text)) !== null) {
    const target = resolvePhpInclude(fromFile, m[1], root);
    if (target) {
      hits.push({ abs: target, line: lineAt(text, m.index) });
    }
  }
  return hits;
}

/**
 * Code-only PHP Extractor (no LLM). Include-scoped call edges only.
 * Lightweight structural scan (regex) — MVP, no external PHP parser.
 */
export class PhpAstExtractor implements Extractor {
  readonly id = "php-ast";
  readonly version = "0.1.0";

  constructor(private readonly options: PhpAstExtractorOptions) {}

  async fingerprint(): Promise<string> {
    return fingerprintPhpSources(this.options.boundRoot);
  }

  async extract(input: {
    repoKey: string;
    rootLabel: string;
  }): Promise<GraphDocument> {
    const root = resolve(this.options.boundRoot);
    const files = listPhpFiles(root);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const methodByFile = new Map<string, Set<string>>();
    const importsByFile = new Map<string, string[]>();
    const methodsInFile = new Map<
      string,
      Array<{ name: string; line: number; className: string | null }>
    >();
    const maskedByFile = new Map<string, string>();

    for (const abs of files) {
      const fileRel = rel(root, abs);
      const text = readFileSync(abs, "utf8");
      const masked = maskLiterals(text);
      maskedByFile.set(abs, masked);

      const fileId = makeNodeId({
        kind: "file",
        relativePath: fileRel,
        symbol: fileRel.split("/").pop()!,
      });
      nodes.push({
        id: fileId,
        kind: "file",
        name: fileRel.split("/").pop()!,
        location: { file: fileRel, line: 1 },
        language: "php",
      });

      const methods = new Set<string>();
      methodByFile.set(abs, methods);
      const importedAbs: string[] = [];
      importsByFile.set(abs, importedAbs);

      for (const inc of extractIncludes(text, abs, root)) {
        importedAbs.push(inc.abs);
        const targetRel = rel(root, inc.abs);
        edges.push({
          from: fileId,
          to: makeNodeId({
            kind: "file",
            relativePath: targetRel,
            symbol: targetRel.split("/").pop()!,
          }),
          kind: "imports",
          provenance: "EXTRACTED",
          evidence: { file: fileRel, line: inc.line },
        });
      }

      const classes = extractClasses(masked);
      const methodHits = extractMethods(masked, classes);
      methodsInFile.set(abs, methodHits);

      for (const cls of classes) {
        const classId = makeNodeId({
          kind: "class",
          relativePath: fileRel,
          symbol: cls.name,
        });
        nodes.push({
          id: classId,
          kind: "class",
          name: cls.name,
          location: { file: fileRel, line: cls.line },
          language: "php",
        });
        edges.push({
          from: fileId,
          to: classId,
          kind: "contains",
          provenance: "EXTRACTED",
          evidence: { file: fileRel, line: cls.line },
        });

        for (const meth of methodHits.filter((h) => h.className === cls.name)) {
          methods.add(meth.name);
          const methodId = makeNodeId({
            kind: "method",
            relativePath: fileRel,
            symbol: meth.name,
          });
          nodes.push({
            id: methodId,
            kind: "method",
            name: meth.name,
            location: { file: fileRel, line: meth.line },
            language: "php",
          });
          edges.push({
            from: classId,
            to: methodId,
            kind: "method",
            provenance: "EXTRACTED",
            evidence: { file: fileRel, line: meth.line },
          });
        }
      }

      // Top-level functions (no owning class)
      for (const meth of methodHits.filter((h) => h.className === null)) {
        methods.add(meth.name);
        const methodId = makeNodeId({
          kind: "method",
          relativePath: fileRel,
          symbol: meth.name,
        });
        nodes.push({
          id: methodId,
          kind: "method",
          name: meth.name,
          location: { file: fileRel, line: meth.line },
          language: "php",
        });
        edges.push({
          from: fileId,
          to: methodId,
          kind: "contains",
          provenance: "EXTRACTED",
          evidence: { file: fileRel, line: meth.line },
        });
      }
    }

    // Second pass: include-scoped calls (method → method)
    for (const abs of files) {
      const fileRel = rel(root, abs);
      const masked = maskedByFile.get(abs) ?? "";
      const imported = importsByFile.get(abs) ?? [];
      const localMethods = methodsInFile.get(abs) ?? [];

      for (const meth of localMethods) {
        // Approximate method body: from function keyword to matching brace close
        const funcIdx = masked.search(
          new RegExp(
            `\\bfunction\\s+&?\\s*${meth.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`,
          ),
        );
        if (funcIdx < 0) continue;
        const braceOpen = masked.indexOf("{", funcIdx);
        if (braceOpen < 0) continue;
        const braceClose = findMatchingBrace(masked, braceOpen);
        const body = masked.slice(braceOpen, braceClose + 1);

        CALL_RE.lastIndex = 0;
        let call: RegExpExecArray | null;
        while ((call = CALL_RE.exec(body)) !== null) {
          const called = call[1];
          for (const imp of imported) {
            const methods = methodByFile.get(imp);
            if (methods?.has(called)) {
              const calleeRel = rel(root, imp);
              const evidenceLine = lineAt(masked, braceOpen + call.index);
              edges.push({
                from: makeNodeId({
                  kind: "method",
                  relativePath: fileRel,
                  symbol: meth.name,
                }),
                to: makeNodeId({
                  kind: "method",
                  relativePath: calleeRel,
                  symbol: called,
                }),
                kind: "calls",
                provenance: "EXTRACTED",
                evidence: { file: fileRel, line: evidenceLine },
              });
              break;
            }
          }
        }
      }
    }

    return {
      schemaVersion: GRAPH_SCHEMA_VERSION,
      target: { repoKey: input.repoKey, rootLabel: input.rootLabel },
      builtAt: new Date().toISOString(),
      sourceFingerprint: fingerprintPhpSources(root),
      extractorId: this.id,
      extractorVersion: this.version,
      nodes,
      edges,
      stats: { nodeCount: nodes.length, edgeCount: edges.length },
    };
  }
}
