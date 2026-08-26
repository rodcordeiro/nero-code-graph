import type { GraphDocument } from "../contracts/types.js";
import type { GraphStore } from "./ports.js";

/** In-memory GraphStore for tests and early CodeGraph demos. */
export class MemoryGraphStore implements GraphStore {
  private doc: GraphDocument | null = null;

  async read(): Promise<GraphDocument | null> {
    return this.doc ? structuredClone(this.doc) : null;
  }

  async write(doc: GraphDocument): Promise<void> {
    this.doc = structuredClone(doc);
  }
}
