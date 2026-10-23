/**
 * Free (no payment): lists live miners for each diligence Intent and saves their schemas
 * to data/miners.json so you can tune lib/adapters.ts.
 *   npm run discover
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { DILIGENCE_INTENTS } from "@/config/intents";
import { fetchMiners, floorPriceUsd, rankMiners } from "@/lib/registry";

const out: Record<string, unknown> = {};
for (const intent of DILIGENCE_INTENTS) {
  const ranked = rankMiners(await fetchMiners(intent));
  out[intent] = ranked;
  console.log(`\n${intent}: ${ranked.length} miners`);
  for (const m of ranked.slice(0, 5)) {
    console.log(`  #${m.id} ${m.name ?? m.slug ?? ""}  floor $${floorPriceUsd(m)}  served ${m.total_requests_served ?? 0}  scored ${Boolean(m.scored)}`);
  }
}
mkdirSync("data", { recursive: true });
writeFileSync("data/miners.json", JSON.stringify(out, null, 2));
console.log("\nSaved data/miners.json");
