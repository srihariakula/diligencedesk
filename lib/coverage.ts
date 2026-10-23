import type { DiligenceIntent } from "@/config/intents";
import type { Miner } from "./types";

/**
 * Intents whose answer depends on where the company is registered. Sanctions lists (OFAC, UN, EU)
 * apply to an entity wherever it sits, and document checks have no jurisdiction, so those are not filtered.
 */
export const JURISDICTIONAL_INTENTS: readonly DiligenceIntent[] = ["CORPORATE_REGISTRY_LOOKUP", "REGULATORY_FILING_MONITOR"];

const EU = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];

/** Sources that name a single country's registry or regulator. Acronyms are case-sensitive. */
const NATIONAL_SOURCES: { codes: string[]; pattern: RegExp }[] = [
  { codes: ["US"], pattern: /\b(US|U\.S\.|SEC|EDGAR|10-[KQ])\b|Federal Register|CourtListener/ },
  { codes: ["GB"], pattern: /\b(UK|FCA)\b|Companies House|United Kingdom/ },
  { codes: ["SG"], pattern: /\b(ACRA|MAS)\b|Singapore|BizFile/i },
  { codes: ["HK"], pattern: /\b(ICRIS|HKEX|SFC)\b|Hong Kong/i },
  { codes: ["CN"], pattern: /\bSAMR\b|\bChina\b|Chinese/i },
  { codes: ["IN"], pattern: /\bMCA21?\b|\bIndia\b|Indian/ },
  { codes: ["AU"], pattern: /\b(AU|ASIC)\b|Australia/ },
  { codes: ["NO"], pattern: /br[øo]nn[øo]ysund|brreg|enhetsregister/i },
  { codes: ["FI"], pattern: /\b(PRH|YTJ)\b/i },
  { codes: ["PL"], pattern: /\bKRS\b/i },
  { codes: ["FR"], pattern: /\bFR\b|French|recherche-entreprises|SIRENE|INSEE/ },
  { codes: ["DE"], pattern: /Handelsregister|German/i },
  { codes: EU, pattern: /\bEU\b|Eurostat|European Union/ },
];

/** Sources that cover companies in any jurisdiction. */
const GLOBAL_SOURCE = /GLEIF|\bLEI\b|\bglobal\b|international|worldwide/i;

export type Coverage = { kind: "global" } | { kind: "national"; codes: Set<string> } | { kind: "unknown" };

/** Infers what a miner covers from its name, slug and description. */
export function minerCoverage(m: Miner): Coverage {
  const text = [m.name, m.slug, m.description].filter(Boolean).join(" ");
  if (GLOBAL_SOURCE.test(text)) return { kind: "global" };
  const codes = new Set(NATIONAL_SOURCES.filter((s) => s.pattern.test(text)).flatMap((s) => s.codes));
  return codes.size ? { kind: "national", codes } : { kind: "unknown" };
}

/** 0 = covers the jurisdiction, 1 = global, 2 = unknown, null = only covers other jurisdictions. */
export function coverageTier(m: Miner, jurisdiction: string): 0 | 1 | 2 | null {
  const c = minerCoverage(m);
  if (c.kind === "global") return 1;
  if (c.kind === "unknown") return 2;
  return c.codes.has(jurisdiction.toUpperCase()) ? 0 : null;
}
