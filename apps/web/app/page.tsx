import { HeroLedgerPanel } from "@/components/HeroLedgerPanel";
import { StatsBand } from "@/components/StatsBand";
import { CHANGELOG } from "@/lib/changelog";

const auditUrl =
  process.env.NEXT_PUBLIC_AUDIT_URL ?? "https://audit.liquidlogicx.com";

/** Set only when the live Virtuals/$LLX contract is known. Unset = render nothing. */
const llxContractAddress =
  process.env.NEXT_PUBLIC_LLX_CONTRACT_ADDRESS?.trim() || undefined;

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>Operating spend for agent services — on Base, in USDC.</h1>
          <p className="lede">
            Liquid Logic Agent pays allowlisted x402 endpoints with USDC on Base.
            Caps and an append-only public ledger keep every payment checkable on
            BaseScan. The agent spends USDC on services only — it never buys,
            sells, or holds $LLX.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="/ledger">
              View public ledger
            </a>
            <a className="btn btn-ghost" href="/docs">
              Audit endpoint docs
            </a>
          </div>
        </div>
        <HeroLedgerPanel />
      </section>

      <StatsBand />

      <section className="section" id="llx">
        <h2>$LLX</h2>
        <p className="section-body">
          $LLX launches on Virtuals on Base on September 18, 2026. The audit
          endpoint and all treasurer spending settle in USDC. The public ledger
          tracks USDC spend only.
        </p>
        {llxContractAddress ? (
          <p className="llx-contract mono">
            <a
              href={`https://basescan.org/token/${llxContractAddress}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              {llxContractAddress}
            </a>
          </p>
        ) : null}
      </section>


      <section className="cream" id="changelog">
        <div className="cream-inner">
          <h2>Changelog</h2>
          <p className="section-lede">
            What actually shipped — dated and linked to a commit, pull request, or
            on-chain transaction. No roadmap.
          </p>
          <ol className="changelog">
            {CHANGELOG.map((e) => (
              <li key={`${e.date}-${e.href}`}>
                <div className="date">{e.date}</div>
                <h3>{e.title}</h3>
                <p>{e.detail}</p>
                <a href={e.href} rel="noopener noreferrer" target="_blank">
                  {e.hrefLabel}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section" id="ledger-live">
        <h2>What it does</h2>
        <div className="card-grid">
          <div className="card">
            <h3>Treasurer</h3>
            <ul>
              <li>CDP-managed wallet pays x402 APIs on Base mainnet</li>
              <li>Allowlist, max per payment, and daily USDC cap</li>
              <li>Disk ledger synced to GitHub for public publishing</li>
            </ul>
          </div>
          <div className="card">
            <h3>Paid audit + pre-flight</h3>
            <p>
              Spend summary — <strong>$0.05 USDC</strong>. Allowance pre-flight
              (call before spending) — <strong>$0.001 USDC</strong>. Both via
              x402 on Base.
            </p>
            <p style={{ marginTop: "0.75rem" }}>
              <code>{`GET ${auditUrl}/api/allowance?wallet=0x…`}</code>
            </p>
          </div>
        </div>
      </section>

      <section className="contact-band" id="contact">
        <div className="contact-card">
          <h2>Contact</h2>
          <p>
            No contact form on this site. Reach the Liquid Logic X team directly:
          </p>
          <a className="contact-email" href="mailto:hello@liquidlogicx.com">
            hello@liquidlogicx.com
          </a>
        </div>
      </section>
    </>
  );
}
