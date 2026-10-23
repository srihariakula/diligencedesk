import { describe, expect, it } from "vitest";
import { BLOCKED_MINERS, PREFERRED_MINERS } from "@/config/providers";
import { rankMiners } from "@/lib/registry";
import type { Miner } from "@/lib/types";

const intents = (n: number) => Array.from({ length: n }, (_, i) => `INTENT_${i}`);
const miner = (id: string, n: number, served?: number, extra: Partial<Miner> = {}): Miner => ({
  id,
  supported_intents: intents(n),
  total_requests_served: served,
  scored: true,
  min_price_usdc: 10000,
  ...extra,
});

const ids = (ms: Miner[]) => ms.map((m) => m.id);

describe("rankMiners", () => {
  it("puts specialists ahead of busier multi-intent miners", () => {
    const ranked = rankMiners([miner("txlens", 72, 3952), miner("chainsight", 82, 3519), miner("ofac", 1, 22)]);
    expect(ids(ranked)).toEqual(["ofac", "txlens", "chainsight"]);
  });
  it("orders specialists by traffic served, unserved last", () => {
    const ranked = rankMiners([miner("un", 1), miner("ofac", 1, 22), miner("courtlistener", 1, 0)]);
    expect(ids(ranked)).toEqual(["ofac", "un", "courtlistener"]);
  });
  it("still prefers scored miners over unscored specialists", () => {
    const ranked = rankMiners([miner("spec", 1, 50, { scored: false }), miner("generalist", 72, 10)]);
    expect(ids(ranked)).toEqual(["generalist", "spec"]);
  });
  it("breaks traffic ties by narrower scope, then price", () => {
    const ranked = rankMiners([
      miner("broad", 80, 100),
      miner("narrow", 36, 100),
      miner("pricey", 1, 0, { min_price_usdc: 20000 }),
      miner("cheap", 1, 0),
    ]);
    expect(ids(ranked)).toEqual(["cheap", "pricey", "narrow", "broad"]);
  });
  it("drops inactive miners", () => {
    expect(ids(rankMiners([miner("off", 1, 5, { activation_status: "paused" }), miner("on", 1)]))).toEqual(["on"]);
  });
});

describe("rankMiners with a jurisdiction", () => {
  const named = (id: string, name: string, n: number, served?: number) => ({ ...miner(id, n, served), name });
  const pool = [
    named("txlens", "TxLens", 72, 3952),
    named("brreg", "Bronnoysund Enhetsregisteret", 1, 2),
    named("gleif", "GLEIF LEI Status Active", 1),
    named("acra", "ACRA BizFile Lookup", 1),
    named("clearbit", "Clearbit Company Suggest", 1, 1),
  ];

  it("puts covering sources first, then global, then unknown, and drops other countries", () => {
    const ranked = rankMiners(pool, { intent: "CORPORATE_REGISTRY_LOOKUP", jurisdiction: "SG" });
    expect(ids(ranked)).toEqual(["acra", "gleif", "clearbit", "txlens"]);
  });
  it("keeps the foreign registry when the company is in that country", () => {
    const ranked = rankMiners(pool, { intent: "CORPORATE_REGISTRY_LOOKUP", jurisdiction: "NO" });
    expect(ids(ranked)[0]).toBe("brreg");
    expect(ids(ranked)).not.toContain("acra");
  });
  it("ignores jurisdiction for sanctions, where lists apply to any entity", () => {
    const sanctions = [named("ofac", "OFAC SDN XML", 1, 22), named("un", "UN Consolidated Sanctions Screen", 1)];
    const ranked = rankMiners(sanctions, { intent: "SANCTIONS_SCREENING_MATCH", jurisdiction: "SG" });
    expect(ids(ranked)).toEqual(["ofac", "un"]);
  });
  it("never reads coverage from a generalist's description", () => {
    const g = { ...named("g", "LiveCert", 36, 10), description: "Answers about US filings and more" };
    expect(ids(rankMiners([g], { intent: "REGULATORY_FILING_MONITOR", jurisdiction: "SG" }))).toEqual(["g"]);
  });
});

describe("rankMiners with curated overrides", () => {
  it("drops blocked miners even when they would rank first", () => {
    const ranked = rankMiners([{ ...miner("98001", 1, 99), name: "GLEIF LEI Tesla" }, { ...miner("79011", 1), name: "GLEIF LEI Status Active" }]);
    expect(ids(ranked)).toEqual(["79011"]);
  });
  it("puts preferred miners first within a coverage tier, ahead of busier ones", () => {
    const ranked = rankMiners([miner("busy", 1, 500), miner("78022", 1)], { intent: "SANCTIONS_SCREENING_MATCH", jurisdiction: "SG" });
    expect(ids(ranked)).toEqual(["78022", "busy"]);
  });
  it("does not let a preferred miner jump a better coverage tier", () => {
    const ranked = rankMiners(
      [{ ...miner("79011", 1), name: "GLEIF LEI Status Active" }, { ...miner("acra", 1), name: "ACRA BizFile Lookup" }],
      { intent: "CORPORATE_REGISTRY_LOOKUP", jurisdiction: "SG" },
    );
    expect(ids(ranked)).toEqual(["acra", "79011"]);
  });
  it("never lists a miner as both blocked and preferred", () => {
    expect(Object.keys(BLOCKED_MINERS).filter((id) => id in PREFERRED_MINERS)).toEqual([]);
  });
});
