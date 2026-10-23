import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { buildPack, canonical } from "@/lib/pack";

// Throwaway key used only in tests (Hardhat/Anvil default account #0, publicly known).
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("buildPack", () => {
  it("canonical JSON is key-order independent", () => {
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(canonical({ a: [2, { c: 4, d: 3 }], b: 1 }));
  });

  it("signs the pack hash so anyone can verify it", async () => {
    const signer = privateKeyToAccount(TEST_KEY);
    const pack = await buildPack({
      input: { companyName: "Acme", jurisdictions: ["SG"] },
      findings: [],
      verdict: { verdict: "GO", reasons: [] },
      capUsd: 0.2,
      network: "eip155:84532",
      boundary: "test",
      signer,
    });
    expect(pack.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyMessage({ address: signer.address, message: pack.sha256, signature: pack.signature! })).toBe(true);
  });
});
