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
type MethodHit = {
  name: string;
  line: number;
  owner: ClassHit;
  returnType: string;
  parameters: string;
  bodyStart: number;
  bodyEnd: number;
};
type Source = {
  path: string; text: string; namespace: string | null; usings: string[];
  classes: ClassHit[]; methods: MethodHit[];
};
type Binding = { name: string; type: string | null; value?: string; start: number; end: number };

const TYPE = String.raw`[A-Za-z_][\w.]*(?:\s*<[^;{}()=]+>)?(?:\[\])?\??`;
const MODIFIERS = String.raw`(?:(?:public|protected|private|internal|static|virtual|override|sealed|abstract|async|partial|new|extern|unsafe|readonly)\s+)*`;
const NON_METHODS = new Set(["if", "while", "for", "foreach", "switch", "catch", "using", "lock", "nameof", "typeof", "sizeof", "new", "async", "await", "return", "delegate"]);
const NAMESPACE_RE = /\bnamespace\s+([A-Za-z_][A-Za-z0-9_.]*)\s*[;{]/g;
const USING_RE = /\busing\s+(?:static\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\s*=\s*)?([A-Za-z_][A-Za-z0-9_.]*)\s*;/g;
const CLASS_RE = /\b(?:class|struct|record|interface)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;

/** Match a balanced delimiter in already masked source. */
function matching(text: string, openIdx: number, open = "{", close = "}"): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return i;
  }
  return -1;
}

/** Brace depth before each character; declarations must be immediate class members. */
function depths(text: string): number[] {
  const out: number[] = [];
  let depth = 0;
  for (const c of text) {
    out.push(depth);
    if (c === "{") depth++;
    if (c === "}") depth--;
  }
  return out;
}

/** Read the namespace of the supported single-namespace source layout. */
function extractNamespace(masked: string): string | null {
  NAMESPACE_RE.lastIndex = 0;
  return NAMESPACE_RE.exec(masked)?.[1] ?? null;
}

/** Namespace reachability is only a candidate set, not proof of type use. */
function extractUsings(masked: string): string[] {
  return [...masked.matchAll(new RegExp(USING_RE.source, "g"))].map(m => m[1]);
}

/** Locate type bodies without interpreting literals or comments. */
function extractClasses(masked: string): ClassHit[] {
  const hits: ClassHit[] = [];
  for (const m of masked.matchAll(new RegExp(CLASS_RE.source, "g"))) {
    const bodyStart = masked.indexOf("{", m.index + m[0].length);
    if (bodyStart < 0) continue;
    const semicolon = masked.indexOf(";", m.index + m[0].length);
    if (semicolon >= 0 && semicolon < bodyStart) continue;
    const bodyEnd = matching(masked, bodyStart);
    if (bodyEnd >= 0) hits.push({ name: m[1], line: lineAt(masked, m.index), bodyStart, bodyEnd });
  }
  return hits;
}

/** Only immediate class declarations become method nodes; retain exact body spans. */
function extractMethods(masked: string, classes: ClassHit[]): MethodHit[] {
  const methods: MethodHit[] = [];
  const depth = depths(masked);
  const re = new RegExp(String.raw`\b${MODIFIERS}(${TYPE})\s+([A-Za-z_]\w*)\s*(?:<[^;{}()]+>)?\s*\(`, "g");
  for (const m of masked.matchAll(re)) {
    const owner = classes.filter(c => m.index > c.bodyStart && m.index < c.bodyEnd)
      .sort((a, b) => b.bodyStart - a.bodyStart)[0];
    if (!owner || depth[m.index] !== depth[owner.bodyStart] + 1) continue;
    const name = m[2];
    if (name === owner.name || NON_METHODS.has(name) || NON_METHODS.has(m[1])) continue;
    const paramStart = m.index + m[0].lastIndexOf("(");
    const paramEnd = matching(masked, paramStart, "(", ")");
    if (paramEnd < 0) continue;
    let start = paramEnd + 1;
    while (start < masked.length && /\s/.test(masked[start])) start++;
    let end = -1;
    if (masked[start] === "{") end = matching(masked, start);
    else if (masked.slice(start, start + 2) === "=>") {
      start += 2;
      end = masked.indexOf(";", start);
    } else if (masked[start] === ";") end = start;
    if (end < 0 || end > owner.bodyEnd) continue;
    methods.push({ name, line: lineAt(masked, m.index), owner,
      returnType: m[1].replace(/\s+/g, ""), parameters: masked.slice(paramStart + 1, paramEnd),
      bodyStart: start, bodyEnd: end });
  }
  return methods;
}

/** Typed parameters; values remain internal and never enter GraphDocument. */
function typedBindings(text: string, start: number, end: number): Binding[] {
  const re = new RegExp(String.raw`\b(${TYPE})\s+([A-Za-z_]\w*)\s*(?=[,)=;{]|$)`, "g");
  return [...text.matchAll(re)].filter(m => !NON_METHODS.has(m[1])).map(m => ({
    name: m[2], type: m[1] === "var" ? null : m[1].replace(/\s+/g, ""), start, end,
  }));
}

/** End of the lexical block containing an offset. */
function scopeEnd(text: string, offset: number, fallback: number): number {
  const stack: number[] = [];
  for (let i = 0; i < offset; i++) {
    if (text[i] === "{") stack.push(i);
    if (text[i] === "}") stack.pop();
  }
  return stack.length ? matching(text, stack[stack.length - 1]) : fallback;
}

/** Find the end of a lambda expression without crossing its enclosing argument. */
function expressionEnd(text: string, start: number, fallback: number): number {
  let depth = 0;
  for (let i = start; i < fallback; i++) {
    if (depth === 0 && /[;,)}]/.test(text[i])) return i;
    if (text[i] === "(" || text[i] === "[") depth++;
    if (text[i] === ")" || text[i] === "]") depth--;
  }
  return fallback;
}

/** Nested function/lambda parameters shadow outer variables only inside their body. */
function nestedBindings(body: string, bodyStart: number): Binding[] {
  const bindings: Binding[] = [];
  const add = (parameters: string, start: number, end: number) => {
    const typed = typedBindings(parameters, start, end);
    bindings.push(...typed);
    for (const parameter of parameters.split(",")) {
      const name = parameter.trim();
      if (/^[A-Za-z_]\w*$/.test(name) && !typed.some(b => b.name === name)) {
        bindings.push({ name, type: null, start, end });
      }
    }
  };
  const re = new RegExp(String.raw`(?:\(([^()]*)\)|\b([A-Za-z_]\w*))\s*=>|\b(?:${TYPE})\s+([A-Za-z_]\w*)\s*\(([^()]*)\)\s*(?=\{)|\bdelegate\s*\(([^()]*)\)\s*(?=\{)`, "g");
  for (const m of body.matchAll(re)) {
    let start = m.index + m[0].length;
    while (/\s/.test(body[start] ?? "") && start < body.length) start++;
    const end = body[start] === "{" ? matching(body, start) : expressionEnd(body, start, body.length);
    if (end < 0) continue;
    add(m[1] ?? m[2] ?? m[4] ?? m[5], bodyStart + start - 1, bodyStart + end);
    if (m[3]) bindings.push({ name: m[3], type: null,
      start: bodyStart, end: bodyStart + body.length });
  }
  return bindings;
}

/**
 * Conservative C# structural extractor. Resolves supported lexical types;
 * unresolved dispatch stays ambiguous rather than choosing a homonym.
 */
export class DotnetAstExtractor implements Extractor {
  readonly id = "dotnet-ast";
  readonly version = "0.1.1";

  constructor(private readonly options: DotnetAstExtractorOptions) {}

  async fingerprint(): Promise<string> {
    return fingerprintDotnetSources(this.options.boundRoot);
  }

  async extract(input: { repoKey: string; rootLabel: string }): Promise<GraphDocument> {
    const root = resolve(this.options.boundRoot);
    const sources: Source[] = listCsFiles(root).sort().map(abs => {
      const text = maskLiterals(readFileSync(abs, "utf8"));
      const classes = extractClasses(text);
      return { path: rel(root, abs), text, classes, methods: extractMethods(text, classes),
        namespace: extractNamespace(text), usings: extractUsings(text) };
    });
    const nodeMap = new Map<string, GraphNode>();
    const edgeMap = new Map<string, GraphEdge>();
    const fileId = (source: Source) => makeNodeId({ kind: "file", relativePath: source.path, symbol: source.path.split("/").pop()! });
    const classId = (source: Source, cls: ClassHit) => makeNodeId({ kind: "class", relativePath: source.path, symbol: cls.name });
    const methodId = (source: Source, method: MethodHit) => makeNodeId({ kind: "method", relativePath: source.path, symbol: method.name });
    const addEdge = (edge: GraphEdge) => {
      edgeMap.set(JSON.stringify(edge), edge);
    };
    const addNode = (id: string, kind: GraphNode["kind"], name: string, source: Source, line: number) => {
      if (!nodeMap.has(id)) nodeMap.set(id, { id, kind, name, location: { file: source.path, line }, language: "csharp" });
    };
    for (const source of sources) {
      addNode(fileId(source), "file", source.path.split("/").pop()!, source, 1);
      for (const cls of source.classes) {
        addNode(classId(source, cls), "class", cls.name, source, cls.line);
        addEdge({ from: fileId(source), to: classId(source, cls), kind: "contains", provenance: "EXTRACTED", evidence: { file: source.path, line: cls.line } });
      }
      for (const method of source.methods) {
        addNode(methodId(source, method), "method", method.name, source, method.line);
        addEdge({ from: classId(source, method.owner), to: methodId(source, method), kind: "method", provenance: "EXTRACTED", evidence: { file: source.path, line: method.line } });
      }
    }
    const reachable = (source: Source) => sources.filter(other => other === source ||
      (other.namespace !== null && (source.namespace === other.namespace || source.usings.includes(other.namespace))));
    for (const source of sources) {
      for (const other of reachable(source)) {
        if (other === source) continue;
        const using = [...source.text.matchAll(new RegExp(USING_RE.source, "g"))].find(m => m[1] === other.namespace);
        addEdge({ from: fileId(source), to: fileId(other), kind: "imports", provenance: "INFERRED",
          evidence: { file: source.path, line: using ? lineAt(source.text, using.index) : 1 } });
      }
    }
    type Target = { source: Source; method: MethodHit };
    // Multiple declarations can share a v1 ID (overloads / classes in one file).
    // Never use that lossy ID as proof of a unique declaration.
    const idCounts = new Map<string, number>();
    for (const source of sources) for (const method of source.methods) {
      const id = methodId(source, method);
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }
    for (const source of sources) {
      const accessible = reachable(source);
      const candidates = (name: string): Target[] => accessible.flatMap(s =>
        s.methods.filter(m => m.name === name).map(method => ({ source: s, method })));
      for (const caller of source.methods) {
        if (source.text[caller.bodyStart] === ";") continue;
        const text = source.text;
        const body = text.slice(caller.bodyStart, caller.bodyEnd + 1);
        const classBody = text.slice(caller.owner.bodyStart + 1, caller.owner.bodyEnd);
        const classDepths = depths(classBody);
        const fields: Binding[] = [];
        const fieldRe = new RegExp(String.raw`\b${MODIFIERS}(${TYPE})\s+([A-Za-z_]\w*)\s*(?=[;={])`, "g");
        for (const m of classBody.matchAll(fieldRe)) {
          if (classDepths[m.index] !== 0 || NON_METHODS.has(m[1])) continue;
          fields.push({ name: m[2], type: m[1], start: caller.owner.bodyStart, end: caller.owner.bodyEnd });
        }
        const bindings = [...fields, ...typedBindings(caller.parameters, caller.bodyStart, caller.bodyEnd),
          ...nestedBindings(body, caller.bodyStart)];
        const localRe = new RegExp(String.raw`\b(${TYPE})\s+([A-Za-z_]\w*)\s*(=|(?=;|\)|in\b))`, "g");
        for (const m of body.matchAll(localRe)) {
          if (NON_METHODS.has(m[1])) continue;
          const prefix = body.slice(0, m.index);
          // Lambda/local-function parameters are scoped by nestedBindings instead.
          if (m[3] !== "=" && body[m.index + m[0].length] === ")" && !/\bout\s*$/.test(prefix)) continue;
          const offset = caller.bodyStart + m.index;
          let end = scopeEnd(text, offset, caller.bodyEnd);
          // Header variables belong to the following statement, not its parent block.
          if (/\b(?:foreach|catch|for|using)\s*\(\s*$/.test(prefix)) {
            const close = matching(body, prefix.lastIndexOf("("), "(", ")");
            let statement = close + 1;
            while (statement < body.length && /\s/.test(body[statement])) statement++;
            end = caller.bodyStart + (body[statement] === "{" ? matching(body, statement) : expressionEnd(body, statement, body.length));
          }
          const valueStart = offset + m[0].length;
          const valueEnd = text.indexOf(";", valueStart);
          bindings.push({ name: m[2], type: m[1] === "var" ? null : m[1],
            value: m[3] === "=" && valueEnd >= 0 ? text.slice(valueStart, valueEnd) : undefined,
            start: offset, end });
        }
        const bindingType = (name: string, offset: number, depth: number): string | null => {
          if (depth > 6) return null;
          const explicitField = name.startsWith("this.");
          const symbol = explicitField ? name.slice(5) : name;
          const available = (explicitField ? fields : bindings).filter(b => b.name === symbol && b.start < offset && offset <= b.end);
          const binding = available.sort((a, b) => b.start - a.start)[0];
          if (!binding) return null;
          if (binding.type) return binding.type;
          // A later assignment invalidates initializer-based inference.
          const since = text.slice(binding.start, offset);
          const reassignment = new RegExp(String.raw`\b${symbol}\s*=(?!=)`, "g");
          if ([...since.matchAll(reassignment)].length > (binding.value ? 1 : 0)) return null;
          return binding.value ? expressionType(binding.value.trim(), binding.start, depth + 1) : null;
        };
        const resolveCall = (receiver: string | undefined, name: string, offset: number, depth = 0): { targets: Target[]; certain: boolean } => {
          const all = candidates(name);
          if (!receiver || receiver === "this") {
            const local = source.methods.filter(m => m.owner === caller.owner && m.name === name)
              .map(method => ({ source, method }));
            const shadowed = !receiver && bindings.some(b => b.name === name && b.start < offset && offset <= b.end);
            return { targets: shadowed ? all : local, certain: !shadowed && local.length === 1 };
          }
          if (receiver === "base") return { targets: all, certain: false };
          const declared = bindingType(receiver, offset, depth + 1);
          const rootName = receiver.split(".")[0];
          const rootBinding = bindings.some(b => b.name === rootName && b.start < offset && offset <= b.end);
          if (declared === null && receiver.includes(".") && rootBinding) return { targets: all, certain: false };
          const type = (declared ?? receiver).replace(/^global::/, "").replace(/\?$/, "");
          const owners = accessible.flatMap(s => s.classes.filter(c =>
            type.includes(".") ? `${s.namespace ? s.namespace + "." : ""}${c.name}` === type : c.name === type
          ).map(owner => ({ source: s, owner })));
          const targets = owners.flatMap(o => o.source.methods.filter(m => m.owner === o.owner && m.name === name)
            .map(method => ({ source: o.source, method })));
          // An unknown receiver is not a static type merely because its name matches a class.
          const staticReceiver = declared === null && /^[A-Z]/.test(receiver) &&
            !rootBinding;
          return { targets: owners.length ? targets : all,
            certain: (declared !== null || staticReceiver) && owners.length === 1 && targets.length === 1 };
        };
        const expressionType = (expression: string, offset: number, depth: number): string | null => {
          if (depth > 6) return null;
          const awaited = /^await\s+/.test(expression);
          const value = expression.replace(/^await\s+/, "").trim();
          const created = value.match(new RegExp(String.raw`^new\s+(${TYPE})\s*\(`));
          if (created) return created[1];
          const service = value.match(/(?:^|\.)GetRequiredService\s*<\s*([A-Za-z_][\w.]*)\s*>\s*\(\s*\)$/);
          if (service) return service[1];
          const call = value.match(/^(?:([A-Za-z_][\w.]*)\s*\.)?([A-Za-z_]\w*)\s*\([^;]*\)$/);
          if (!call) return null;
          const resolved = resolveCall(call[1], call[2], offset, depth + 1);
          if (!resolved.certain || resolved.targets.length !== 1) return null;
          const target = resolved.targets[0];
          if (idCounts.get(methodId(target.source, target.method)) !== 1) return null;
          const result = target.method.returnType;
          return awaited ? result.match(/^(?:System\.Threading\.Tasks\.)?(?:Task|ValueTask)<(.+)>$/)?.[1] ?? null : result;
        };
        const callRe = /(?:(\b(?:this\.)?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*(?:\?\.|\.)\s*)?\b([A-Za-z_]\w*)\s*(?:<[^;{}()]+>)?\s*\(/g;
        for (const call of body.matchAll(callRe)) {
          const name = call[2];
          if (NON_METHODS.has(name)) continue;
          const offset = caller.bodyStart + call.index;
          // Do not treat a local-function declaration or constructor as an invocation.
          const prefix = body.slice(Math.max(0, call.index - 40), call.index);
          if (/\bnew\s*$/.test(prefix) || /(?:\.|::)\s*$/.test(prefix)) continue;
          const close = matching(text, offset + call[0].lastIndexOf("("), "(", ")");
          if (close < 0) continue;
          const after = text.slice(close + 1).trimStart();
          if (!call[1] && (after.startsWith("{") || after.startsWith("=>"))) continue;
          const resolved = resolveCall(call[1], name, offset);
          for (const target of resolved.targets) {
            const unique = idCounts.get(methodId(target.source, target.method)) === 1 &&
              idCounts.get(methodId(source, caller)) === 1;
            addEdge({ from: methodId(source, caller), to: methodId(target.source, target.method), kind: "calls",
              provenance: resolved.certain && unique ? "EXTRACTED" : "AMBIGUOUS",
              evidence: { file: source.path, line: lineAt(text, offset) } });
          }
        }
      }
    }
    const nodes = [...nodeMap.values()];
    const edges = [...edgeMap.values()];
    return { schemaVersion: GRAPH_SCHEMA_VERSION, target: { repoKey: input.repoKey, rootLabel: input.rootLabel },
      builtAt: new Date().toISOString(), sourceFingerprint: fingerprintDotnetSources(root),
      extractorId: this.id, extractorVersion: this.version, nodes, edges,
      stats: { nodeCount: nodes.length, edgeCount: edges.length } };
  }
}
