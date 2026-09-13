import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LedgerLatest } from "@/lib/ledger";
import { paymentBasescan } from "@/lib/ledger";

async function loadLatest(): Promise<LedgerLatest | null> {
  try {
    const file = path.join(process.cwd(), "public/ledger/latest.json");
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as LedgerLatest;
  } catch {
    return null;
  }
}

export default async function LedgerPage() {
  const latest = await loadLatest();

  return (
    <main className="page">
      <h1>Public ledger</h1>
      <p className="muted">
        Operating spend in USDC on Base. Every payment links to BaseScan when a
        transaction hash exists.
      </p>

      <section className="card">
        <h2>Summary</h2>
        {latest ? (
          <ul>
            <li>Generated: {latest.generatedAt ?? "—"}</li>
            <li>Payments: {latest.totalPayments ?? 0}</li>
            <li>Approx USDC paid: {latest.totalPaidUsdcApprox ?? 0}</li>
            {latest.walletAddress ? (
              <li>
                Wallet:{" "}
                <a
                  href={`https://basescan.org/address/${latest.walletAddress}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {latest.walletAddress}
                </a>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="muted">No published summary yet.</p>
        )}
        <p>
          <Link href="/ledger/latest.json">latest.json</Link> ·{" "}
          <a href="/ledger/index.html">Daily HTML</a>
        </p>
      </section>

      <section className="card">
        <h2>Recent payments</h2>
        <ul>
          {(latest?.recentPayments ?? []).map((p, i) => {
            const href = paymentBasescan(p);
            return (
              <li key={i}>
                {p.amountUsdc} USDC → {p.endpoint}{" "}
                {href ? (
                  <a href={href} rel="noopener noreferrer" target="_blank">
                    BaseScan
                  </a>
                ) : null}
              </li>
            );
          })}
          {!latest?.recentPayments?.length ? (
            <li className="muted">None yet.</li>
          ) : null}
        </ul>
      </section>

      <iframe
        className="ledger-frame"
        title="Ledger HTML"
        src="/ledger/index.html"
      />
    </main>
  );
}
