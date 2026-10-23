import { networkConfig } from "@/config/network";
import { isBlocked, isPreferred } from "@/config/providers";
import type { DiligenceIntent } from "@/config/intents";
import { coverageTier, JURISDICTIONAL_INTENTS } from "./coverage";
import type { Miner } from "./types";

/** Free discovery endpoint: GET /api/miners?intent=... */
export async function fetchMiners(intent: DiligenceIntent, nodeUrl = networkConfig().nodeUrl): Promise<Miner[]> {
  const res = await fetch(`${nodeUrl}/api/miners?intent=${encodeURIComponent(intent)}`);
  if (!res.ok) throw new Error(`GET /api/miners?intent=${intent} -> HTTP ${res.status}`);
  const body = (await res.json()) as unknown;
  const list = Array.isArray(body) ? body : ((body as { miners?: Miner[] }).miners ?? []);
  return (list as Miner[]).filter((m) => (m.supported_intents ?? []).includes(intent));
}

/** A miner serving this few intents is treated as a dedicated source (e.g. OFAC SDN, SEC EDGAR). */
export const SPECIALIST_MAX_INTENTS = 3;

const intentCount = (m: Miner) => m.supported_intents?.length ?? Number.MAX_SAFE_INTEGER;
export const isSpecialist = (m: Miner) => intentCount(m) <= SPECIALIST_MAX_INTENTS;

export interface RankContext {
  intent: DiligenceIntent;
  jurisdiction?: string; // the ISO code the request is built for
}

/**
 * Order providers best-first. Telegraph's own routing uses leaderboard scores; until we read those,
 * prefer active, scored specialists over broad multi-intent miners (which win on raw traffic but answer
 * diligence questions generically), then miners that have actually served traffic, then the narrowest,
 * then the cheapest. Generalists stay in the list as fallbacks.
 *
 * For registry and filing Intents with a known jurisdiction, specialists that cover it come first, then
 * global sources (GLEIF/LEI), then the rest. Specialists that only cover other countries are dropped:
 * their "not found" would outrank a correct answer, since the orchestrator keeps the worse of two answers.
 *
 * Hand-curated overrides in config/providers.ts drop miners that cannot answer the question and put
 * known-good sources first within their coverage tier.
 */
export function rankMiners(miners: Miner[], ctx?: RankContext): Miner[] {
  const jurisdiction = ctx?.jurisdiction && JURISDICTIONAL_INTENTS.includes(ctx.intent) ? ctx.jurisdiction : undefined;
  // Generalists' long descriptions mention many countries, so coverage is only read from specialists.
  const tier = (m: Miner) => (jurisdiction && isSpecialist(m) ? coverageTier(m, jurisdiction) : 2);
  return [...miners]
    .filter((m) => !m.activation_status || m.activation_status.toLowerCase() === "active")
    .filter((m) => !isBlocked(m.id) && tier(m) !== null)
    .sort(
      (a, b) =>
        Number(Boolean(b.scored)) - Number(Boolean(a.scored)) ||
        tier(a)! - tier(b)! ||
        Number(isPreferred(b.id)) - Number(isPreferred(a.id)) ||
        Number(isSpecialist(b)) - Number(isSpecialist(a)) ||
        (b.total_requests_served ?? 0) - (a.total_requests_served ?? 0) ||
        intentCount(a) - intentCount(b) ||
        (a.min_price_usdc ?? Infinity) - (b.min_price_usdc ?? Infinity),
    );
}

/** min_price_usdc is in 6-decimal units: 10000 = $0.01. The live price may be higher (demand multiplier). */
export const floorPriceUsd = (m: Miner) => (m.min_price_usdc ?? 10000) / 1e6;
