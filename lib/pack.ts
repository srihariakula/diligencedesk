import { createHash } from "node:crypto";
import type { PrivateKeyAccount } from "viem/accounts";
import type { DiligenceInput, DiligencePack, Finding, VerdictResult } from "./types";

/**
 * Builds the diligence pack, hashes its canonical JSON and signs the hash with the agent wallet,
 * so anyone can check the pack was not altered after the agent produced it.
 */
export async function buildPack(args: {
  input: DiligenceInput;
  findings: Finding[];
  verdict: VerdictResult;
  capUsd: number;
  network: string;
  boundary: string;
  signer?: PrivateKeyAccount;
}): Promise<DiligencePack> {
  const calls = args.findings.flatMap((f) => f.sources);
  const body = {
    version: 1 as const,
    createdAt: new Date().toISOString(),
    input: args.input,
    verdict: args.verdict,
    findings: args.findings,
    spend: {
      totalUsd: round(calls.filter((c) => c.ok).reduce((s, c) => s + c.costUsd, 0)),
      capUsd: args.capUsd,
      paidCalls: calls.filter((c) => c.ok).length,
      failedCalls: calls.filter((c) => !c.ok).length,
      network: args.network,
      boundary: args.boundary,
    },
  };
  const sha256 = createHash("sha256").update(canonical(body)).digest("hex");
  const signature = args.signer ? await args.signer.signMessage({ message: sha256 }) : undefined;
  return { ...body, sha256, signature, signer: args.signer?.address };
}

/** Stable JSON: object keys sorted, so the same pack always hashes the same. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
