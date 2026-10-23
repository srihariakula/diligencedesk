import { networkConfig, spendConfig } from "@/config/network";
import { BudgetGuard } from "./budget";
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
  const budget = new BudgetGuard(spend.maxPerPackUsd, spend.maxPerDayUsd);

  const { findings, verdict } = await runDiligence(input, {
    client,
    minersFor: async (intent) => rankMiners(await fetchMiners(intent, network.nodeUrl)),
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
