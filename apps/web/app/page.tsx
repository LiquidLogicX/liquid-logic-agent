import { ChangelogList } from "@/components/ChangelogList";
import { LedgerLive } from "@/components/LedgerLive";
import { LlxSection } from "@/components/LlxSection";
import { PolicyTermsheet } from "@/components/PolicyTermsheet";
import { ResearchGrid } from "@/components/ResearchGrid";
import { AUDIT_URL } from "@/lib/site";
import { loadLedgerLatestFromPublic } from "@/lib/loadLedgerLatest";

/** Keep home ledger KPIs live with public/ledger/latest.json. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const initialLatest = await loadLedgerLatestFromPublic();

  return (
    <>
      <div className="hero">
        <div className="wrap">
          <div>
            <h1>Spending controls for autonomous agents.</h1>
            <p className="lede">
              Liquid Logic Agent pays approved x402 services in USDC on Base,
              inside published limits. Every settled payment is recorded on a
              public ledger and can be checked on BaseScan.
            </p>
            <div className="actions">
              <a className="btn primary" href="#ledger">
                View the ledger
              </a>
              <a className="btn secondary" href="#endpoints">
                Read endpoint docs
              </a>
            </div>
          </div>
          <PolicyTermsheet />
        </div>
      </div>

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

      <section className="block" id="ledger">
        <div className="wrap sec-head">
          <div>
            <h2>Public ledger</h2>
            <p className="intro">
              Reset for launch on September 15, 2026. Earlier test payments are
              listed in the changelog.
            </p>
          </div>
          <LedgerLive variant="section" initialLatest={initialLatest} />
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
                    <td className="num">0.05 USDC</td>
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

      <section className="block" id="llx">
        <div className="wrap sec-head">
          <div>
            <h2>$LLX</h2>
            <p className="intro">
              The Liquid Logic Agent token on Virtuals, on Base.
            </p>
          </div>
          <LlxSection />
        </div>
      </section>

      <section className="block" id="research">
        <div className="wrap sec-head">
          <div>
            <h2>Roadmap</h2>
            <p className="intro">
              What&apos;s live, what&apos;s deployed, and what&apos;s next.
            </p>
          </div>
          <ResearchGrid />
        </div>
      </section>

      <section className="block" id="changelog">
        <div className="wrap sec-head">
          <div>
            <h2>Changelog</h2>
            <p className="intro">
              What shipped, dated and linked to a pull request or transaction.
            </p>
          </div>
          <ChangelogList />
        </div>
      </section>
    </>
  );
}
