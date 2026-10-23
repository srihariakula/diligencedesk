/**
 * Free (no payment): lists live miners for each diligence Intent and saves their schemas
 * to data/miners.json so you can tune lib/adapters.ts.
 *   npm run discover -- [JURISDICTION]   e.g. SG, to preview the ranking a run in that country would use
 */
import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import { DILIGENCE_INTENTS } from "@/config/intents";
import { fetchMiners, floorPriceUsd, rankMiners } from "@/lib/registry";

const jurisdiction = process.argv[2]?.toUpperCase();
if (jurisdiction && !/^[A-Z]{2}$/.test(jurisdiction)) throw new Error(`Jurisdiction must be a two-letter code, got ${process.argv[2]}`);

const out: Record<string, unknown> = {};
for (const intent of DILIGENCE_INTENTS) {
  const miners = await fetchMiners(intent);
  out[intent] = miners; // keep every miner on disk, blocked or not; the ranking only shapes the preview
  const ranked = rankMiners(miners, { intent, jurisdiction });
  const dropped = miners.length - ranked.length;
  console.log(`\n${intent}: ${ranked.length} miners${dropped ? ` (${dropped} dropped)` : ""}${jurisdiction ? `, ranked for ${jurisdiction}` : ""}`);
  for (const m of ranked.slice(0, 5)) {
    console.log(`  #${m.id} ${m.name ?? m.slug ?? ""}  floor $${floorPriceUsd(m)}  served ${m.total_requests_served ?? 0}  scored ${Boolean(m.scored)}`);
  }
}
mkdirSync("data", { recursive: true });
writeFileSync("data/miners.json", JSON.stringify(out, null, 2));
console.log("\nSaved data/miners.json");
