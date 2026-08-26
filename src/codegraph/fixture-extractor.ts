import { readFileSync } from "node:fs";
import type { GraphDocument } from "../contracts/types.js";
import type { Extractor } from "./ports.js";

/** Loads a fixed GraphDocument (e.g. fixtures/minimal/graph.golden.json). */
export class FixtureExtractor implements Extractor {
  readonly id = "fake";
  readonly version = "0.0.0";

  constructor(private readonly goldenPath: string) {}

  async extract(input: {
    repoKey: string;
    rootLabel: string;
  }): Promise<GraphDocument> {
    const doc = JSON.parse(
      readFileSync(this.goldenPath, "utf8"),
    ) as GraphDocument;
    doc.target = { repoKey: input.repoKey, rootLabel: input.rootLabel };
    doc.builtAt = new Date().toISOString();
    doc.extractorId = this.id;
    doc.extractorVersion = this.version;
    return doc;
  }
}
