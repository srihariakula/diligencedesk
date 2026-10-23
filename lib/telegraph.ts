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
  const schemes = [{ network: network.chainId, client: new ExactEvmScheme(account) }];

  return {
    payer: account.address,
    network,
    async ask(minerId, request, signal) {
      // Note whether a signed payment left this process: Telegraph settles it even when the call then fails.
      let paymentSent = false;
      const watched: typeof fetch = (input, init) => {
        const headers = input instanceof Request ? input.headers : new Headers(init?.headers);
        if (headers.has("payment-signature") || headers.has("x-payment")) paymentSent = true;
        return fetch(input, init);
      };
      const paidFetch = wrapFetchWithPaymentFromConfig(watched, { schemes });
      try {
        const res = await paidFetch(`${network.nodeUrl}/engine/v1/ask/${encodeURIComponent(minerId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal,
        });
        const text = await res.text();
        if (res.status === 402) {
          // The x402 client already retried with a signed payment; the node says why it refused in the header.
          const reason = paymentRefusal(res.headers.get("payment-required")) ?? "payment was not accepted";
          throw new TelegraphCallError(`miner ${minerId}: payment refused (${reason}). Check that ${account.address} holds test USDC on ${network.chainId}.`, false);
        }
        if (!res.ok) {
          throw new TelegraphCallError(`miner ${minerId}: HTTP ${res.status} ${text.slice(0, 200)}`, paymentSent);
        }
        const body = JSON.parse(text) as EngineResponse;
        return { ...body, receipt: parseReceipt(res.headers.get("x-telegraph-receipt")), httpStatus: res.status };
      } catch (e) {
        if (e instanceof TelegraphCallError) throw e;
        throw new TelegraphCallError(e instanceof Error ? e.message : String(e), paymentSent); // timeouts, network errors
      }
    },
  };
}

/**
 * A failed call. `charged` is true once a signed payment was sent: live runs showed Telegraph settling
 * those even when the miner then timed out or returned HTTP 500, so the spend must be booked, not released.
 */
export class TelegraphCallError extends Error {
  constructor(
    message: string,
    readonly charged: boolean,
  ) {
    super(message);
    this.name = "TelegraphCallError";
  }
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

/** PAYMENT-REQUIRED is base64 JSON; after a refused payment its `error` names the cause, e.g. insufficient balance. */
export function paymentRefusal(header: string | null): string | undefined {
  if (!header) return undefined;
  try {
    const error = (JSON.parse(Buffer.from(header, "base64").toString("utf8")) as { error?: unknown }).error;
    if (typeof error !== "string" || error.toLowerCase() === "payment required") return undefined;
    return error.split(/\s\(|\n/)[0]; // drop the chained contract-call dump that follows the cause

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
