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
| `REGULATORY_FILING_MONITOR` | Any regulatory action or adverse filing? | adverse → REVIEW |
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
- **Spend controls:** each call is reserved against the caps *before* paying. A call that fails before its payment is sent is released; one that fails after is still settled by Telegraph, so it stays booked and shows as charged. The daily cap is checked against today's on-chain spend, so it holds across requests and restarts.
- **Mainnet readiness:** chain ID, USDC address, node URL and explorer live only in `.env` / `config/`.

## Quick start

Requirements: **Node.js 20+** (the x402 libraries need WebCrypto) and a **hackathon-only** wallet holding test USDC on Base Sepolia ([faucet.circle.com](https://faucet.circle.com), network **Base Sepolia**). No ETH is needed: the node's facilitator pays gas.

```bash
git clone https://github.com/srihariakula/diligencedesk.git
cd diligencedesk
npm install
cp .env.example .env        # then set AGENT_PRIVATE_KEY (test wallet only)

npm run discover            # free: list live miners for the 4 Intents → data/miners.json
npm run discover -- GB      # free: preview the ranking a run in that jurisdiction would use
npm run first-call          # ~$0.01: one paid call, prints signal_hash, receipt_hash, tx link
npm run diligence -- "DBS Group Holdings Ltd" SG     # full run, capped by MAX_SPEND_PER_PACK_USD
npm run dev                 # web app on http://localhost:3000
npm test                    # unit tests, no network or payment
```

## Project layout

```
app/                 Next.js UI and POST /api/diligence
config/
  network.ts         chain, node, caps from env
  intents.ts         the 4 Intents bought
  providers.ts       curated block/prefer list of miners, with reasons
lib/
  telegraph.ts       x402 paid client, receipt and payment-refusal parsing, signal lookup
  registry.ts        miner discovery (GET /api/miners?intent=) and ranking
  coverage.ts        which jurisdiction a miner covers, read from its name and description
  adapters.ts        fills each miner's input fields, picks its endpoint for the Intent, reads the answer
  orchestrator.ts    parallel buying, fallback, timeouts, budget
  verdict.ts         deterministic GO / REVIEW / STOP rules
  pack.ts            canonical JSON, SHA-256, wallet signature
scripts/             discover, first-call, run-diligence; env.ts loads .env for them
tests/               vitest suites (adapters, budget, coverage, orchestrator, pack, registry, telegraph, verdict)
docs/PLAN.md         build plan and milestones
```

## Status

As of 23 Oct 2026.

| Area | State |
| --- | --- |
| x402 client, discovery, orchestrator, budget, verdict, signed pack | ✅ built; 56 unit tests |
| Web app and API route | ✅ builds; input validated before any payment |
| Provider selection | ✅ specialists before multi-intent miners; registry and filing checks prefer providers covering the requested jurisdiction; curated block/prefer list in `config/providers.ts` |
| Requests and answers | ✅ fills each provider's own input fields and calls multi-intent providers on their endpoint for the Intent; providers it can't point at the company are skipped before paying |
| Settled Base Sepolia payments | ✅ 14 x402 payments settled, e.g. [`0xf69a0bb9…`](https://sepolia.basescan.org/tx/0xf69a0bb9f718750fe66aeaa7d0897da871d941e12f71e430cc7a62033363c023), [`0x12c72159…`](https://sepolia.basescan.org/tx/0x12c721593de49b4ee95035d1860e0df34bceb8f0232270985572f738e525a098) |
| End-to-end run | ✅ HSBC Holdings plc (GB), $0.06: registry clear (GLEIF, DataWire), sanctions clear (OFAC SDN, UN list), regulatory REVIEW |
| Regulatory check | ⚠️ live providers list filings but none answers "any adverse action?", so this check returns REVIEW; non-US registry and filing coverage is thin |
| Escrow payment path for volume | ⏳ planned |
| Deployed demo URL | ⏳ planned (Vercel) |
| 60 s video, commercial summary | ⏳ not started |

## Security

- Use a **new wallet with a small test balance**. Never commit `.env`.
- `AGENT_PRIVATE_KEY` is read server-side only, never sent to the browser.
- The verdict rules are v0 and **not legal advice**.

## License

MIT
