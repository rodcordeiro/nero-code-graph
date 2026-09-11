import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { makeNodeId } from "../contracts/node-id.js";
import {
  GRAPH_SCHEMA_VERSION,
  type GraphDocument,
  type GraphEdge,
  type GraphNode,
} from "../contracts/types.js";
import type { Extractor } from "../codegraph/ports.js";

const CODE_EXTS = new Set([".cs"]);

export type DotnetAstExtractorOptions = {
  /** Absolute bound root (already allowlisted by caller). */
  boundRoot: string;
};

function listCsFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (
        name === "node_modules" ||
        name === "bin" ||
        name === "obj" ||
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

/** Content-ish fingerprint of C# sources under root (path + mtime). */
export function fingerprintDotnetSources(root: string): string {
  const files = listCsFiles(resolve(root)).sort();
  return createHash("sha256")
    .update(files.map((f) => rel(resolve(root), f) + ":" + statSync(f).mtimeMs).join("|"))
    .digest("hex")
    .slice(0, 16);
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
 * Strip string/verbatim literals and comments so regex structure scan does not
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
    // Verbatim string @"..."
    if (ch === "@" && text[i + 1] === '"') {
      out += "  ";
      i += 2;
      while (i < text.length) {
        if (text[i] === '"' && text[i + 1] === '"') {
          out += "  ";
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          out += " ";
          i++;
          break;
        }
        out += text[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    // Single / double quoted strings (chars + regular)
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

type ClassHit = { name: string; line: number; bodyStart: number; bodyEnd: number };
type MethodHit = { name: string; line: number; className: string | null };

const NAMESPACE_RE =
  /\bnamespace\s+([A-Za-z_][A-Za-z0-9_.]*)\s*[;{]/g;

const USING_RE =
  /\busing\s+(?:static\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\s*=\s*)?([A-Za-z_][A-Za-z0-9_.]*)\s*;/g;

const CLASS_RE = /\b(?:class|struct|record|interface)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;

// Method-ish: optional modifiers + return type + name(
// Modifiers are optional so idiomatic implicit-private methods (`void Helper()`) are kept.
const METHOD_RE =
  /\b(?:(?:public|protected|private|internal|static|virtual|override|sealed|abstract|async|partial|new|extern|unsafe)\s+)*[A-Za-z_][A-Za-z0-9_<>,\[\]\s?.]*?\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

const CALL_RE = /\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

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

function extractNamespace(masked: string): string | null {
  NAMESPACE_RE.lastIndex = 0;
  const m = NAMESPACE_RE.exec(masked);
  return m ? m[1] : null;
}

function extractUsings(masked: string): string[] {
  const hits: string[] = [];
  USING_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = USING_RE.exec(masked)) !== null) {
    hits.push(m[1]);
  }
  return hits;
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
  METHOD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = METHOD_RE.exec(masked)) !== null) {
    const name = m[1];
    // Skip common non-method false positives / constructors later filtered by class name match
    if (name === "if" || name === "while" || name === "for" || name === "switch") {
      continue;
    }
    const owning = classes.find(
      (c) => m!.index > c.bodyStart && m!.index < c.bodyEnd,
    );
    // Skip constructors (method name equals owning class)
    if (owning && name === owning.name) continue;
    methods.push({
      name,
      line: lineAt(masked, m.index),
      className: owning?.name ?? null,
    });
  }
  return methods;
}

/**
 * Code-only .NET/C# Extractor (no LLM). Using/namespace-scoped call edges only.
 * Lightweight structural scan (regex) — MVP, no Roslyn dependency.
 */
export class DotnetAstExtractor implements Extractor {
  readonly id = "dotnet-ast";
  readonly version = "0.1.0";

  constructor(private readonly options: DotnetAstExtractorOptions) {}

  async fingerprint(): Promise<string> {
    return fingerprintDotnetSources(this.options.boundRoot);
  }

  async extract(input: {
    repoKey: string;
    rootLabel: string;
  }): Promise<GraphDocument> {
    const root = resolve(this.options.boundRoot);
    const files = listCsFiles(root);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const methodByFile = new Map<string, Set<string>>();
    const importsByFile = new Map<string, string[]>();
    const methodsInFile = new Map<
      string,
      Array<{ name: string; line: number; className: string | null }>
    >();
    const maskedByFile = new Map<string, string>();
    const namespaceByFile = new Map<string, string | null>();
    const usingsByFile = new Map<string, string[]>();

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
        language: "csharp",
      });

      const ns = extractNamespace(masked);
      namespaceByFile.set(abs, ns);
      const usings = extractUsings(masked);
      usingsByFile.set(abs, usings);

      const methods = new Set<string>();
      methodByFile.set(abs, methods);
      importsByFile.set(abs, []);

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
          language: "csharp",
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
            language: "csharp",
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

      // Top-level methods (unlikely in C#; keep parity with PHP)
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
          language: "csharp",
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

    // Resolve usings → imported files (namespace match) + import edges
    for (const abs of files) {
      const fileRel = rel(root, abs);
      const fileId = makeNodeId({
        kind: "file",
        relativePath: fileRel,
        symbol: fileRel.split("/").pop()!,
      });
      const usings = usingsByFile.get(abs) ?? [];
      const ownNs = namespaceByFile.get(abs);
      const importedAbs: string[] = [];
      importsByFile.set(abs, importedAbs);

      const usingLines = new Map<string, number>();
      const masked = maskedByFile.get(abs) ?? "";
      USING_RE.lastIndex = 0;
      let um: RegExpExecArray | null;
      while ((um = USING_RE.exec(masked)) !== null) {
        usingLines.set(um[1], lineAt(masked, um.index));
      }

      for (const other of files) {
        if (other === abs) continue;
        const otherNs = namespaceByFile.get(other);
        if (!otherNs) continue;
        const matchUsing = usings.includes(otherNs);
        const sameNs = ownNs !== null && ownNs === otherNs;
        if (!matchUsing && !sameNs) continue;

        importedAbs.push(other);
        const targetRel = rel(root, other);
        const evidenceLine = matchUsing
          ? (usingLines.get(otherNs) ?? 1)
          : 1;
        edges.push({
          from: fileId,
          to: makeNodeId({
            kind: "file",
            relativePath: targetRel,
            symbol: targetRel.split("/").pop()!,
          }),
          kind: "imports",
          provenance: "EXTRACTED",
          evidence: { file: fileRel, line: evidenceLine },
        });
      }
    }

    // Second pass: using-scoped calls (method → method)
    for (const abs of files) {
      const fileRel = rel(root, abs);
      const masked = maskedByFile.get(abs) ?? "";
      const imported = importsByFile.get(abs) ?? [];
      const localMethods = methodsInFile.get(abs) ?? [];

      for (const meth of localMethods) {
        const escaped = meth.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const funcIdx = masked.search(
          new RegExp(`\\b${escaped}\\s*\\(`),
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
      sourceFingerprint: fingerprintDotnetSources(root),
      extractorId: this.id,
      extractorVersion: this.version,
      nodes,
      edges,
      stats: { nodeCount: nodes.length, edgeCount: edges.length },
    };
  }
}
