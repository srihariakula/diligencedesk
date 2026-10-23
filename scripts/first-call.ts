/**
 * Makes ONE real paid call (about $0.01 test USDC) and prints the proof you need for the submission.
 *   npm run first-call -- [INTENT]
 */
import "./env";
import { DILIGENCE_INTENTS, type DiligenceIntent } from "@/config/intents";
import { networkConfig } from "@/config/network";
import { buildRequest } from "@/lib/adapters";
import { fetchMiners, rankMiners } from "@/lib/registry";
import { createTelegraphClient } from "@/lib/telegraph";

const intent = (process.argv[2] ?? "CORPORATE_REGISTRY_LOOKUP") as DiligenceIntent;
if (!DILIGENCE_INTENTS.includes(intent)) throw new Error(`Unknown intent ${intent}`);

const network = networkConfig();
const [miner] = rankMiners(await fetchMiners(intent), { intent, jurisdiction: "GB" });
if (!miner) throw new Error(`No live miner for ${intent}`);

const client = createTelegraphClient();
console.log(`Payer ${client.payer} -> miner #${miner.id} (${miner.name ?? miner.slug}) for ${intent}`);
const answer = await client.ask(String(miner.id), buildRequest(intent, miner, { companyName: "HSBC Holdings plc", jurisdictions: ["GB"] }, "GB"));

console.log(JSON.stringify(answer.result, null, 2).slice(0, 1500));
console.log("\n--- proof ---");
console.log("cost_usd     ", answer.cost_usd);
console.log("signal_hash  ", answer.signal_hash);
console.log("receipt_hash ", answer.receipt?.receipt_hash);
console.log("tx           ", answer.receipt?.tx_hash ? network.explorerTxUrl + answer.receipt.tx_hash : "(not in receipt)");
