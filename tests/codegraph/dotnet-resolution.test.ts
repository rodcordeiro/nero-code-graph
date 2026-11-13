import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CodeGraph, MemoryGraphStore } from "../../src/codegraph/index.js";
import { DotnetAstExtractor } from "../../src/extractors/dotnet-ast-extractor.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Exercise the real extractor through the public CodeGraph seam. */
async function graph(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "ncg-dotnet-resolution-"));
  roots.push(root);
  for (const [name, source] of Object.entries(files)) writeFileSync(join(root, name), source);
  const cg = new CodeGraph({
    extractor: new DotnetAstExtractor({ boundRoot: root }),
    store: new MemoryGraphStore(),
  });
  await cg.rebuild({ repoKey: "dotnet-resolution", rootLabel: "fixture" });
  return cg;
}

describe("C# call resolution via CodeGraph", () => {
  it("does not confuse qualified property chains with static types and respects foreach/out binders", async () => {
    const cg = await graph({
      "Service.cs": "namespace Demo; public class Service { public void Send() {} }",
      "Other.cs": "namespace Demo; public class Other { public void Send() {} }",
      "Holder.cs": "namespace Demo; public class Holder { public Other Service; }",
      "Handler.cs": `namespace Demo;
public class Handler {
  private Service service;
  private Holder Demo;
  public void Run() {
    Demo.Service.Send();
    foreach (Other service in others) { service.Send(); }
    service.Send();
  }
  public void Out() { TryGet(out var service); service.Send(); }
}`,
    });
    const calls = await cg.getNeighbors({ nodeId: "method:Handler.cs#Run", direction: "outgoing", relationFilter: ["calls"] });
    if (!("hops" in calls.payload)) throw new Error("missing hops");
    const confirmed = calls.payload.hops.filter(h => h.provenance === "EXTRACTED");
    expect(confirmed).toEqual([
      expect.objectContaining({ to: "method:Other.cs#Send", evidence: { file: "Handler.cs", line: 7 } }),
      expect.objectContaining({ to: "method:Service.cs#Send", evidence: { file: "Handler.cs", line: 8 } }),
    ]);
    const out = await cg.getNeighbors({ nodeId: "method:Handler.cs#Out", direction: "outgoing", relationFilter: ["calls"] });
    if (!("hops" in out.payload)) throw new Error("missing hops");
    expect(out.payload.hops.every(h => h.provenance === "AMBIGUOUS")).toBe(true);
  });
  it("does not assign a following class body to a bodyless positional record", async () => {
    const cg = await graph({
      "Types.cs": "namespace Demo; public record Order(int Id); public class Service { public override string ToString() { return null; } }",
      "Handler.cs": "namespace Demo; public class Handler { public void Run(Service service, Order order) { service.ToString(); order.ToString(); } }",
    });
    const service = await cg.getNeighbors({ nodeId: "class:Types.cs#Service", direction: "outgoing", relationFilter: ["method"] });
    expect(service.payload).toEqual({ hops: [expect.objectContaining({ to: "method:Types.cs#ToString" })] });
    const calls = await cg.getNeighbors({ nodeId: "method:Handler.cs#Run", direction: "outgoing", relationFilter: ["calls"] });
    if (!("hops" in calls.payload)) throw new Error("missing hops");
    expect(calls.payload.hops.filter(h => h.provenance === "EXTRACTED")).toHaveLength(1);
  });

  it("does not confirm a collapsed caller ID or a local function shadowing a member", async () => {
    const cg = await graph({
      "Service.cs": "namespace Demo; public class Service { public void Send() {} }",
      "Callers.cs": "namespace Demo; public class A { public void Run(Service service) { service.Send(); } } public class B { public void Run(Service service) { service.Send(); } }",
      "Handler.cs": "namespace Demo; public class Handler { public void Run() { void M() {} M(); this.M(); } private void M() {} }",
    });
    const collision = await cg.getNeighbors({ nodeId: "method:Callers.cs#Run", direction: "outgoing", relationFilter: ["calls"] });
    if (!("hops" in collision.payload)) throw new Error("missing hops");
    expect(collision.payload.hops.length).toBeGreaterThan(0);
    expect(collision.payload.hops.every(h => h.provenance === "AMBIGUOUS")).toBe(true);
    const local = await cg.getNeighbors({ nodeId: "method:Handler.cs#Run", direction: "outgoing", relationFilter: ["calls"] });
    if (!("hops" in local.payload)) throw new Error("missing hops");
    expect(local.payload.hops.filter(h => h.to === "method:Handler.cs#M" && h.provenance === "EXTRACTED")).toHaveLength(1);
  });
  it("never reinterprets the end of an unsupported receiver chain as a local call", async () => {
    const cg = await graph({
      "Other.cs": "namespace Demo; public class Other { public void M() {} }",
      "Handler.cs": `namespace Demo;
public class Handler {
  public void Run(dynamic factory) {
    factory.Get().M();
    new Other().M();
    factory?.Get()?.M();
  }
  private void M() {}
}`,
    });
    const calls = await cg.getNeighbors({ nodeId: "method:Handler.cs#Run", direction: "outgoing", relationFilter: ["calls"] });
    if (!("hops" in calls.payload)) throw new Error("missing hops");
    expect(calls.payload.hops.some(h => h.to === "method:Handler.cs#M" && h.provenance === "EXTRACTED")).toBe(false);
  });
  it("marks unresolved receivers and lossy overload IDs ambiguous and namespace imports inferred", async () => {
    const cg = await graph({
      "A.cs": "namespace Models; public class A { public void Send() {} }",
      "B.cs": "namespace Models; public class B { public void Send() {} }",
      "Overloads.cs": "namespace Demo; public class Overloads { public void M() {} public void M(int x) {} }",
      "Handler.cs": `namespace Demo;
using Models;
public class Handler {
  public void Run(dynamic unknown, Overloads overloads) {
    unknown.Send();
    overloads.M();
  }
}`,
    });
    const calls = await cg.getNeighbors({ nodeId: "method:Handler.cs#Run", direction: "outgoing", relationFilter: ["calls"] });
    if (!("hops" in calls.payload)) throw new Error("missing hops");
    expect(calls.payload.hops).toHaveLength(3);
    expect(calls.payload.hops).toEqual(expect.arrayContaining([
      expect.objectContaining({ to: "method:A.cs#Send", provenance: "AMBIGUOUS" }),
      expect.objectContaining({ to: "method:B.cs#Send", provenance: "AMBIGUOUS" }),
      expect.objectContaining({ to: "method:Overloads.cs#M", provenance: "AMBIGUOUS" }),
    ]));
    const imports = await cg.getNeighbors({ nodeId: "file:Handler.cs#Handler.cs", direction: "outgoing", relationFilter: ["imports"] });
    if (!("hops" in imports.payload)) throw new Error("missing hops");
    expect(imports.payload.hops).toHaveLength(3);
    expect(imports.payload.hops.every(h => h.provenance === "INFERRED")).toBe(true);
  });

  it("does not leak inner-block variables or lambda parameters into a different receiver type", async () => {
    const cg = await graph({
      "A.cs": "namespace Demo; public class A { public void Send() {} }",
      "B.cs": "namespace Demo; public class B { public void Send() {} }",
      "Handler.cs": `namespace Demo;
public class Handler {
  private A result;
  public void Run() {
    { var result = new B(); result.Send(); }
    result.Send();
    Action<B> send = (B result) => result.Send();
    result.Send();
  }
}`,
    });
    const calls = await cg.getNeighbors({ nodeId: "method:Handler.cs#Run", direction: "outgoing", relationFilter: ["calls"] });
    if (!("hops" in calls.payload)) throw new Error("missing hops");
    const confirmed = calls.payload.hops.filter(h => h.provenance === "EXTRACTED");
    expect(confirmed).toEqual([
      expect.objectContaining({ to: "method:B.cs#Send", evidence: { file: "Handler.cs", line: 5 } }),
      expect.objectContaining({ to: "method:A.cs#Send", evidence: { file: "Handler.cs", line: 6 } }),
      expect.objectContaining({ to: "method:B.cs#Send", evidence: { file: "Handler.cs", line: 7 } }),
      expect.objectContaining({ to: "method:A.cs#Send", evidence: { file: "Handler.cs", line: 8 } }),
    ]);
  });
  it("keeps bare/this calls local and attributes lambda, delegate and local-function bodies to their container", async () => {
    const cg = await graph({
      "Service.cs": "namespace Demo; public class Service { public void Send() {} }",
      "Other.cs": "namespace Demo; public class Other { public void M() {} }",
      "Handler.cs": `namespace Demo;
public class Handler {
  private readonly Service service;
  public async Task Run(Func<int, Task> enviarLoja) {
    M();
    this.M();
    await Parallel.ForEachAsync(items, async (item, ct) => {
      await enviarLoja(item);
      service.Send();
    });
    void Local() { service.Send(); }
    Local();
  }
  private void M() { service.Send(); }
}`,
    });
    const calls = await cg.getNeighbors({ nodeId: "method:Handler.cs#Run", direction: "outgoing", relationFilter: ["calls"] });
    if (!("hops" in calls.payload)) throw new Error("missing hops");
    expect(calls.payload.hops.filter(h => h.to === "method:Handler.cs#M")).toEqual([
      expect.objectContaining({ provenance: "EXTRACTED", evidence: { file: "Handler.cs", line: 5 } }),
      expect.objectContaining({ provenance: "EXTRACTED", evidence: { file: "Handler.cs", line: 6 } }),
    ]);
    expect(calls.payload.hops.filter(h => h.to === "method:Service.cs#Send").map(h => h.evidence?.line)).toEqual([9, 11]);
    expect(calls.payload.hops.some(h => h.to === "method:Other.cs#M")).toBe(false);
    for (const name of ["async", "enviarLoja", "Local"]) {
      expect((await cg.getNode(`method:Handler.cs#${name}`)).payload).toEqual({ error: "node_not_found" });
    }
    const path = await cg.shortestPath("method:Handler.cs#M", "method:Service.cs#Send");
    expect("hops" in path.payload && path.payload.hops.length).toBe(1);
  });
  it("resolves DI to its interface and awaited local return types without false callers", async () => {
    const cg = await graph({
      "IA.cs": "namespace Demo; public interface IA { Task<Result> ExecutarAsync(); }",
      "B.cs": "namespace Demo; public class B { public Task<Result> ExecutarAsync() { return null; } }",
      "Result.cs": "namespace Demo; public class Result { public string MensagemReporte() { return null; } }",
      "OtherResult.cs": "namespace Demo; public class OtherResult { public string MensagemReporte() { return null; } }",
      "Handler.cs": `namespace Demo;
public class Handler {
  public async Task Handle() {
    var service = provider.GetRequiredService<IA>();
    await service.ExecutarAsync();
    var resultado = await ExecutarAsync();
    resultado.MensagemReporte();
  }
  private Task<Result> ExecutarAsync() { return null; }
}`,
    });
    const calls = await cg.getNeighbors({ nodeId: "method:Handler.cs#Handle", direction: "outgoing", relationFilter: ["calls"] });
    expect(calls.payload).toEqual({ hops: expect.arrayContaining([
      expect.objectContaining({ to: "method:IA.cs#ExecutarAsync", provenance: "EXTRACTED", evidence: { file: "Handler.cs", line: 5 } }),
      expect.objectContaining({ to: "method:Handler.cs#ExecutarAsync", provenance: "EXTRACTED", evidence: { file: "Handler.cs", line: 6 } }),
      expect.objectContaining({ to: "method:Result.cs#MensagemReporte", provenance: "EXTRACTED", evidence: { file: "Handler.cs", line: 7 } }),
    ]) });
    if (!("hops" in calls.payload)) throw new Error("missing hops");
    expect(calls.payload.hops.some(h => h.to === "method:B.cs#ExecutarAsync")).toBe(false);
    expect(calls.payload.hops.some(h => h.to === "method:OtherResult.cs#MensagemReporte")).toBe(false);
    const path = await cg.shortestPath("method:Handler.cs#Handle", "method:Result.cs#MensagemReporte");
    expect("hops" in path.payload && path.payload.hops.length).toBe(1);
  });
});
