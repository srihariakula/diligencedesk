import { describe, expect, it } from "vitest";
import { paymentRefusal } from "@/lib/telegraph";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

describe("paymentRefusal", () => {
  it("returns the node's reason for refusing a signed payment", () => {
    const header = b64({ error: "payment verification refused for 0xabc: invalid_exact_evm_insufficient_balance", x402Version: 2 });
    expect(paymentRefusal(header)).toMatch(/insufficient_balance/);
  });
  it("ignores the generic first challenge", () => {
    expect(paymentRefusal(b64({ error: "Payment required", accepts: [] }))).toBeUndefined();
  });
  it("tolerates a missing or garbled header", () => {
    expect(paymentRefusal(null)).toBeUndefined();
    expect(paymentRefusal("not base64 json")).toBeUndefined();
  });
});

describe("paymentRefusal trimming", () => {
  it("drops the contract-call dump after the cause", () => {
    const header = b64({ error: "refused for 0xabc: invalid_exact_evm_insufficient_balance (The contract function reverted\nDetails: ...)" });
    expect(paymentRefusal(header)).toBe("refused for 0xabc: invalid_exact_evm_insufficient_balance");
  });
});
