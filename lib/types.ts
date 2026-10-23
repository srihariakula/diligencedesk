import type { DiligenceIntent } from "@/config/intents";

export interface DiligenceInput {
  companyName: string;
  registrationNumber?: string;
  jurisdictions: string[]; // ISO 3166-1 alpha-2, e.g. ["HK", "SG"]
  documentUrl?: string; // optional document to authenticate
}

/** A Telegraph miner as returned by GET /api/miners (only the fields we use). */
export interface Miner {
  id: string | number;
  slug?: string;
  name?: string;
  supported_intents?: string[];
  endpoints?: unknown;
  input_schema?: unknown;
  output_schema?: unknown;
  min_price_usdc?: number; // 6-decimal units: 10000 = $0.01
  activation_status?: string;
  total_requests_served?: number;
  scored?: boolean;
  scores?: unknown;
}

/** Parsed X-TELEGRAPH-RECEIPT header. */
export interface TelegraphReceipt {
  receipt_hash: string;
  rail?: string;
  payer?: string;
  miner?: string;
  intent?: string;
  amount_uusdc?: string;
  epoch_id?: number;
  settlement?: string;
  chain?: string;
  tx_hash?: string;
  timestamp?: number;
}

/** One paid call, successful or not. Every call is logged. */
export interface CallRecord {
  intent: DiligenceIntent;
  minerId: string;
  minerName?: string;
  ok: boolean;
  costUsd: number;
  latencyMs: number;
  signalHash?: string;
  receipt?: TelegraphReceipt;
  error?: string;
  result?: unknown;
  at: string;
}

export type FindingStatus =
  | "clear" // checked, nothing adverse
  | "hit" // adverse match (e.g. sanctions hit)
  | "not_found" // entity or record not found
  | "flagged" // suspicious / inauthentic / needs a human
  | "unclear" // answer received but could not be interpreted
  | "unavailable"; // no provider answered

export interface Finding {
  intent: DiligenceIntent;
  status: FindingStatus;
  summary: string;
  sources: CallRecord[]; // the paid calls behind this finding
}

export type Verdict = "GO" | "REVIEW" | "STOP";

export interface VerdictResult {
  verdict: Verdict;
  reasons: string[];
}

export interface DiligencePack {
  version: 1;
  createdAt: string;
  input: DiligenceInput;
  verdict: VerdictResult;
  findings: Finding[];
  spend: {
    totalUsd: number;
    capUsd: number;
    paidCalls: number;
    failedCalls: number;
    network: string;
    /** Plain statement of what is real vs stubbed, shown in the spend panel. */
    boundary: string;
  };
  sha256: string;
  signature?: `0x${string}`;
  signer?: `0x${string}`;
}
