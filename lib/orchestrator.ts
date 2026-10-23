import { DILIGENCE_INTENTS, type DiligenceIntent } from "@/config/intents";
import { BudgetExceededError, BudgetGuard } from "./budget";
import { buildRequest, interpret } from "./adapters";
import { floorPriceUsd } from "./registry";
import { decideVerdict } from "./verdict";
import type { CallRecord, DiligenceInput, Finding, FindingStatus, Miner } from "./types";
import type { TelegraphClient } from "./telegraph";

export interface OrchestratorDeps {
  client: Pick<TelegraphClient, "ask">;
  minersFor: (intent: DiligenceIntent) => Promise<Miner[]>; // ranked best-first
  budget: BudgetGuard;
  timeoutMs: number;
  providersPerIntent: number; // how many independent answers to try to collect
  onCall?: (call: CallRecord) => void; // progress + logging hook
}

/** Severity order used when two providers disagree: keep the worse answer. */
const SEVERITY: Record<FindingStatus, number> = { hit: 5, flagged: 4, not_found: 3, unclear: 2, unavailable: 1, clear: 0 };

/**
 * Buys all four Intents in parallel. Per Intent, walks the ranked providers until it has
 * `providersPerIntent` answers or runs out; failures and timeouts fall through to the next provider.
 */
export async function runDiligence(input: DiligenceInput, deps: OrchestratorDeps) {
  const intents = DILIGENCE_INTENTS.filter((i) => i !== "DOCUMENT_AUTHENTICITY" || input.documentUrl);
  const findings = await Promise.all(intents.map((intent) => checkIntent(intent, input, deps)));
  return { findings, verdict: decideVerdict(findings) };
}

async function checkIntent(intent: DiligenceIntent, input: DiligenceInput, deps: OrchestratorDeps): Promise<Finding> {
  const calls: CallRecord[] = [];
  const answers: { status: FindingStatus; summary: string }[] = [];
  let miners: Miner[] = [];
  try {
    miners = await deps.minersFor(intent);
  } catch (e) {
    return { intent, status: "unavailable", summary: `provider discovery failed: ${msg(e)}`, sources: calls };
  }
  const jurisdiction = input.jurisdictions[0];

  for (const miner of miners) {
    if (answers.length >= deps.providersPerIntent) break;
    const price = floorPriceUsd(miner);
    try {
      deps.budget.reserve(price);
    } catch (e) {
      if (e instanceof BudgetExceededError) break;
      throw e;
    }
    const started = Date.now();
    const record: CallRecord = { intent, minerId: String(miner.id), minerName: miner.name, ok: false, costUsd: 0, latencyMs: 0, at: new Date().toISOString() };
    try {
      const answer = await withTimeout(deps.timeoutMs, (signal) => deps.client.ask(String(miner.id), buildRequest(intent, miner, input, jurisdiction), signal));
      Object.assign(record, {
        ok: true,
        costUsd: answer.cost_usd ?? price,
        signalHash: answer.signal_hash,
        receipt: answer.receipt,
        result: answer.result,
      });
      // book the real price if it differs from the floor (demand multiplier)
      if (record.costUsd !== price) {
        deps.budget.release(price);
        deps.budget.reserve(record.costUsd);
      }
      answers.push(interpret(intent, answer.result));
    } catch (e) {
      deps.budget.release(price); // failed calls are not charged
      record.error = msg(e);
    }
    record.latencyMs = Date.now() - started;
    calls.push(record);
    deps.onCall?.(record);
  }

  if (!answers.length) return { intent, status: "unavailable", summary: "no provider answered", sources: calls };
  const worst = answers.reduce((a, b) => (SEVERITY[b.status] > SEVERITY[a.status] ? b : a));
  const disagree = new Set(answers.map((a) => a.status)).size > 1;
  return {
    intent,
    status: disagree && worst.status === "clear" ? "unclear" : worst.status,
    summary: disagree ? `${worst.summary} (providers disagree)` : worst.summary,
    sources: calls,
  };
}

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`timed out after ${ms} ms`)), ms);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
