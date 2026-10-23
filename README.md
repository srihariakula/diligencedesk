# DiligenceDesk

**An autonomous KYB diligence agent that buys verifiable checks through the [Telegraph](https://docs.telegraphprotocol.com/) network.**
Built for Telegraph Hackathon Season II, Apps & Agents track, **Legal** mission.

Give it a company name and 1–3 jurisdictions. The agent pays for four kinds of intelligence through Telegraph, combines the answers, and returns a signed diligence pack:

- **Verdict:** `GO` / `REVIEW` / `STOP`, with the finding that caused it
- **Findings:** one per check, with the provider, cost and Telegraph receipt behind it
- **Spend panel:** total spent vs. cap, paid and failed calls, and what is real vs. stand-in
- **Signature:** SHA-256 of the pack, signed by the agent wallet

| Intent bought | Question | Verdict rule |
| --- | --- | --- |
| `CORPORATE_REGISTRY_LOOKUP` | Is the company registered and active? | not found or dissolved → REVIEW |
| `SANCTIONS_SCREENING_MATCH` | Any sanctions or watchlist match? | any match → **STOP** |
| `REGULATORY_FILING_MONITOR` | Any enforcement actions or adverse filings? | adverse → REVIEW |
| `DOCUMENT_AUTHENTICITY` | Is the supplied document genuine? (only if a document URL is given) | flagged → REVIEW |

Any check that no provider answered, or whose answer can't be read, becomes **REVIEW**. Missing data never turns into a false GO.

## How it works

```
Web app / CLI ──► Orchestrator ──► x402 payment client ──► Telegraph node ──► ranked miners per Intent
                   │  parallel per Intent, fallback across providers, timeouts
                   │  budget guard (per-pack and per-day caps)
                   └► verdict rules ──► signed diligence pack (findings + receipts + spend)
```

- **Payment:** x402, USDC on Base Sepolia (`eip155:84532`). The amount and `payTo` always come from the node's 402 challenge, never from code.
- **Redundancy:** asks up to `PROVIDERS_PER_INTENT` providers per Intent. If one errors or times out, it moves to the next. If providers disagree, the more severe answer wins.
- **Spend controls:** each call is reserved against the caps *before* paying. Failed calls are released, because Telegraph doesn't charge for them.
- **Mainnet readiness:** chain ID, USDC address, node URL and explorer live only in `.env` / `config/`.

## Quick start

Requirements: **Node.js 20+** (the x402 libraries need WebCrypto) and a **hackathon-only** wallet holding Base Sepolia ETH and test USDC.

```bash
git clone https://github.com/srihariakula/diligencedesk.git
cd diligencedesk
npm install
cp .env.example .env        # then set AGENT_PRIVATE_KEY (test wallet only)

npm run discover            # free: list live miners for the 4 Intents → data/miners.json
npm run first-call          # ~$0.01: one paid call, prints signal_hash, receipt_hash, tx link
npm run diligence -- "DBS Group Holdings Ltd" SG     # full run, capped by MAX_SPEND_PER_PACK_USD
npm run dev                 # web app on http://localhost:3000
npm test                    # unit tests, no network or payment
```

## Project layout

```
app/                 Next.js UI and POST /api/diligence
config/              network.ts (chain, node, caps from env), intents.ts
lib/
  telegraph.ts       x402 paid client, receipt parsing, signal lookup
  registry.ts        miner discovery (GET /api/miners?intent=) and ranking
  adapters.ts        per-Intent request building and answer interpretation  ← tune after `npm run discover`
  orchestrator.ts    parallel buying, fallback, timeouts, budget
  verdict.ts         deterministic GO / REVIEW / STOP rules
  pack.ts            canonical JSON, SHA-256, wallet signature
scripts/             discover, first-call, run-diligence
tests/               vitest suites (verdict, budget, orchestrator, pack)
docs/PLAN.md         build plan and milestones
```

## Status

| Area | State |
| --- | --- |
| x402 client, discovery, orchestrator, budget, verdict, signed pack | ✅ built, unit-tested |
| Web app and API route | ✅ builds; input validated before any payment |
| Adapters tuned to real miner schemas | ⏳ run `npm run discover`, then adjust `lib/adapters.ts` |
| First settled Base Sepolia tx | ⏳ `npm run first-call` |
| Escrow payment path for volume | ⏳ planned |
| Deployed demo URL | ⏳ planned (Vercel) |

## Security

- Use a **new wallet with a small test balance**. Never commit `.env`.
- `AGENT_PRIVATE_KEY` is read server-side only, never sent to the browser.
- The verdict rules are v0 and **not legal advice**.

## License

MIT
