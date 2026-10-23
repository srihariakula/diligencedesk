import { describe, expect, it } from "vitest";
import { coverageTier, minerCoverage } from "@/lib/coverage";
import type { Miner } from "@/lib/types";

const m = (name: string, description = ""): Miner => ({ id: name, name, description });
const codes = (miner: Miner) => {
  const c = minerCoverage(miner);
  return c.kind === "national" ? [...c.codes] : c.kind;
};

describe("minerCoverage", () => {
  it("reads national registries and regulators from names", () => {
    expect(codes(m("Bronnoysund Enhetsregisteret"))).toEqual(["NO"]);
    expect(codes(m("Corp Krs Pl"))).toEqual(["PL"]);
    expect(codes(m("SEC EDGAR Has Form"))).toEqual(["US"]);
    expect(codes(m("UK Legislation Feed"))).toEqual(["GB"]);
    expect(codes(m("ACRA BizFile Lookup"))).toEqual(["SG"]);
  });
  it("reads coverage from the description when the name is vague", () => {
    expect(codes(m("Filing Sec Submissions", "Parses 10-K/10-Q disclosures"))).toEqual(["US"]);
    expect(codes(m("FR Recherche Entreprises Status", "French register"))).toEqual(["FR"]);
  });
  it("treats GLEIF / LEI sources as global", () => {
    expect(codes(m("GLEIF LEI Status Active"))).toBe("global");
    expect(codes(m("DataWire Corporate Registry Lookup", "read live from the Global LEI Index"))).toBe("global");
  });
  it("does not mistake ordinary words for country codes", () => {
    expect(codes(m("Clearbit Company Suggest", "tell us about a company"))).toBe("unknown");
  });
});

describe("coverageTier", () => {
  it("ranks a matching country above global above unknown, and rejects other countries", () => {
    expect(coverageTier(m("ACRA BizFile Lookup"), "sg")).toBe(0);
    expect(coverageTier(m("GLEIF LEI Status Active"), "SG")).toBe(1);
    expect(coverageTier(m("Clearbit Company Suggest"), "SG")).toBe(2);
    expect(coverageTier(m("Bronnoysund Enhetsregisteret"), "SG")).toBeNull();
  });
  it("expands EU sources to member states", () => {
    expect(coverageTier(m("OpenSanctions EU Corp"), "DE")).toBe(0);
    expect(coverageTier(m("OpenSanctions EU Corp"), "GB")).toBeNull();
  });
});
