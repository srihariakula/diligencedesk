import type { DiligenceIntent } from "@/config/intents";
import type { DiligenceInput, FindingStatus, Miner } from "./types";
import type { MinerRequest } from "./telegraph";

/**
 * Adapters translate our input into each miner's request and the miner's answer into a Finding.
 *
 * Miner schemas differ. Run `npm run discover` to save every candidate miner's input/output schema
 * to data/miners.json, then tune `buildRequest` and `interpret` per Intent (or per miner id).
 * The defaults below are deliberately conservative: anything we cannot read becomes "unclear",
 * which the verdict rules turn into REVIEW, never into a false GO.
 */

export function buildRequest(intent: DiligenceIntent, miner: Miner, input: DiligenceInput, jurisdiction?: string): MinerRequest {
  const { method, endpoint } = pickEndpoint(miner);
  const common = {
    query: describeQuery(intent, input, jurisdiction),
    company_name: input.companyName,
    entity_name: input.companyName,
    registration_number: input.registrationNumber,
    jurisdiction,
  };
  const payload: Record<string, unknown> =
    intent === "DOCUMENT_AUTHENTICITY" ? { ...common, document_url: input.documentUrl, url: input.documentUrl } : common;
  return { method, endpoint, payload: dropUndefined(payload) };
}

export function interpret(intent: DiligenceIntent, result: unknown): { status: FindingStatus; summary: string } {
  const r = flatten(result);
  const bool = (...keys: string[]) => keys.map((k) => r[k]).find((v) => typeof v === "boolean") as boolean | undefined;
  const text = JSON.stringify(result ?? "").toLowerCase();

  switch (intent) {
    case "SANCTIONS_SCREENING_MATCH": {
      const hit = bool("match", "is_match", "sanctioned", "hit", "is_sanctioned");
      const count = numberOf(r, "match_count", "matches_count", "hits");
      if (hit === true || (count ?? 0) > 0) return { status: "hit", summary: `possible sanctions/watchlist match${count ? ` (${count})` : ""}` };
      if (hit === false || count === 0) return { status: "clear", summary: "no sanctions or watchlist match" };
      break;
    }
    case "CORPORATE_REGISTRY_LOOKUP": {
      const found = bool("found", "exists", "is_registered", "registered");
      const status = String(r.status ?? r.company_status ?? "").toLowerCase();
      if (found === false || status === "not_found") return { status: "not_found", summary: "company not found in registry" };
      if (/dissolved|struck|inactive|liquidat/.test(status)) return { status: "flagged", summary: `registry status: ${status}` };
      if (found === true || /active|live|registered/.test(status)) return { status: "clear", summary: `registered${status ? ` (${status})` : ""}` };
      break;
    }
    case "REGULATORY_FILING_MONITOR": {
      const adverse = bool("adverse", "enforcement_action", "has_actions", "flagged");
      if (adverse === true) return { status: "flagged", summary: "regulatory action or adverse filing found" };
      if (adverse === false) return { status: "clear", summary: "no adverse filings found" };
      if (/enforcement|penalt|suspend|revok/.test(text)) return { status: "flagged", summary: "possible regulatory action mentioned" };
      break;
    }
    case "DOCUMENT_AUTHENTICITY": {
      const authentic = bool("authentic", "is_authentic", "valid", "verified");
      if (authentic === true) return { status: "clear", summary: "document appears authentic" };
      if (authentic === false) return { status: "flagged", summary: "document may not be authentic" };
      break;
    }
  }
  return { status: "unclear", summary: preview(result) };
}

function describeQuery(intent: DiligenceIntent, input: DiligenceInput, jurisdiction?: string): string {
  const who = `${input.companyName}${input.registrationNumber ? ` (reg. ${input.registrationNumber})` : ""}${jurisdiction ? ` in ${jurisdiction}` : ""}`;
  switch (intent) {
    case "CORPORATE_REGISTRY_LOOKUP":
      return `Is ${who} a registered company? Return status, registration number, incorporation date and officers.`;
    case "SANCTIONS_SCREENING_MATCH":
      return `Screen ${who} against sanctions and watchlists. Return any matches with list name and score.`;
    case "REGULATORY_FILING_MONITOR":
      return `List recent regulatory filings or enforcement actions for ${who}.`;
    case "DOCUMENT_AUTHENTICITY":
      return `Assess whether the document at ${input.documentUrl ?? "(none provided)"} for ${who} is authentic.`;
  }
}

function pickEndpoint(miner: Miner): { method: "GET" | "POST"; endpoint: string } {
  const eps = miner.endpoints as unknown;
  const first = Array.isArray(eps) ? eps[0] : eps && typeof eps === "object" ? Object.values(eps)[0] : undefined;
  if (first && typeof first === "object") {
    const e = first as Record<string, unknown>;
    const endpoint = String(e.path ?? e.endpoint ?? e.route ?? "/");
    const method = String(e.method ?? "POST").toUpperCase() === "GET" ? "GET" : "POST";
    return { method, endpoint };
  }
  if (typeof first === "string") return { method: "POST", endpoint: first };
  return { method: "POST", endpoint: "/" };
}

function flatten(v: unknown, out: Record<string, unknown> = {}, depth = 0): Record<string, unknown> {
  if (v && typeof v === "object" && depth < 3 && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v)) {
      if (!(k.toLowerCase() in out)) out[k.toLowerCase()] = val;
      flatten(val, out, depth + 1);
    }
  }
  return out;
}

function numberOf(r: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "number") return v;
    if (Array.isArray(v)) return v.length;
  }
  const m = r.matches;
  return Array.isArray(m) ? m.length : undefined;
}

const preview = (v: unknown) => JSON.stringify(v ?? null).slice(0, 160);
const dropUndefined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
