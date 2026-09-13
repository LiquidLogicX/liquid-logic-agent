const TREASURER =
  "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D";
const M1 =
  "0x0b576f4bBd7862279a0bE1982eE71f910eBDB3ac";
const M2 =
  "0x1132E6b5Cafe10990879Eed95e4bf10179DE9c7a";

const auditUrl =
  process.env.NEXT_PUBLIC_AUDIT_URL ?? "https://audit.liquidlogicx.com";

export const metadata = {
  title: "Plans — Liquid Logic X",
  description:
    "What is live on Base, what is built on Sepolia, and the intended direction for confidential spend caps.",
};

export default function PlansPage() {
  return (
    <main className="page plans-page">
      <header className="plans-intro">
        <p className="plans-kicker">Plans</p>
        <h1>Ordered by how real it is.</h1>
        <p className="lede">
          Live first. Then work that exists on-chain but is not in the product.
          Then intent — not a commitment.
        </p>
      </header>

      <section className="plans-block" aria-labelledby="plans-live">
        <div className="plans-block-head">
          <span className="plans-status live">Live now</span>
          <h2 id="plans-live">On Base today</h2>
        </div>
        <p className="section-lede plans-lede">
          The operating stack that pays allowlisted x402 services with USDC on
          Base. Each item links to a live wallet, ledger, or endpoint.
        </p>
        <div className="card-grid plans-grid">
          <article className="card">
            <h3>Treasurer</h3>
            <p>
              CDP-managed agent wallet pays allowlisted x402 endpoints on Base
              mainnet under allowlist and spend caps.
            </p>
            <p className="plans-links">
              <a
                href={`https://basescan.org/address/${TREASURER}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                BaseScan {TREASURER.slice(0, 6)}…{TREASURER.slice(-4)}
              </a>
            </p>
          </article>
          <article className="card">
            <h3>Public ledger</h3>
            <p>
              Append-only record of published payments, mirrored for the site
              from the treasurer disk.
            </p>
            <p className="plans-links">
              <a href="/ledger">View public ledger</a>
              {" · "}
              <a href="/ledger/latest.json">latest.json</a>
            </p>
          </article>
          <article className="card">
            <h3>x402 audit endpoint</h3>
            <p>
              Paid spend summary for an agent wallet over x402 on Base. Unpaid
              calls receive a payment challenge from the live endpoint.
            </p>
            <p className="plans-links">
              <a href="/docs">Endpoint docs</a>
              {" · "}
              <a
                href={`${auditUrl}/api/audit`}
                rel="noopener noreferrer"
                target="_blank"
              >
                {auditUrl.replace(/^https?:\/\//, "")}/api/audit
              </a>
            </p>
          </article>
        </div>
      </section>

      <section className="cream plans-built" aria-labelledby="plans-built">
        <div className="cream-inner">
          <div className="plans-block-head">
            <span className="plans-status built">Built, not in the product</span>
            <h2 id="plans-built">Confidential balances on Sepolia</h2>
          </div>
          <p className="section-lede">
            Verified contracts on Ethereum Sepolia. They are testnet only and
            are not part of the live Base product. Both use open-source FHE
            libraries from Zama as compiler and runtime technology — that is
            library usage, not a partnership, endorsement, or commercial
            relationship.
          </p>
          <div className="card-grid plans-grid cream-cards">
            <article className="card cream-card">
              <h3>Encrypted balances with ACL</h3>
              <p>
                Confidential balance contract: encrypted balances and an access
                control list so only granted addresses can decrypt a balance.
              </p>
              <p className="plans-links">
                <a
                  href={`https://sepolia.etherscan.io/address/${M1}#code`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Sepolia Etherscan {M1.slice(0, 6)}…{M1.slice(-4)}
                </a>
              </p>
            </article>
            <article className="card cream-card">
              <h3>Threshold proof</h3>
              <p>
                A later Sepolia deployment of the confidential-balance contract
                that supports a threshold check: a verifier can learn whether a
                balance meets a threshold without reading the balance itself.
              </p>
              <p className="plans-links">
                <a
                  href={`https://sepolia.etherscan.io/address/${M2}#code`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Sepolia Etherscan {M2.slice(0, 6)}…{M2.slice(-4)}
                </a>
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="plans-block" aria-labelledby="plans-intent">
        <div className="plans-block-head">
          <span className="plans-status intent">Intended direction</span>
          <h2 id="plans-intent">Confidential spend caps for the treasurer</h2>
        </div>
        <div className="card plans-intent-card">
          <p>
            Bring the confidential-balance property into the treasurer so a
            fleet&apos;s spend caps can be enforced without being disclosed —
            including to the agents that spend against them.
          </p>
          <p className="muted plans-intent-note">
            Written as intent only. Not a commitment, timeline, or product
            promise.
          </p>
        </div>
      </section>
    </main>
  );
}
