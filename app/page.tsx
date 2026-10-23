"use client";

import { useState } from "react";
import type { DiligencePack } from "@/lib/types";

const SAMPLES = [
  { companyName: "HSBC Holdings plc", jurisdictions: "GB" },
  { companyName: "DBS Group Holdings Ltd", jurisdictions: "SG" },
  { companyName: "Tencent Holdings Limited", jurisdictions: "HK" },
];
const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_TX_URL ?? "https://sepolia.basescan.org/tx/";

export default function Home() {
  const [companyName, setCompanyName] = useState("");
  const [jurisdictions, setJurisdictions] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [pack, setPack] = useState<DiligencePack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(name = companyName, juris = jurisdictions) {
    setBusy(true);
    setError(null);
    setPack(null);
    try {
      const res = await fetch("/api/diligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: name, jurisdictions: juris.split(","), registrationNumber }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPack(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>DiligenceDesk</h1>
      <p className="sub">Company diligence in minutes. Every check is bought through Telegraph and comes with a receipt you can verify.</p>

      <div className="card">
        <form onSubmit={(e) => { e.preventDefault(); run(); }}>
          <label>Company name<input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. DBS Group Holdings Ltd" required /></label>
          <label>Jurisdictions<input value={jurisdictions} onChange={(e) => setJurisdictions(e.target.value)} placeholder="SG,HK" required /></label>
          <label>Registration no. (optional)<input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} /></label>
          <button type="submit" disabled={busy}>{busy ? "Buying checks…" : "Run diligence"}</button>
        </form>
        <div className="samples">
          {SAMPLES.map((s) => (
            <button key={s.companyName} className="ghost" disabled={busy}
              onClick={() => { setCompanyName(s.companyName); setJurisdictions(s.jurisdictions); run(s.companyName, s.jurisdictions); }}>
              Try {s.companyName}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="card err">{error}</div>}

      {pack && (
        <>
          <div className="card">
            <div className={`verdict ${pack.verdict.verdict}`}>{pack.verdict.verdict}</div>
            <ul>{pack.verdict.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>

          <div className="card">
            <h3>Findings</h3>
            <table>
              <thead><tr><th>Check</th><th>Result</th><th>Provider</th><th>Cost</th><th>Receipt</th></tr></thead>
              <tbody>
                {pack.findings.flatMap((f) =>
                  (f.sources.length ? f.sources : [null]).map((c, i) => (
                    <tr key={`${f.intent}-${i}`}>
                      <td>{i === 0 ? f.intent : ""}</td>
                      <td>{i === 0 ? `${f.status}: ${f.summary}` : ""}</td>
                      <td>{c ? `#${c.minerId}${c.ok ? "" : ` (failed: ${c.error})`}` : "none"}</td>
                      <td>{c ? `$${c.costUsd}` : "-"}</td>
                      <td className="mono">
                        {c?.receipt?.tx_hash ? <a href={EXPLORER + c.receipt.tx_hash} target="_blank" rel="noreferrer">{c.receipt.receipt_hash?.slice(0, 18)}…</a> : c?.signalHash ?? "-"}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Spend</h3>
            <p><b>${pack.spend.totalUsd}</b> of ${pack.spend.capUsd} cap · {pack.spend.paidCalls} paid calls · {pack.spend.failedCalls} failed (not charged) · {pack.spend.network}</p>
            <p className="boundary">{pack.spend.boundary}</p>
            <p className="mono">sha256 {pack.sha256}<br />signed by {pack.signer}<br />{pack.signature}</p>
          </div>
        </>
      )}
    </main>
  );
}
