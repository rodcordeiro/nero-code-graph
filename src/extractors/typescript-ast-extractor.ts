import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";
import { makeNodeId } from "../contracts/node-id.js";
import {
  GRAPH_SCHEMA_VERSION,
  type GraphDocument,
  type GraphEdge,
  type GraphNode,
} from "../contracts/types.js";
import type { Extractor } from "../codegraph/ports.js";

const CODE_EXTS = new Set([".ts", ".tsx", ".mts", ".cts"]);

export type TypescriptAstExtractorOptions = {
  /** Absolute bound root (already allowlisted by caller). */
  boundRoot: string;
  includeGlobs?: string[];
};

function listTsFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist" || name === ".nero-code-graph") {
        continue;
      }
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (CODE_EXTS.has(extname(name))) out.push(full);
    }
  };
  walk(root);
  return out;
}

function rel(root: string, abs: string): string {
  return relative(root, abs).replace(/\\/g, "/");
}

/** Content-ish fingerprint of TS sources under root (path + mtime). */
export function fingerprintTsSources(root: string): string {
  const files = listTsFiles(resolve(root)).sort();
  return createHash("sha256")
    .update(files.map((f) => rel(resolve(root), f) + ":" + statSync(f).mtimeMs).join("|"))
    .digest("hex")
    .slice(0, 16);
}

function resolveImport(
  fromFile: string,
  spec: string,
  root: string,
): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    base.replace(/\.js$/, ".ts"),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile() && isPathInsideRoot(root, c)) return c;
    } catch {
      /* continue */
    }
  }
  return null;
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const relPath = relative(resolve(root), resolve(candidate));
  return relPath === "" || (!relPath.startsWith("..") && !isAbsolute(relPath));
}

/**
 * Code-only TypeScript Extractor (no LLM). Import-scoped call edges only.
 */
export class TypescriptAstExtractor implements Extractor {
  readonly id = "typescript-ast";
  readonly version = "0.1.0";

  constructor(private readonly options: TypescriptAstExtractorOptions) {}

  async fingerprint(): Promise<string> {
    return fingerprintTsSources(this.options.boundRoot);
  }

  async extract(input: {
    repoKey: string;
    rootLabel: string;
  }): Promise<GraphDocument> {
    const root = resolve(this.options.boundRoot);
    const files = listTsFiles(root);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const methodByFile = new Map<string, Set<string>>();
    const importsByFile = new Map<string, string[]>();

    for (const abs of files) {
      const fileRel = rel(root, abs);
      const text = readFileSync(abs, "utf8");
      // Strip string/template literals from fingerprint content later; do not store literals as nodes.
      const sf = ts.createSourceFile(
        fileRel,
        text,
        ts.ScriptTarget.Latest,
        true,
        fileRel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

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
        language: "typescript",
      });

      const methods = new Set<string>();
      methodByFile.set(abs, methods);
      const importedAbs: string[] = [];
      importsByFile.set(abs, importedAbs);

      const visit = (node: ts.Node) => {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
          const spec = (node.moduleSpecifier as ts.StringLiteral).text;
          const target = resolveImport(abs, spec, root);
          if (target) {
            importedAbs.push(target);
            const targetRel = rel(root, target);
            edges.push({
              from: fileId,
              to: makeNodeId({
                kind: "file",
                relativePath: targetRel,
                symbol: targetRel.split("/").pop()!,
              }),
              kind: "imports",
              provenance: "EXTRACTED",
              evidence: {
                file: fileRel,
                line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
              },
            });
          }
        }

        if (ts.isClassDeclaration(node) && node.name) {
          const className = node.name.text;
          const classId = makeNodeId({
            kind: "class",
            relativePath: fileRel,
            symbol: className,
          });
          nodes.push({
            id: classId,
            kind: "class",
            name: className,
            location: {
              file: fileRel,
              line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
            },
            language: "typescript",
          });
          edges.push({
            from: fileId,
            to: classId,
            kind: "contains",
            provenance: "EXTRACTED",
            evidence: {
              file: fileRel,
              line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
            },
          });

          for (const member of node.members) {
            if (
              ts.isMethodDeclaration(member) &&
              member.name &&
              ts.isIdentifier(member.name)
            ) {
              const methodName = member.name.text;
              methods.add(methodName);
              const methodId = makeNodeId({
                kind: "method",
                relativePath: fileRel,
                symbol: methodName,
              });
              nodes.push({
                id: methodId,
                kind: "method",
                name: methodName,
                location: {
                  file: fileRel,
                  line:
                    sf.getLineAndCharacterOfPosition(member.getStart(sf)).line +
                    1,
                },
                language: "typescript",
              });
              edges.push({
                from: classId,
                to: methodId,
                kind: "method",
                provenance: "EXTRACTED",
                evidence: {
                  file: fileRel,
                  line:
                    sf.getLineAndCharacterOfPosition(member.getStart(sf)).line +
                    1,
                },
              });
            }
          }
        }

        ts.forEachChild(node, visit);
      };
      visit(sf);
    }

    // Second pass: import-scoped calls
    for (const abs of files) {
      const fileRel = rel(root, abs);
      const text = readFileSync(abs, "utf8");
      const sf = ts.createSourceFile(fileRel, text, ts.ScriptTarget.Latest, true);
      const imported = importsByFile.get(abs) ?? [];
      let currentMethod: string | null = null;

      const visit = (node: ts.Node) => {
        if (
          ts.isMethodDeclaration(node) &&
          node.name &&
          ts.isIdentifier(node.name)
        ) {
          currentMethod = node.name.text;
        }
        if (ts.isCallExpression(node)) {
          const expr = node.expression;
          if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
            const called = expr.name.text;
            for (const imp of imported) {
              const methods = methodByFile.get(imp);
              if (methods?.has(called) && currentMethod) {
                const calleeRel = rel(root, imp);
                edges.push({
                  from: makeNodeId({
                    kind: "method",
                    relativePath: fileRel,
                    symbol: currentMethod,
                  }),
                  to: makeNodeId({
                    kind: "method",
                    relativePath: calleeRel,
                    symbol: called,
                  }),
                  kind: "calls",
                  provenance: "EXTRACTED",
                  evidence: {
                    file: fileRel,
                    line:
                      sf.getLineAndCharacterOfPosition(node.getStart(sf)).line +
                      1,
                  },
                });
                break;
              }
            }
          }
        }
        ts.forEachChild(node, visit);
        if (
          ts.isMethodDeclaration(node) &&
          node.name &&
          ts.isIdentifier(node.name)
        ) {
          currentMethod = null;
        }
      };
      visit(sf);
    }

    return {
      schemaVersion: GRAPH_SCHEMA_VERSION,
      target: { repoKey: input.repoKey, rootLabel: input.rootLabel },
      builtAt: new Date().toISOString(),
      sourceFingerprint: fingerprintTsSources(root),
      extractorId: this.id,
      extractorVersion: this.version,
      nodes,
      edges,
      stats: { nodeCount: nodes.length, edgeCount: edges.length },
    };
  }
}
