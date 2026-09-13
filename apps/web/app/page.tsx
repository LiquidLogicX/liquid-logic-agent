const auditUrl =
  process.env.NEXT_PUBLIC_AUDIT_URL ?? "https://audit.liquidlogicx.com";

export default function HomePage() {
  return (
    <main>
      <h1>Liquid Logic Agent</h1>
      <p className="muted">
        An autonomous agent that spends <strong>USDC on Base</strong> to pay
        allowlisted <strong>x402</strong> service endpoints — operating spend only.
      </p>

      <section className="card">
        <h2>What it is</h2>
        <ul>
          <li>CDP-managed wallet pays x402 APIs (Base mainnet)</li>
          <li>Hard caps: allowlist, max per payment, daily USDC limit</li>
          <li>Append-only ledger published for humans to verify on BaseScan</li>
        </ul>
      </section>

      <section className="card">
        <h2>Live ledger</h2>
        <p className="muted">
          Machine summary: <a href="/ledger">/ledger</a> · raw{" "}
          <a href="/ledger/latest.json">latest.json</a>
        </p>
        <iframe
          className="ledger-frame"
          title="Public ledger"
          src="/ledger/embed"
        />
      </section>

      <section className="card">
        <h2>Paid audit</h2>
        <p>
          Audit any agent wallet&apos;s spend summary for{" "}
          <strong>$0.05 USDC</strong> via x402:
        </p>
        <pre>{`GET ${auditUrl}/api/audit?wallet=0x…`}</pre>
        <p className="muted">See <a href="/docs">endpoint docs</a>. No other pricing.</p>
      </section>
    </main>
  );
}
