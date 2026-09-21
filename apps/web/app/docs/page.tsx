import type { Metadata } from "next";
import { AUDIT_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Endpoint docs",
  description:
    "x402 allowance and audit endpoints — fees in USDC on Base via Coinbase CDP.",
  openGraph: {
    title: "Endpoint docs — Liquid Logic X",
    description:
      "x402 allowance and audit endpoints — fees in USDC on Base via Coinbase CDP.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Liquid Logic X" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Endpoint docs — Liquid Logic X",
    description:
      "x402 allowance and audit endpoints — fees in USDC on Base via Coinbase CDP.",
    images: ["/og.png"],
  },
};

export default function DocsPage() {
  return (
    <main className="page">
      <h1>Endpoint docs</h1>
      <p className="page-lede">
        Paid per call over x402. No account or API key. Settled in USDC on Base
        through the Coinbase CDP facilitator.
      </p>

      <section className="docs-card">
        <h2>Allowance pre-flight</h2>
        <p>
          <code>
            GET|POST {AUDIT_URL}/api/allowance
          </code>
        </p>
        <ul>
          <li>
            Fee: <strong>0.001 USDC</strong>
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
            Policy source: published treasurer allowlist / max per payment / UTC
            daily cap (same rules as the treasurer CLI). No per-endpoint cap.
          </li>
        </ul>
        <pre>{`# Before paying an endpoint
GET ${AUDIT_URL}/api/allowance?wallet=0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D&endpoint=https://audit.liquidlogicx.com/api/audit

# Wallet-level remaining + allowlist
GET ${AUDIT_URL}/api/allowance?wallet=0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D`}</pre>
      </section>

      <section className="docs-card">
        <h2>Audit my agent wallet</h2>
        <p>
          <code>
            GET|POST {AUDIT_URL}/api/audit
          </code>
        </p>
        <ul>
          <li>
            Fee: <strong>0.05 USDC</strong>
          </li>
          <li>
            Network: Base (<code>eip155:8453</code>)
          </li>
          <li>Facilitator: Coinbase CDP</li>
          <li>Input: wallet address</li>
          <li>Output: structured spend summary (destinations + BaseScan links)</li>
        </ul>
        <pre>{`# Query
GET ${AUDIT_URL}/api/audit?wallet=0xYourAgent

# JSON body
POST ${AUDIT_URL}/api/audit
{ "wallet": "0xYourAgent" }`}</pre>
        <p className="note">
          Client example: <code>apps/audit/scripts/paid-audit-call.ts</code>
        </p>
      </section>

      <section className="docs-card">
        <h2>Treasurer (internal)</h2>
        <p className="note">
          Pays allowlisted x402 URLs with USDC. CLI:{" "}
          <code>set-allowance</code>, <code>top-up</code>, <code>revoke</code>,{" "}
          <code>pay</code>, <code>print-wallet-address</code>,{" "}
          <code>sync-ledger</code>.
        </p>
      </section>
    </main>
  );
}
