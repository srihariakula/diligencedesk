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

/** The miner cannot be asked about this company (e.g. it needs a CIK we do not have). Thrown before paying. */
export class UnsupportedRequestError extends Error {}

export function buildRequest(intent: DiligenceIntent, miner: Miner, input: DiligenceInput, jurisdiction?: string): MinerRequest {
  const { method, endpoint } = pickEndpoint(miner, intent);
  const common = {
    query: describeQuery(intent, input, jurisdiction),
    company_name: input.companyName,
    entity_name: input.companyName,
    registration_number: input.registrationNumber,
    jurisdiction,
  };
  const legacy: Record<string, unknown> =
    intent === "DOCUMENT_AUTHENTICITY" ? { ...common, document_url: input.documentUrl, url: input.documentUrl } : common;

  const schema = schemaOf(miner);
  if (!schema) return { method, endpoint, payload: dropUndefined(legacy) };

  // Fill the miner's own fields. Unfilled fields fall back to the miner's defaults, which for identity
  // fields are pinned examples (entity="PUTIN", cik=Apple's): sending those would answer about someone else.
  const broad = (miner.supported_intents?.length ?? 0) > 3; // multi-intent schemas list every intent's fields
  const payload: Record<string, unknown> = {};
  let identityFilled = false;
  for (const field of Object.keys(schema.properties)) {
    const role = fieldRole(field);
    if (!role) continue; // a setting such as format or rows: leave it to the miner's default
    const value = fillField(role, intent, input, jurisdiction);
    const identity = role !== "question" && role !== "country";
    if (value !== undefined) {
      payload[field] = value;
      identityFilled ||= identity;
    } else if (identity && !broad && schema.required.includes(field)) {
      throw new UnsupportedRequestError(`needs ${field}, which this request cannot supply`);
    }
  }
  if (broad) return { method, endpoint, payload: dropUndefined({ ...legacy, ...payload }) }; // they also read free text
  if (!identityFilled) throw new UnsupportedRequestError("has no field that identifies the company or document");
  return { method, endpoint, payload: dropUndefined(payload) };
}

type FieldRole = "company" | "question" | "country" | "registration" | "cik" | "lei" | "ticker" | "url" | "doi" | "archive_item";

/** Field names (lowercased, punctuation stripped) by meaning. Anything else is a setting left to its default. */
const FIELD_ROLES: [RegExp, FieldRole][] = [
  [/^(question|claim|prompt|ask)$/, "question"],
  [/^(country|countrycode|jurisdiction|nation)$/, "country"],
  [/^(registrationnumber|companynumber|regno|registrationno|businessid|crn|ytunnus|orgnr|organisationnumber)$/, "registration"],
  [/^cik$/, "cik"],
  [/^lei$/, "lei"],
  [/^(ticker|symbol)$/, "ticker"],
  [/^(url|documenturl|document|link|text|content)$/, "url"],
  [/^doi$/, "doi"],
  [/^item$/, "archive_item"],
  [/^(name|legalname|company|companyname|entity|entityname|organisation|organization|q|query|search|term|conditionsterm)$/, "company"],
];

function fieldRole(field: string): FieldRole | undefined {
  const key = field.toLowerCase().replace(/[^a-z]/g, "");
  return FIELD_ROLES.find(([re]) => re.test(key))?.[1];
}

function fillField(role: FieldRole, intent: DiligenceIntent, input: DiligenceInput, jurisdiction?: string): unknown {
  const doc = input.documentUrl;
  switch (role) {
    case "company":
      // On a document check, search fields look for the document, not the company.
      return intent === "DOCUMENT_AUTHENTICITY" ? doc : input.companyName;
    case "question":
      return describeQuery(intent, input, jurisdiction);
    case "country":
      return jurisdiction;
    case "registration":
      return input.registrationNumber;
    case "cik":
      return input.registrationNumber && /^\d{1,10}$/.test(input.registrationNumber) ? input.registrationNumber.padStart(10, "0") : undefined;
    case "lei":
      return input.registrationNumber && /^[A-Z0-9]{18}\d{2}$/.test(input.registrationNumber) ? input.registrationNumber : undefined;
    case "ticker":
      return undefined; // we never know it; a ticker default would pin another company
    case "url":
      return intent === "DOCUMENT_AUTHENTICITY" ? doc : undefined;
    case "doi":
      return doc?.match(/10\.\d{4,9}\/[^\s?#]+/)?.[0];
    case "archive_item":
      return doc?.match(/archive\.org\/details\/([^/?#]+)/)?.[1];
  }
}

function schemaOf(miner: Miner): { properties: Record<string, unknown>; required: string[] } | undefined {
  const s = miner.input_schema as { properties?: Record<string, unknown>; required?: unknown } | undefined;
  if (!s?.properties || !Object.keys(s.properties).length) return undefined;
  return { properties: s.properties, required: Array.isArray(s.required) ? s.required.map(String) : [] };
}

export function interpret(intent: DiligenceIntent, result: unknown): { status: FindingStatus; summary: string } {
  const r = flatten(result);
  // Miners answer yes/no as booleans or as 1/0.
  const bool = (...keys: string[]) =>
    keys.map((k) => r[k]).map((v) => (v === 1 || v === 0 ? v === 1 : v)).find((v) => typeof v === "boolean") as boolean | undefined;
  const nonAnswer = notAnAnswer(r);
  if (nonAnswer) return { status: "unavailable", summary: `provider could not answer (${nonAnswer})` };
  const text = JSON.stringify(result ?? "").toLowerCase();

  switch (intent) {
    case "SANCTIONS_SCREENING_MATCH": {
      const hit = bool("match", "is_match", "sanctioned", "hit", "is_sanctioned", "on_list");
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
  return { status: "unclear", summary: `not a yes/no answer, check manually: ${preview(result)}` };
}

function describeQuery(intent: DiligenceIntent, input: DiligenceInput, jurisdiction?: string): string {
  const who = `${input.companyName}${input.registrationNumber ? ` (reg. ${input.registrationNumber})` : ""}${jurisdiction ? ` in ${jurisdiction}` : ""}`;
  switch (intent) {
    case "CORPORATE_REGISTRY_LOOKUP":
      return `Is ${who} a registered company? Return status, registration number, incorporation date and officers.`;
    case "SANCTIONS_SCREENING_MATCH":
      return `Screen ${who} against sanctions and watchlists. Return any matches with list name and score.`;
    case "REGULATORY_FILING_MONITOR":
      return `List recent regulatory filings for ${who}, and any action regulators have taken against it.`;
    case "DOCUMENT_AUTHENTICITY":
      return `Assess whether the document at ${input.documentUrl ?? "(none provided)"} for ${who} is authentic.`;
  }
}

function pickEndpoint(miner: Miner, intent: DiligenceIntent): { method: "GET" | "POST"; endpoint: string } {
  const eps = miner.endpoints as unknown;
  const list: unknown[] = Array.isArray(eps) ? eps : eps && typeof eps === "object" ? Object.values(eps) : [];
  // Multi-intent miners expose one endpoint per Intent; their first endpoint answers something else entirely.
  const forIntent = list.find((e) => e && typeof e === "object" && String((e as Record<string, unknown>).description ?? "").includes(intent));
  if (!forIntent && (miner.supported_intents?.length ?? 0) > 3) throw new UnsupportedRequestError(`has no endpoint for ${intent}`);
  const first = forIntent ?? list[0];
  if (first && typeof first === "object") {
    const e = first as Record<string, unknown>;
    const endpoint = String(e.path ?? e.endpoint ?? e.route ?? "/");
    const method = String(e.method ?? "POST").toUpperCase() === "GET" ? "GET" : "POST";
    return { method, endpoint };
  }
  if (typeof first === "string") return { method: "POST", endpoint: first };
  return { method: "POST", endpoint: "/" };
}

/** A reply that is about something else: the miner rejected the input or says it is guessing. */
function notAnAnswer(r: Record<string, unknown>): string | undefined {
  const status = String(r.status ?? "").toLowerCase();
  if (/^(invalid_input|invalid|error|unsupported|bad_request|not_supported)$/.test(status)) return status;
  if (typeof r.confidence === "number" && r.confidence < 0.3) return `confidence ${r.confidence}`;
  return undefined;
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

/** The miner's own sentence when it gives one (answer/signal/summary), else the raw JSON; truncated. */
function preview(v: unknown): string {
  const r = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const sentence = [r.answer, r.signal, r.summary].find((x) => typeof x === "string" && x.trim());
  const text = typeof sentence === "string" ? sentence.trim() : JSON.stringify(v ?? null);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}
const dropUndefined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
