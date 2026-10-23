/**
 * Hand-curated provider overrides, keyed by Telegraph miner id (names can change, ids do not).
 * Reviewed against the live testnet roster on 2026-10-23 from names and descriptions; re-check with
 * `npm run discover -- <JURISDICTION>` when the roster changes.
 */

/** Miners that never answer the diligence question they are registered for. Removed from every ranking. */
export const BLOCKED_MINERS: Record<string, string> = {
  // Hard-wired to one company or paper, so they answer the same thing whatever we ask
  "98001": "GLEIF LEI Tesla: pinned to Tesla",
  "98002": "GLEIF LEI Apple: pinned to Apple",
  "98008": "GLEIF Microsoft LEI: pinned to Microsoft",
  "90010": "DOI Handle Nature: pinned to one Nature paper",

  // Macro statistics, not company filings
  "84010": "BIS Policy Rates CSV: central bank rates",
  "84007": "IMF Indicators Catalog: macro indicators",
  "84006": "World Bank Indicator: country indicators",
  "84008": "Eurostat GDP Dataset: GDP series",

  // General feeds that cannot be queried for one company
  "84001": "Federal Register Newest: latest-documents feed",
  "84003": "Federal Register Agencies: agency list",
  "84004": "Federal Register Public Inspection: public inspection feed",
  "84009": "UK Legislation Feed: new legislation, not company filings",

  // Dataset metadata, not screening
  "78005": "OpenSanctions Dataset Index: dataset metadata",
  "78006": "OpenSanctions Dataset Stats: dataset statistics",
  "78009": "OpenSanctions Issue Levels: dataset metadata",
  "78008": "EveryPolitician Countries: country index",
  "90007": "OTS Calendar Bob: timestamp server status",
  "90008": "OTS Calendar Finney: timestamp server status",

  // Registered under the wrong Intent: their answer would be misread
  "98003": "OpenSanctions Corp Index: sanctions index, not a registry",
  "98004": "OpenSanctions EU Corp: sanctions index, not a registry",
  "98005": "OpenSanctions OFAC Corp: sanctions index, not a registry",
  "98006": "CourtListener Corp Search: court cases, not a registry",
  "98007": "Federal Register Corp: filings context, not a registry",
  "98009": "Clearbit Company Suggest: name autocomplete, not a registry",
  "98010": "Brandfetch Corp Search: brand data, not a registry",
  "78010": "CourtListener Entity Search: any court case would read as a sanctions hit",

  // Fail on every call (seen in live runs on 2026-10-23)
  "78003": "OFAC SDN XML: returns the whole list, upstream rejects it (>20 MB); timed out or HTTP 500",
};

/** Miners known to be real sources for their Intent. Ranked ahead of others within the same coverage tier. */
export const PREFERRED_MINERS: Record<string, string> = {
  "78021": "OFAC SDN Entity Screen",
  "78022": "UN Consolidated Sanctions Screen",
  "80011": "SEC EDGAR Has Form",
  "190160": "Filing Sec Submissions",
  "79011": "GLEIF LEI Status Active",
  "7393": "DataWire Corporate Registry Lookup (Global LEI Index)",
  "79012": "FR Recherche Entreprises Status",
  "170114": "Bronnoysund Enhetsregisteret",
  "190104": "Corp Brreg No",
  "190105": "Corp Krs Pl",
  "190106": "Corp Prh Fi",
  "7434": "FactWire Document Authenticity",
};

export const isBlocked = (id: string | number) => String(id) in BLOCKED_MINERS;
export const isPreferred = (id: string | number) => String(id) in PREFERRED_MINERS;
