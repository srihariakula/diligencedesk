import { describe, expect, it } from "vitest";
import { buildRequest, interpret, UnsupportedRequestError } from "@/lib/adapters";
import type { Miner } from "@/lib/types";

const input = { companyName: "HSBC Holdings plc", jurisdictions: ["GB"] };
const withSchema = (properties: Record<string, unknown>, required: string[] = [], intents = 1): Miner => ({
  id: "m",
  supported_intents: Array.from({ length: intents }, (_, i) => `I${i}`),
  endpoints: [{ path: "/query", method: "GET" }],
  input_schema: { type: "object", properties, required },
});

describe("buildRequest with a miner schema", () => {
  it("fills the miner's own name field instead of leaving its pinned default", () => {
    const req = buildRequest("CORPORATE_REGISTRY_LOOKUP", withSchema({ name: { default: "Microsoft" } }, ["name"]), input, "GB");
    expect(req).toEqual({ method: "GET", endpoint: "/query", payload: { name: "HSBC Holdings plc" } });
  });
  it("screens our company, not the example entity", () => {
    const req = buildRequest("SANCTIONS_SCREENING_MATCH", withSchema({ entity: { default: "PUTIN" } }, ["entity"]), input, "GB");
    expect(req.payload).toEqual({ entity: "HSBC Holdings plc" });
  });
  it("leaves settings like format to the miner's defaults", () => {
    const req = buildRequest("REGULATORY_FILING_MONITOR", withSchema({ q: {}, format: { default: "json" }, type: { default: "o" } }, ["q", "format", "type"]), input, "GB");
    expect(req.payload).toEqual({ q: "HSBC Holdings plc" });
  });
  it("refuses a miner that needs an identifier we do not have", () => {
    const sec = withSchema({ cik: { default: "0000320193" }, form: { default: "10-K" } }, ["cik", "form"]);
    expect(() => buildRequest("REGULATORY_FILING_MONITOR", sec, input, "GB")).toThrow(UnsupportedRequestError);
  });
  it("uses a numeric registration number as a zero-padded CIK", () => {
    const sec = withSchema({ cik: {}, form: {} }, ["cik", "form"]);
    expect(buildRequest("REGULATORY_FILING_MONITOR", sec, { ...input, registrationNumber: "320193" }, "US").payload).toEqual({ cik: "0000320193" });
  });
  it("refuses a miner with no field that identifies the company", () => {
    expect(() => buildRequest("CORPORATE_REGISTRY_LOOKUP", withSchema({ format: {}, rejestr: {} }, ["format", "rejestr"]), input, "PL")).toThrow(
      /no field that identifies/,
    );
  });
  it("points document search fields at the document, and extracts a DOI", () => {
    const doc = { ...input, documentUrl: "https://doi.org/10.1038/nature12373" };
    expect(buildRequest("DOCUMENT_AUTHENTICITY", withSchema({ doi: {} }, ["doi"]), doc, "GB").payload).toEqual({ doi: "10.1038/nature12373" });
    expect(buildRequest("DOCUMENT_AUTHENTICITY", withSchema({ q: {} }, ["q"]), doc, "GB").payload).toEqual({ q: doc.documentUrl });
  });
  it("keeps the free-text context for broad multi-intent miners and never refuses them over a missing field", () => {
    const broad = {
      ...withSchema({ company: {}, cik: {}, chain: { default: "eth" } }, ["cik"], 72),
      endpoints: [{ path: "/corporate-registry", method: "GET", description: "CORPORATE_REGISTRY_LOOKUP. Answers..." }],
    };
    const req = buildRequest("CORPORATE_REGISTRY_LOOKUP", broad, input, "GB");
    expect(req.payload).toMatchObject({ company: "HSBC Holdings plc", company_name: "HSBC Holdings plc", jurisdiction: "GB" });
    expect(req.payload).not.toHaveProperty("cik");
  });
  it("falls back to the generic payload when a miner publishes no schema", () => {
    const req = buildRequest("SANCTIONS_SCREENING_MATCH", { id: "x", endpoints: [{ path: "/", method: "POST" }] }, input, "GB");
    expect(req.payload).toMatchObject({ company_name: "HSBC Holdings plc", jurisdiction: "GB" });
  });
});

describe("buildRequest endpoint routing", () => {
  const broad = (endpoints: unknown[]): Miner => ({ id: "b", supported_intents: Array.from({ length: 72 }, (_, i) => `I${i}`), endpoints });
  it("uses a multi-intent miner's endpoint for this Intent, not its first one", () => {
    const m = broad([
      { path: "/check-tx", method: "GET", description: "ONCHAIN_TX_LOOKUP. Answers..." },
      { path: "/regulatory-filing-monitor", method: "GET", description: "REGULATORY_FILING_MONITOR. Answers..." },
    ]);
    expect(buildRequest("REGULATORY_FILING_MONITOR", m, input, "GB")).toMatchObject({ method: "GET", endpoint: "/regulatory-filing-monitor" });
  });
  it("skips a multi-intent miner with no endpoint for this Intent", () => {
    expect(() => buildRequest("SANCTIONS_SCREENING_MATCH", broad([{ path: "/ssl-check", description: "SSL_CERT_CHECK." }]), input, "GB")).toThrow(
      /no endpoint for SANCTIONS_SCREENING_MATCH/,
    );
  });
  it("asks the regulatory question without the words the keyword scan flags", () => {
    const q = String(buildRequest("REGULATORY_FILING_MONITOR", { id: "x" }, input, "GB").payload.query);
    expect(q).not.toMatch(/enforcement|penalt|suspend|revok/i);
  });
});

describe("interpret", () => {
  it("reads 0/1 answers and on_list", () => {
    expect(interpret("SANCTIONS_SCREENING_MATCH", { entity: "HSBC Holdings plc", on_list: 0, sanctioned: 0 }).status).toBe("clear");
    expect(interpret("SANCTIONS_SCREENING_MATCH", { entity: "X", on_list: 1 }).status).toBe("hit");
  });
  it("treats a rejected or low-confidence reply as no answer", () => {
    const echo = { answer: 'I cannot look up "List recent regulatory filings or enforcement actions for HSBC..."', confidence: 0.1, status: "invalid_input" };
    expect(interpret("REGULATORY_FILING_MONITOR", echo)).toMatchObject({ status: "unavailable", summary: expect.stringMatching(/invalid_input/) });
    expect(interpret("CORPORATE_REGISTRY_LOOKUP", { found: true, confidence: 0.2 }).status).toBe("unavailable");
  });
  it("still reads a confident registry answer", () => {
    expect(interpret("CORPORATE_REGISTRY_LOOKUP", { found: true, entity_status: "ACTIVE", confidence: 0.95 }).status).toBe("clear");
  });
});

describe("interpret summaries", () => {
  it("uses the miner's own sentence for an answer it cannot classify, and stays unclear", () => {
    const r = interpret("REGULATORY_FILING_MONITOR", { answer: "The most recent SEC EDGAR filing by HSBC HOLDINGS PLC is a Form 6-K.", form: "6-K", confidence: 0.75 });
    expect(r).toEqual({ status: "unclear", summary: "not a yes/no answer, check manually: The most recent SEC EDGAR filing by HSBC HOLDINGS PLC is a Form 6-K." });
  });
});
