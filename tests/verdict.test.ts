import { describe, expect, it } from "vitest";
import { decideVerdict } from "@/lib/verdict";
import type { Finding } from "@/lib/types";

const f = (intent: Finding["intent"], status: Finding["status"], summary: string = status): Finding => ({ intent, status, summary, sources: [] });
const allClear = [
  f("CORPORATE_REGISTRY_LOOKUP", "clear"),
  f("SANCTIONS_SCREENING_MATCH", "clear"),
  f("REGULATORY_FILING_MONITOR", "clear"),
];

describe("decideVerdict", () => {
  it("GO when every check is clear", () => {
    expect(decideVerdict(allClear).verdict).toBe("GO");
  });
  it("STOP on any sanctions hit, even if everything else is clear", () => {
    const r = decideVerdict([...allClear.slice(0, 1), f("SANCTIONS_SCREENING_MATCH", "hit", "OFAC SDN match"), allClear[2]]);
    expect(r.verdict).toBe("STOP");
    expect(r.reasons[0]).toContain("OFAC SDN match");
  });
  it("REVIEW when the company is not found", () => {
    expect(decideVerdict([f("CORPORATE_REGISTRY_LOOKUP", "not_found"), ...allClear.slice(1)]).verdict).toBe("REVIEW");
  });
  it("REVIEW, never GO, when a provider is unavailable", () => {
    const r = decideVerdict([...allClear.slice(0, 2), f("REGULATORY_FILING_MONITOR", "unavailable")]);
    expect(r.verdict).toBe("REVIEW");
    expect(r.reasons[0]).toMatch(/no provider answered/);
  });
  it("REVIEW when an answer is unclear", () => {
    expect(decideVerdict([f("SANCTIONS_SCREENING_MATCH", "unclear")]).verdict).toBe("REVIEW");
  });
});
