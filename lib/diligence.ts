import { networkConfig, spendConfig } from "@/config/network";
import { BudgetExceededError, BudgetGuard } from "./budget";
import { spentTodayUsd } from "./ledger";
import { buildPack } from "./pack";
import { fetchMiners, rankMiners } from "./registry";
import { runDiligence } from "./orchestrator";
import { agentAccount, createTelegraphClient } from "./telegraph";
import type { CallRecord, DiligenceInput } from "./types";

/** Wires the real network, wallet and spend caps together. Used by the API route and the CLI. */
export async function diligence(input: DiligenceInput, onCall?: (c: CallRecord) => void) {
  const network = networkConfig();
  const spend = spendConfig();
  const account = agentAccount();
  const client = createTelegraphClient(account, network);
  // The daily cap holds across requests and restarts because today's spend is read from chain.
  const spentToday = await spentTodayUsd(account.address, network);
  if (spentToday >= spend.maxPerDayUsd) throw new BudgetExceededError(`daily cap $${spend.maxPerDayUsd} reached ($${spentToday} spent today, UTC)`);
  const budget = new BudgetGuard(spend.maxPerPackUsd, spend.maxPerDayUsd, spentToday);

  const { findings, verdict } = await runDiligence(input, {
    client,
    minersFor: async (intent) =>
      rankMiners(await fetchMiners(intent, network.nodeUrl), { intent, jurisdiction: input.jurisdictions[0] }),
    budget,
    timeoutMs: spend.providerTimeoutMs,
    providersPerIntent: spend.providersPerIntent,
    onCall,
  });

  return buildPack({
    input,
    findings,
    verdict,
    capUsd: spend.maxPerPackUsd,
    network: network.chainId,
    boundary:
      "Real: every Telegraph request, USDC payment and receipt on the test network shown. " +
      "Stand-in: test USDC instead of mainnet USDC; verdict rules are v0 and not legal advice.",
    signer: account,
  });
}
