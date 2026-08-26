import type { GraphDocument } from "../contracts/types.js";

export type Extractor = {
  readonly id: string;
  readonly version: string;
  extract(input: { repoKey: string; rootLabel: string }): Promise<GraphDocument>;
  /** Live source fingerprint for stale checks (optional; skip if absent). */
  fingerprint?(): Promise<string>;
};

export type GraphStore = {
  read(): Promise<GraphDocument | null>;
  write(doc: GraphDocument): Promise<void>;
};
