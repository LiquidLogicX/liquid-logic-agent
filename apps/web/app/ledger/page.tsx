import Link from "next/link";

async function loadLatest(): Promise<{
  generatedAt?: string;
  totalPayments?: number;
  totalPaidUsdcApprox?: number;
  recentPayments?: Array<{
    endpoint: string;
    amountUsdc: string;
    basescanUrl?: string;
    txHash?: string;
    timestamp: string;
  }>;
} | null> {
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    // Prefer static file served from public/ copied at build, or monorepo public via rewrite
    const res = await fetch(`${base}/ledger/latest.json`, {
      next: { revalidate: 60 },
    }).catch(() => null);
    if (res?.ok) return res.json();
  } catch {
    /* fall through */
  }
  return null;
}

export default async function LedgerPage() {
  const latest = await loadLatest();

  return (
    <main>
      <h1>Public ledger</h1>
      <p className="muted">
        Operating spend in USDC on Base. Every payment links to BaseScan when a tx
        hash exists.
      </p>

      <section className="card">
        <h2>Summary</h2>
        {latest ? (
          <ul>
            <li>Generated: {latest.generatedAt ?? "—"}</li>
            <li>Payments: {latest.totalPayments ?? 0}</li>
            <li>Approx USDC paid: {latest.totalPaidUsdcApprox ?? 0}</li>
          </ul>
        ) : (
          <p className="muted">
            No published summary yet. Run the ledger publisher after treasurer
            activity.
          </p>
        )}
        <p>
          <Link href="/ledger/latest.json">latest.json</Link> ·{" "}
          <a href="/ledger/index.html">Daily HTML</a>
        </p>
      </section>

      <section className="card">
        <h2>Recent payments</h2>
        <ul>
          {(latest?.recentPayments ?? []).map((p, i) => (
            <li key={i}>
              {p.amountUsdc} USDC → {p.endpoint}{" "}
              {p.basescanUrl || p.txHash ? (
                <a
                  href={
                    p.basescanUrl ??
                    `https://basescan.org/tx/${p.txHash}`
                  }
                  rel="noopener noreferrer"
                >
                  BaseScan
                </a>
              ) : null}
            </li>
          ))}
          {!latest?.recentPayments?.length ? (
            <li className="muted">None yet.</li>
          ) : null}
        </ul>
      </section>

      <iframe className="ledger-frame" title="Ledger HTML" src="/ledger/index.html" />
    </main>
  );
}
