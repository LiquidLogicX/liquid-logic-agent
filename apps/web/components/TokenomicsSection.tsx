import {
  LLX_TEAM,
  LLX_V2_ALLOCATIONS,
  LLX_V2_CHAINS,
  LLX_V2_ROADMAP,
  LLX_V2_TOTAL_SUPPLY,
  LLX_V2_WHY,
  allocationGradient,
  allocationPercent,
} from "@/lib/tokenomics";
import { CONTACT_EMAIL, CONTACT_TELEGRAM, CONTACT_X } from "@/lib/about";

const fmt = (n: number) => n.toLocaleString("en-US");

export function TokenomicsSection() {
  return (
    <section className="block" id="tokenomics">
      <div className="wrap sec-head">
        <div>
          <h2>$LLX V2 tokenomics</h2>
          <p className="intro">
            One token on {LLX_V2_CHAINS.length} chains:{" "}
            {LLX_V2_CHAINS.join(", ")}. Fixed supply of{" "}
            {fmt(LLX_V2_TOTAL_SUPPLY)}, minted once and held by a 2-of-3
            multi-sig vault. Cross-chain transfers run on LayerZero.
          </p>
          <div className="actions" style={{ marginTop: 20 }}>
            <a className="btn secondary" href="/whitepaper">
              Read the whitepaper
            </a>
            <a
              className="btn secondary"
              href={CONTACT_TELEGRAM}
              rel="noopener noreferrer"
              target="_blank"
            >
              Join our Telegram
            </a>
          </div>
        </div>
        <div className="tkn">
          <div className="tkn-chart" aria-hidden="true">
            <div
              className="tkn-donut"
              style={{ background: allocationGradient() }}
            />
            <div className="tkn-center">
              <strong>25M</strong>
              <span>$LLX</span>
            </div>
          </div>
          <table className="tkn-table">
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
      </div>
    </section>
  );
}

export function TokenRoadmapSection() {
  return (
    <section className="block" id="token-roadmap">
      <div className="wrap sec-head">
        <div>
          <h2>$LLX roadmap</h2>
          <p className="intro">From launch to private payments on every chain.</p>
        </div>
        <ol className="tkn-roadmap">
          {LLX_V2_ROADMAP.map((phase) => (
            <li key={phase.period}>
              <h3>{phase.period}</h3>
              <ul>
                {phase.items.map((item) => (
                  <li key={item.text} className={item.done ? "done" : undefined}>
                    <span className="tkn-check" aria-hidden="true">
                      {item.done ? "✓" : ""}
                    </span>
                    {item.text}
                    {item.done ? <span className="sr-only"> (done)</span> : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function TeamSection() {
  return (
    <section className="block" id="team">
      <div className="wrap sec-head">
        <div>
          <h2>Team</h2>
          <p className="intro">The people building Liquid Logic X.</p>
        </div>
        <div className="tkn-team">
          {LLX_TEAM.map((m) => (
            <article key={m.name}>
              <h3>{m.name}</h3>
              <div className="tkn-role">{m.role}</div>
              <p>{m.bio}</p>
            </article>
          ))}
          <article className="tkn-channels">
            <h3>Official channels</h3>
            <p>
              <a href={CONTACT_X} rel="noopener noreferrer" target="_blank">
                X @LiquidLogicX
              </a>
              {" · "}
              <a href={CONTACT_TELEGRAM} rel="noopener noreferrer" target="_blank">
                Telegram
              </a>
              {" · "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

export function WhyV2Section() {
  const w = LLX_V2_WHY;
  return (
    <section className="block" id="why-v2">
      <div className="wrap sec-head">
        <div>
          <h2>Why $LLX V2</h2>
          <p className="intro">{w.intro}</p>
        </div>
        <div className="tkn-why">
          <article>
            <h3>{w.launchpad.title}</h3>
            {w.launchpad.paragraphs.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </article>
          <article>
            <h3>{w.different.title}</h3>
            <ul>
              {w.different.points.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </article>
          <article className="wide">
            <h3>{w.holders.title}</h3>
            {w.holders.paragraphs.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </article>
        </div>
      </div>
    </section>
  );
}
