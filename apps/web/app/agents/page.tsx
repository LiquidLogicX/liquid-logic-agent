import type { Metadata } from "next";
import { PolicyTermsheet } from "@/components/PolicyTermsheet";
import { AUDIT_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "For AI agents",
  description: "Spending limits for autonomous agents, published and enforced on-chain, plus paid x402 endpoints for agents.",
  openGraph: {
    title: "For AI agents — Liquid Logic X",
    description: "Spending limits for autonomous agents, published and enforced on-chain, plus paid x402 endpoints for agents.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Liquid Logic X" }],
  },
};

export default function AgentsPage() {
  return (
    <>
      <section className="block" id="agents">
        <div className="wrap sec-head">
          <div>
            <h2>For AI agents</h2>
            <p className="intro">
              Spending limits for autonomous agents, published and enforced
              on-chain. Paid tools for agents settle per call over x402.
            </p>
            <div className="actions" style={{ marginTop: 20 }}>
              <a className="btn secondary" href="#endpoints">
                Endpoint docs
              </a>
            </div>
          </div>
          <PolicyTermsheet />
        </div>
      </section>

      <section className="block" id="controls">
        <div className="wrap sec-head">
          <div>
            <h2>Controls</h2>
            <p className="intro">
              What stops the agent from spending more, or somewhere else, than
              it should.
            </p>
          </div>
          <dl className="controls">
            <div>
              <dt>Allowlist</dt>
              <dd>
                The agent can only pay endpoints on the published list. Anything
                else is rejected before a payment is signed.
              </dd>
            </div>
            <div>
              <dt>Per-payment and daily limits</dt>
              <dd>
                Each payment is capped, and total spend resets each UTC day.
              </dd>
            </div>
            <div>
              <dt>Hold for approval</dt>
              <dd>
                Payments above a set threshold wait for an operator to approve
                or deny. Unanswered holds are denied automatically.
                <a
                  className="ev"
                  href="https://github.com/LiquidLogicX/liquid-logic-agent/pull/27"
                >
                  Shipped in PR #27
                </a>
              </dd>
            </div>
            <div>
              <dt>Operator freeze</dt>
              <dd>
                An operator can halt all outgoing payments at once. The freeze
                survives restarts and fails closed.
                <a
                  className="ev"
                  href="https://github.com/LiquidLogicX/liquid-logic-agent/pull/26"
                >
                  Shipped in PR #26
                </a>
              </dd>
            </div>
            <div>
              <dt>Proof of payment</dt>
              <dd>
                A payment is only recorded with a real on-chain transaction
                hash. Failed attempts are logged as failures, never as payments.
                <a
                  className="ev"
                  href="https://github.com/LiquidLogicX/liquid-logic-agent/pull/30"
                >
                  Shipped in PR #30
                </a>
              </dd>
            </div>
            <div>
              <dt>Public ledger</dt>
              <dd>
                Payments, holds, denials and freezes are published as separate,
                append-only record types.
                <a
                  className="ev"
                  href="https://github.com/LiquidLogicX/liquid-logic-agent/pull/25"
                >
                  Shipped in PR #25
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="block" id="endpoints">
        <div className="wrap sec-head">
          <div>
            <h2>Endpoints</h2>
            <p className="intro">
              Paid per call over x402. No account or API key. Settled in USDC on
              Base through the Coinbase CDP facilitator.
            </p>
          </div>
          <div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Endpoint</th>
                    <th>What it returns</th>
                    <th className="num">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono">GET /api/allowance</td>
                    <td>
                      Whether a wallet may pay a given x402 URL, and how much
                      remains under today&apos;s limit. Call it before spending.
                    </td>
                    <td className="num">0.001 USDC</td>
                  </tr>
                  <tr>
                    <td className="mono">GET /api/audit</td>
                    <td>
                      A spend summary for an agent wallet: destinations, totals
                      and BaseScan links.
                    </td>
                    <td className="num">0.03 USDC</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="note">
              Host:{" "}
              <a href={AUDIT_URL} rel="noopener noreferrer" target="_blank">
                {AUDIT_URL.replace(/^https?:\/\//, "")}
              </a>
              {" · "}
              <a href="/docs">Full endpoint docs</a>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
