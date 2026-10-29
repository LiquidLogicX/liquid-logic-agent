import type { Metadata } from "next";
import { CONTACT_EMAIL, CONTACT_TELEGRAM, CONTACT_X } from "@/lib/about";
import { LLX_UTILITY, utilityStatusLabel } from "@/lib/llxUtility";
import { LLX_V1_SNAPSHOT_BLOCK, LLX_V1_SNAPSHOT_TIME } from "@/lib/site";
import {
  LLX_TEAM,
  LLX_V2_ALLOCATIONS,
  LLX_V2_CHAINS,
  LLX_V2_ROADMAP,
  LLX_V2_TOTAL_SUPPLY,
  LLX_V2_WHY,
  allocationPercent,
} from "@/lib/tokenomics";

const DESCRIPTION =
  "The $LLX V2 whitepaper: why Liquid Logic X moved to a new token, how it works across six chains, tokenomics, locks, migration and roadmap.";

export const metadata: Metadata = {
  title: "Whitepaper",
  description: DESCRIPTION,
  openGraph: {
    title: "Whitepaper — Liquid Logic X",
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Liquid Logic X" }],
  },
};

const fmt = (n: number) => n.toLocaleString("en-US");
const chains = (() => {
  const c = [...LLX_V2_CHAINS];
  return `${c.slice(0, -1).join(", ")} and ${c[c.length - 1]}`;
})();

export default function WhitepaperPage() {
  return (
    <main className="page about whitepaper">
      <h1>$LLX V2 Whitepaper</h1>
      <p className="page-lede">
        Liquid Logic X LLC · Version 1.0 · October 2026
      </p>

      <section className="docs-card" aria-labelledby="wp-summary">
        <h2 id="wp-summary">1. Summary</h2>
        <p>
          Liquid Logic X builds on-chain payment tools for businesses, token
          teams and AI agents: token locks, approved company payments, private
          sends and escrow, with every step checkable on a block explorer.
        </p>
        <p>
          $LLX V2 is the token for these products. It is one token at the same
          address on {chains}, moving between chains over LayerZero. The supply
          is fixed at {fmt(LLX_V2_TOTAL_SUPPLY)}, minted once and held by a
          2-of-3 multi-sig vault owned by Liquid Logic X.
        </p>
      </section>

      <section className="docs-card" aria-labelledby="wp-why">
        <h2 id="wp-why">2. Why a new token</h2>
        {LLX_V2_WHY.launchpad.paragraphs.map((t) => (
          <p key={t}>{t}</p>
        ))}
        <p>{LLX_V2_WHY.different.title}:</p>
        <ul className="about-list">
          {LLX_V2_WHY.different.points.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section className="docs-card" aria-labelledby="wp-design">
        <h2 id="wp-design">3. How $LLX V2 works</h2>
        <ul className="about-list">
          <li>
            <strong>Standard:</strong> a LayerZero V2 Omnichain Fungible Token
            (OFT), 18 decimals. When $LLX moves to another chain it is burned
            on the source chain and minted on the destination, so the total
            across all chains always stays {fmt(LLX_V2_TOTAL_SUPPLY)}.
          </li>
          <li>
            <strong>Chains:</strong> {chains}, all at the same contract
            address.
          </li>
          <li>
            <strong>Ownership:</strong> on every chain the token and its
            LayerZero settings are owned by the LLX V2 Vault, a 2-of-3 Safe
            multi-sig. No single key can change anything.
          </li>
          <li>
            <strong>Two independent verifiers:</strong> every cross-chain
            transfer must be confirmed by both LayerZero Labs and Horizen
            before it is delivered.
          </li>
          <li>
            <strong>Daily transfer limits:</strong> each route between two
            chains has a daily limit set by the vault, which caps how much can
            move in a day.
          </li>
          <li>
            <strong>Plain token:</strong> no transfer tax, no max-transaction
            rule, no blacklist and no pause function.
          </li>
          <li>
            <strong>Tested live:</strong> transfers were tested on every route,
            in both directions, before launch.
          </li>
        </ul>
      </section>

      <section className="docs-card" aria-labelledby="wp-tokenomics">
        <h2 id="wp-tokenomics">4. Tokenomics</h2>
        <p>
          Total supply: {fmt(LLX_V2_TOTAL_SUPPLY)} $LLX, fixed. No further
          minting.
        </p>
        <div className="wp-tkn">
          <table className="tkn-table" style={{ minWidth: 0 }}>
            <caption className="sr-only">$LLX V2 allocation</caption>
            <colgroup>
              <col />
              <col className="tkn-c-amt" />
              <col className="tkn-c-pct" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Allocation</th>
                <th scope="col">$LLX</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {LLX_V2_ALLOCATIONS.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="tkn-dot" style={{ background: a.color }} />
                    <span className="tkn-label">{a.label}</span>
                    <span className="tkn-release">{a.release}</span>
                  </td>
                  <td className="mono">{fmt(a.amount)}</td>
                  <td className="mono">{allocationPercent(a.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="mono">{fmt(LLX_V2_TOTAL_SUPPLY)}</td>
                <td className="mono">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="docs-card" aria-labelledby="wp-locks">
        <h2 id="wp-locks">5. Locks, presale and listing</h2>
        <ul className="about-list">
          <li>
            <strong>Independent locks:</strong> treasury, partnership and team
            tokens are locked in PinkLock, an independent third-party locker,
            before the presale. The lock terms are in the table above and are
            public on PinkLock.
          </li>
          <li>
            <strong>Presale:</strong> 2,500,000 $LLX through a PinkSale presale
            on BNB Chain.
          </li>
          <li>
            <strong>Liquidity:</strong> when the presale finalizes, liquidity is
            added on a DEX and the LP tokens are locked in PinkLock.
          </li>
          <li>
            <strong>No trading before the presale ends:</strong> no $LLX V2
            liquidity pool exists on any chain until the presale finalizes.
          </li>
        </ul>
      </section>

      <section className="docs-card" aria-labelledby="wp-utility">
        <h2 id="wp-utility">6. Utility</h2>
        <ul className="about-list">
          {LLX_UTILITY.map((u) => (
            <li key={u.id}>
              <strong>{u.title}</strong> ({utilityStatusLabel(u.status)}).{" "}
              {u.detail}
            </li>
          ))}
          <li>
            <strong>Private payments with Liquid ZK-Zero</strong> (on the
            roadmap). Private $LLX V2 sends, with every send checked by a
            zero-knowledge proof made in the user&apos;s browser.
          </li>
        </ul>
      </section>

      <section className="docs-card" aria-labelledby="wp-migration">
        <h2 id="wp-migration">7. Migration for original $LLX holders</h2>
        <ul className="about-list">
          <li>
            <strong>Snapshot:</strong> taken at Base block{" "}
            {LLX_V1_SNAPSHOT_BLOCK} ({LLX_V1_SNAPSHOT_TIME}). V1 bought after
            this block does not qualify.
          </li>
          <li>
            <strong>Reserve:</strong> 319,700 $LLX V2 is set aside for V1
            holders.
          </li>
          <li>
            <strong>Ratio:</strong> not 1:1, because V2 has a much smaller
            supply. It is set from V1&apos;s average market price over the 7
            days before the snapshot.
          </li>
          <li>
            <strong>Excluded:</strong> wallets and contracts owned by Liquid
            Logic X, and launchpad and pool contracts, are not part of the
            migration. The team is covered by its V2 allocation.
          </li>
          <li>
            <strong>Claim:</strong> the swap ratio and claim steps will be
            announced on liquidlogicx.com, @LiquidLogicX on X and our official
            Telegram. Ignore any other swap links.
          </li>
        </ul>
      </section>

      <section className="docs-card" aria-labelledby="wp-roadmap">
        <h2 id="wp-roadmap">8. Roadmap</h2>
        {LLX_V2_ROADMAP.map((phase) => (
          <div key={phase.period}>
            <p>
              <strong>{phase.period}</strong>
            </p>
            <ul className="about-list">
              {phase.items.map((i) => (
                <li key={i.text}>
                  {i.done ? "✓ " : ""}
                  {i.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="docs-card" aria-labelledby="wp-team">
        <h2 id="wp-team">9. Team and company</h2>
        {LLX_TEAM.map((m) => (
          <p key={m.name}>
            <strong>{m.name}</strong>, {m.role}. {m.bio}
          </p>
        ))}
        <p>Liquid Logic X LLC is a licensed business in California, USA.</p>
        <p>
          <a href={CONTACT_X} rel="noopener noreferrer">
            X @LiquidLogicX
          </a>
          {" · "}
          <a href={CONTACT_TELEGRAM} rel="noopener noreferrer">
            Telegram
          </a>
          {" · "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </section>

      <section className="docs-card" aria-labelledby="wp-notice">
        <h2 id="wp-notice">10. Important notice</h2>
        <p>
          This document describes the $LLX V2 token and Liquid Logic X
          products. It is not financial advice and not an offer of securities.
          $LLX is a utility token for Liquid Logic X products. Smart contracts
          and cross-chain transfers carry technical risk. Roadmap items describe
          current plans and may change.
        </p>
      </section>
    </main>
  );
}
