import { describe, expect, it } from "vitest";
import { makeNodeId, parseNodeId } from "../../src/contracts/node-id.js";

describe("Node.id (Q10)", () => {
  it("builds a stable id from kind + relative path + symbol", () => {
    expect(
      makeNodeId({
        kind: "method",
        relativePath: "src/orders/OrderService.ts",
        symbol: "PlaceOrder",
      }),
    ).toBe("method:src/orders/OrderService.ts#PlaceOrder");
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(
      makeNodeId({
        kind: "file",
        relativePath: "src\\orders\\OrderService.ts",
        symbol: "OrderService.ts",
      }),
    ).toBe("file:src/orders/OrderService.ts#OrderService.ts");
  });

  it("round-trips through parseNodeId", () => {
    const id = makeNodeId({
      kind: "class",
      relativePath: "src/payments/IPaymentClient.ts",
      symbol: "IPaymentClient",
    });
    expect(parseNodeId(id)).toEqual({
      kind: "class",
      relativePath: "src/payments/IPaymentClient.ts",
      symbol: "IPaymentClient",
    });
  });
});
