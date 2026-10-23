import { networkConfig } from "@/config/network";
import type { DiligenceIntent } from "@/config/intents";
import type { Miner } from "./types";

/** Free discovery endpoint: GET /api/miners?intent=... */
export async function fetchMiners(intent: DiligenceIntent, nodeUrl = networkConfig().nodeUrl): Promise<Miner[]> {
  const res = await fetch(`${nodeUrl}/api/miners?intent=${encodeURIComponent(intent)}`);
  if (!res.ok) throw new Error(`GET /api/miners?intent=${intent} -> HTTP ${res.status}`);
  const body = (await res.json()) as unknown;
  const list = Array.isArray(body) ? body : ((body as { miners?: Miner[] }).miners ?? []);
  return (list as Miner[]).filter((m) => (m.supported_intents ?? []).includes(intent));
}

/**
 * Order providers best-first. Telegraph's own routing uses leaderboard scores; until we read those,
 * prefer active, scored miners that have actually served traffic, then the cheapest.
 */
export function rankMiners(miners: Miner[]): Miner[] {
  return [...miners]
    .filter((m) => !m.activation_status || m.activation_status.toLowerCase() === "active")
    .sort(
      (a, b) =>
        Number(Boolean(b.scored)) - Number(Boolean(a.scored)) ||
        (b.total_requests_served ?? 0) - (a.total_requests_served ?? 0) ||
        (a.min_price_usdc ?? Infinity) - (b.min_price_usdc ?? Infinity),
    );
}

/** min_price_usdc is in 6-decimal units: 10000 = $0.01. The live price may be higher (demand multiplier). */
export const floorPriceUsd = (m: Miner) => (m.min_price_usdc ?? 10000) / 1e6;
