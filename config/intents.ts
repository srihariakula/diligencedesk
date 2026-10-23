/** The four Telegraph Intents DiligenceDesk buys for every company check. */
export const DILIGENCE_INTENTS = [
  "CORPORATE_REGISTRY_LOOKUP",
  "SANCTIONS_SCREENING_MATCH",
  "REGULATORY_FILING_MONITOR",
  "DOCUMENT_AUTHENTICITY",
] as const;

export type DiligenceIntent = (typeof DILIGENCE_INTENTS)[number];

/** Human label shown in the pack. */
export const INTENT_LABELS: Record<DiligenceIntent, string> = {
  CORPORATE_REGISTRY_LOOKUP: "Company registry",
  SANCTIONS_SCREENING_MATCH: "Sanctions screening",
  REGULATORY_FILING_MONITOR: "Regulatory filings",
  DOCUMENT_AUTHENTICITY: "Document authenticity",
};
