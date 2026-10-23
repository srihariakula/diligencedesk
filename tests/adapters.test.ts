import { describe, expect, it } from "vitest";
import { buildRequest, UnsupportedRequestError } from "@/lib/adapters";
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
  it("keeps the free-text context for broad multi-intent miners and never refuses them", () => {
    const broad = withSchema({ company: {}, cik: {}, chain: { default: "eth" } }, ["cik"], 72);
    const req = buildRequest("CORPORATE_REGISTRY_LOOKUP", broad, input, "GB");
    expect(req.payload).toMatchObject({ company: "HSBC Holdings plc", company_name: "HSBC Holdings plc", jurisdiction: "GB" });
    expect(req.payload).not.toHaveProperty("cik");
  });
  it("falls back to the generic payload when a miner publishes no schema", () => {
    const req = buildRequest("SANCTIONS_SCREENING_MATCH", { id: "x", endpoints: [{ path: "/", method: "POST" }] }, input, "GB");
    expect(req.payload).toMatchObject({ company_name: "HSBC Holdings plc", jurisdiction: "GB" });
  });
});
