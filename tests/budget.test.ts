import { describe, expect, it } from "vitest";
import { BudgetExceededError, BudgetGuard } from "@/lib/budget";

describe("BudgetGuard", () => {
  it("refuses a call that would cross the pack cap", () => {
    const b = new BudgetGuard(0.02, 1);
    b.reserve(0.01);
    b.reserve(0.01);
    expect(() => b.reserve(0.01)).toThrow(BudgetExceededError);
    expect(b.spentUsd).toBe(0.02);
  });
  it("refuses a call that would cross the daily cap", () => {
    const b = new BudgetGuard(1, 0.05, 0.045);
    expect(() => b.reserve(0.01)).toThrow(/daily cap/);
  });
  it("releases failed calls", () => {
    const b = new BudgetGuard(0.01, 1);
    b.reserve(0.01);
    b.release(0.01);
    expect(() => b.reserve(0.01)).not.toThrow();
  });
});
