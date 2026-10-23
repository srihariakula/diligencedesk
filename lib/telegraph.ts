import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { networkConfig, type NetworkConfig } from "@/config/network";
import type { TelegraphReceipt } from "./types";

/** The shape the Engine returns for a served request (docs: "Paying with x402", step 5). */
export interface EngineResponse {
  miner_id: string;
  miner_name?: string;
  result: unknown;
  cost_usd: number;
  duration_ms?: number;
  signal_hash?: string;
}

export interface PaidAnswer extends EngineResponse {
  receipt?: TelegraphReceipt;
  httpStatus: number;
}

/** What a miner call looks like through the Engine: POST /engine/v1/ask/{minerId}. */
export interface MinerRequest {
  method: "GET" | "POST";
  endpoint: string;
  payload: Record<string, unknown>;
}

export interface TelegraphClient {
  readonly payer: `0x${string}`;
  readonly network: NetworkConfig;
  ask(minerId: string, request: MinerRequest, signal?: AbortSignal): Promise<PaidAnswer>;
}

export function agentAccount(privateKey = process.env.AGENT_PRIVATE_KEY): PrivateKeyAccount {
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("AGENT_PRIVATE_KEY missing or malformed. Copy .env.example to .env and set a hackathon-only test wallet key.");
  }
  return privateKeyToAccount(privateKey as `0x${string}`);
}

/**
 * Creates a client that pays per call with x402 on the configured chain.
 * `payTo` and the amount are always read from the node's 402 challenge, never hardcoded.
 */
export function createTelegraphClient(account = agentAccount(), network = networkConfig()): TelegraphClient {
  const paidFetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: network.chainId, client: new ExactEvmScheme(account) }],
  });

  return {
    payer: account.address,
    network,
    async ask(minerId, request, signal) {
      const res = await paidFetch(`${network.nodeUrl}/engine/v1/ask/${encodeURIComponent(minerId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`miner ${minerId}: HTTP ${res.status} ${text.slice(0, 200)}`);
      }
      const body = JSON.parse(text) as EngineResponse;
      return { ...body, receipt: parseReceipt(res.headers.get("x-telegraph-receipt")), httpStatus: res.status };
    },
  };
}

/** X-TELEGRAPH-RECEIPT is base64 JSON. Key reconciliation on receipt_hash, not tx_hash (txs are batched). */
export function parseReceipt(header: string | null): TelegraphReceipt | undefined {
  if (!header) return undefined;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as TelegraphReceipt;
  } catch {
    return undefined;
  }
}

/** Free endpoint: re-derive a call from its signal hash (docs: "Verifying a call"). */
export async function lookupSignal(signalHash: string, network = networkConfig()): Promise<unknown> {
  const res = await fetch(`${network.nodeUrl}/engine/v1/signal/${signalHash}`);
  if (!res.ok) throw new Error(`signal lookup HTTP ${res.status}`);
  return res.json();
}
