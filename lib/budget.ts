/**
 * Hard spend limits. The orchestrator must call `reserve` before every paid call;
 * a call that would cross either cap is refused, never made.
 */
export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

export class BudgetGuard {
  private packSpent = 0;

  constructor(
    readonly maxPerPackUsd: number,
    readonly maxPerDayUsd: number,
    private daySpent = 0,
  ) {}

  get spentUsd(): number {
    return round(this.packSpent);
  }

  get remainingUsd(): number {
    return round(Math.max(0, Math.min(this.maxPerPackUsd - this.packSpent, this.maxPerDayUsd - this.daySpent)));
  }

  /** Throws if spending `usd` would cross a cap; otherwise books it. */
  reserve(usd: number): void {
    if (!(usd >= 0)) throw new Error(`invalid amount ${usd}`);
    if (this.packSpent + usd > this.maxPerPackUsd + 1e-9) {
      throw new BudgetExceededError(`pack cap $${this.maxPerPackUsd} reached (spent $${this.spentUsd})`);
    }
    if (this.daySpent + usd > this.maxPerDayUsd + 1e-9) {
      throw new BudgetExceededError(`daily cap $${this.maxPerDayUsd} reached`);
    }
    this.packSpent += usd;
    this.daySpent += usd;
  }

  /** Return a reservation when the call failed and no payment was taken. */
  release(usd: number): void {
    this.packSpent = Math.max(0, this.packSpent - usd);
    this.daySpent = Math.max(0, this.daySpent - usd);
  }
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
