/**
 * Full diligence run from the command line. Spends real test USDC up to MAX_SPEND_PER_PACK_USD.
 *   npm run diligence -- "Company Name" HK,SG
 */
import "./env";
import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { diligence } from "@/lib/diligence";

const [companyName = "HSBC Holdings plc", j = "GB"] = process.argv.slice(2);
mkdirSync("data", { recursive: true });

const pack = await diligence({ companyName, jurisdictions: j.split(",") }, (c) => {
  appendFileSync("data/calls.jsonl", JSON.stringify(c) + "\n");
  console.log(`${c.ok ? "paid" : "fail"}  ${c.intent.padEnd(27)} #${c.minerId}  $${c.costUsd}  ${c.latencyMs}ms ${c.error ?? ""}`);
});

const file = `data/pack-${Date.now()}.json`;
writeFileSync(file, JSON.stringify(pack, null, 2));
console.log(`\nVERDICT ${pack.verdict.verdict}`);
pack.verdict.reasons.forEach((r) => console.log(`  - ${r}`));
console.log(`Spent $${pack.spend.totalUsd} of $${pack.spend.capUsd} cap, ${pack.spend.paidCalls} paid / ${pack.spend.failedCalls} failed (${pack.spend.failedChargedCalls} charged)`);
console.log(`sha256 ${pack.sha256}\nSaved ${file}`);
