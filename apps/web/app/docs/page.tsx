const auditUrl =
  process.env.NEXT_PUBLIC_AUDIT_URL ?? "https://audit.liquidlogicx.com";

export default function DocsPage() {
  return (
    <main className="page">
      <h1>Endpoint docs</h1>

      <section className="card">
        <h2>Allowance pre-flight</h2>
        <p>
          <code>
            GET|POST {auditUrl}/api/allowance
          </code>
        </p>
        <ul>
          <li>
            Price: <strong>$0.001 USDC</strong> (cheaper than audit)
          </li>
          <li>
            Network: Base (<code>eip155:8453</code>)
          </li>
          <li>Facilitator: Coinbase CDP</li>
          <li>
            Call <strong>before spending</strong>: can this wallet pay that x402
            URL, and how much USDC remains under the treasurer daily cap?
          </li>
          <li>
            Input: wallet (required), endpoint (optional). Omit endpoint for
            remaining + allowlist summary.
          </li>
          <li>
            Policy source: published treasurer allowlist / max per payment /
            UTC daily cap (same rules as the treasurer CLI). No per-endpoint cap.
          </li>
        </ul>
        <pre>{`# Before paying an endpoint
GET ${auditUrl}/api/allowance?wallet=0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D&endpoint=https://audit.liquidlogicx.com/api/audit

# Wallet-level remaining + allowlist
GET ${auditUrl}/api/allowance?wallet=0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D`}</pre>
      </section>

      <section className="card">
        <h2>Audit my agent wallet</h2>
        <p>
          <code>
            GET|POST {auditUrl}/api/audit
          </code>
        </p>
        <ul>
          <li>
            Price: <strong>$0.05 USDC</strong>
          </li>
          <li>
            Network: Base (<code>eip155:8453</code>)
          </li>
          <li>Facilitator: Coinbase CDP</li>
          <li>Input: wallet address</li>
          <li>Output: structured spend summary (destinations + BaseScan links)</li>
        </ul>
        <pre>{`# Query
GET ${auditUrl}/api/audit?wallet=0xYourAgent

# JSON body
POST ${auditUrl}/api/audit
{ "wallet": "0xYourAgent" }`}</pre>
        <p className="muted">
          Client example: <code>apps/audit/scripts/paid-audit-call.ts</code>
        </p>
      </section>

      <section className="card">
        <h2>Treasurer (internal)</h2>
        <p className="muted">
          Pays allowlisted x402 URLs with USDC. CLI:{" "}
          <code>set-allowance</code>, <code>top-up</code>, <code>revoke</code>,{" "}
          <code>pay</code>, <code>print-wallet-address</code>,{" "}
          <code>sync-ledger</code>.
        </p>
      </section>
    </main>
  );
}
