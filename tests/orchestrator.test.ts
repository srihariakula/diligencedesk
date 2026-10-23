import { describe, expect, it } from "vitest";
import { BudgetGuard } from "@/lib/budget";
import { runDiligence, type OrchestratorDeps } from "@/lib/orchestrator";
import type { Miner } from "@/lib/types";

const miner = (id: number): Miner => ({ id, name: `m${id}`, min_price_usdc: 10000, activation_status: "active", scored: true });
const input = { companyName: "Acme Ltd", jurisdictions: ["SG"] };

function deps(answer: (minerId: string, intentHint: string) => unknown, over: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    client: {
      ask: async (minerId, req) => {
        const out = answer(minerId, String(req.payload.query));
        if (out instanceof Error) throw out;
        return { miner_id: minerId, result: out, cost_usd: 0.01, signal_hash: `0xsig${minerId}`, httpStatus: 200 };
      },
    },
    minersFor: async () => [miner(1), miner(2), miner(3)],
    budget: new BudgetGuard(1, 10),
    timeoutMs: 1000,
    providersPerIntent: 2,
    ...over,
  };
}

const clean = (q: string) =>
  q.includes("sanctions") ? { match: false } : q.includes("registered company") ? { found: true, status: "active" } : { adverse: false };

describe("runDiligence", () => {
  it("returns GO with 2 paid answers per intent when providers agree", async () => {
    const r = await runDiligence(input, deps((_, q) => clean(q)));
    expect(r.verdict.verdict).toBe("GO");
    expect(r.findings).toHaveLength(3); // no documentUrl -> DOCUMENT_AUTHENTICITY skipped
    expect(r.findings.every((f) => f.sources.filter((c) => c.ok).length === 2)).toBe(true);
  });

  it("falls back to the next provider when one fails", async () => {
    const r = await runDiligence(input, deps((id, q) => (id === "1" ? new Error("upstream 500") : clean(q))));
    const reg = r.findings.find((f) => f.intent === "CORPORATE_REGISTRY_LOOKUP")!;
    expect(reg.sources.map((c) => c.ok)).toEqual([false, true, true]);
    expect(r.verdict.verdict).toBe("GO");
  });

  it("REVIEW, not a crash, when every provider fails", async () => {
    const r = await runDiligence(input, deps(() => new Error("down")));
    expect(r.verdict.verdict).toBe("REVIEW");
    expect(r.findings.every((f) => f.status === "unavailable")).toBe(true);
  });

  it("STOP when one sanctions provider reports a match", async () => {
    const r = await runDiligence(input, deps((id, q) => (q.includes("sanctions") && id === "2" ? { match: true, matches: [{ list: "SDN" }] } : clean(q))));
    expect(r.verdict.verdict).toBe("STOP");
  });

  it("stops buying at the budget cap", async () => {
    const budget = new BudgetGuard(0.03, 10);
    const r = await runDiligence(input, deps((_, q) => clean(q), { budget }));
    const paid = r.findings.flatMap((f) => f.sources).filter((c) => c.ok).length;
    expect(paid).toBe(3);
    expect(budget.spentUsd).toBeLessThanOrEqual(0.03);
  });
});

describe("runDiligence with unsupported miners", () => {
  it("skips a miner it cannot target without paying, and moves to the next", async () => {
    const needsCik: Miner = { ...miner(9), input_schema: { properties: { cik: {} }, required: ["cik"] }, supported_intents: ["X"] };
    const asked: string[] = [];
    const d = deps((id, q) => (asked.push(id), clean(q)), { minersFor: async () => [needsCik, miner(1), miner(2)] });
    const { findings } = await runDiligence(input, d);
    expect(asked).not.toContain("9");
    const skipped = findings[0].sources.find((c) => c.minerId === "9");
    expect(skipped).toMatchObject({ ok: false, costUsd: 0 });
    expect(skipped?.error).toMatch(/^skipped: needs cik/);
    expect(d.budget.spentUsd).toBeCloseTo(0.01 * 2 * findings.length);
  });
});
