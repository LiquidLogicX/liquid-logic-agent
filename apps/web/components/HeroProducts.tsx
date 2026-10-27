/** Hero product cards: what each Liquid Logic X product does, its status, and where to open it. */
const ICON = {
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  pay: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  ),
  zero: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6l7-3z" />
      <circle cx="12" cy="11.5" r="2.2" />
      <path d="M12 13.7V16" />
    </svg>
  ),
  escrow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M4 7l2 13h12l2-13M9 7V4h6v3" />
      <path d="M9.5 13.5l2 2 3.5-3.5" />
    </svg>
  ),
};

const PRODUCTS = [
  {
    name: "Liquid X-Lock",
    status: "Live on 11 chains",
    icon: ICON.lock,
    text: "Lock or vest any token with a fixed unlock date. Every lock is public and checkable on the block explorer.",
    detail: "10 USDC per lock, or pay in $LLX at a discount on Base. Vesting schedules, team and treasury locks, and permissionless release when the date arrives.",
    href: "https://xlock.liquidlogicx.com",
    cta: "Lock or vest a token",
    featured: true,
  },
  {
    name: "Liquid X-Pay",
    status: "Early access",
    icon: ICON.pay,
    text: "Company USDC payments with multi-signer approvals. Settles in under a second, with a receipt for every payment.",
    detail: "Running on Arc mainnet, with settlement proofs on Arc and Tempo.",
    href: "/#llx-pay",
    cta: "See X-Pay",
  },
  {
    name: "Liquid X-Zero",
    status: "Beta on Base",
    icon: ICON.zero,
    text: "Private payments. Send to any wallet address without showing who paid whom or how much.",
    detail: "Every send is checked by a zero-knowledge proof made in your browser.",
    href: "https://zk.liquidlogicx.com",
    cta: "Open X-Zero",
  },
  {
    name: "X-Escrow",
    status: "Live",
    icon: ICON.escrow,
    text: "Hold a payment on-chain until the deal is done, with a deadline both sides can see.",
    detail: "Both sides can check the escrow on the block explorer at any time.",
    href: "https://xlock.liquidlogicx.com/escrow",
    cta: "Open X-Escrow",
  },
];

const CHAINS = ["Base", "Ethereum", "BNB Chain", "Arbitrum", "Optimism", "Polygon", "Avalanche", "Arc", "Tempo", "Robinhood Chain", "XRPL EVM"];

export function HeroProducts() {
  return (
    <ul className="hero-products" aria-label="Products">
      {PRODUCTS.map((p) => (
        <li key={p.name} className={"featured" in p && p.featured ? "hp-card hp-featured" : "hp-card"}>
          <div className="hp-top">
            <span className="hp-ic">{p.icon}</span>
            <span className="hp-status">{p.status}</span>
          </div>
          <h2 className="hp-name">{p.name}</h2>
          <p className="hp-text">{p.text}</p>
          <p className="hp-detail">{p.detail}</p>
          {"featured" in p && p.featured ? (
            <ul className="hp-chains" aria-label="Chains">
              {CHAINS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : null}
          <a className={"featured" in p && p.featured ? "btn primary hp-cta" : "hp-link"} href={p.href}>
            {p.cta} <span aria-hidden="true">→</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
