/** Hero product cards in frosted glass: what each product does, its status, and where to open it. X-Lock is featured. */
const ICON = {
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <path d="M12 15v2.5" />
    </svg>
  ),
  pay: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  ),
  zero: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  escrow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M4 7l2 13h12l2-13M9 7V4h6v3" />
      <path d="M9.5 13.5l2 2 3.5-3.5" />
    </svg>
  ),
};

/** The brand "X" mark, as on the product cards in the mockup. */
function XMark() {
  return (
    <svg className="hp-mark" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="hp-x" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b79bff" />
          <stop offset="0.55" stopColor="#7b5cff" />
          <stop offset="1" stopColor="#5b8cff" />
        </linearGradient>
      </defs>
      <path d="M8 7l16 18M24 7L8 25" fill="none" stroke="url(#hp-x)" strokeWidth="6.5" strokeLinecap="round" />
    </svg>
  );
}

const PRODUCTS = [
  {
    name: ["Liquid", "X-Pay"],
    kicker: "Payments",
    status: "Early access",
    icon: ICON.pay,
    text: "Company USDC payments with multi-signer approvals. Settles in under a second, with a receipt for every payment.",
    detail: "Running on Arc mainnet, with settlement proofs on Arc and Tempo.",
    href: "/#llx-pay",
    cta: "See X-Pay",
  },
  {
    name: ["Liquid", "X-Lock"],
    kicker: "Secure lock",
    status: "Live on 11 chains",
    icon: ICON.lock,
    text: "Lock or vest any token with a fixed unlock date. Every lock is public and checkable on the block explorer.",
    detail: "10 USDC per lock, or $LLX at a discount on Base. Live on Base, Ethereum, BNB Chain and 8 more chains.",
    href: "https://xlock.liquidlogicx.com",
    cta: "Lock a token",
    featured: true,
  },
  {
    name: ["Liquid", "ZK-Zero"],
    kicker: "Privacy shield",
    status: "Beta on Base",
    icon: ICON.zero,
    text: "Private payments. Send to any wallet address without showing who paid whom or how much.",
    detail: "Every send is checked by a zero-knowledge proof made in your browser.",
    href: "https://zk.liquidlogicx.com",
    cta: "Open ZK-Zero",
  },
  {
    name: ["Liquid", "X-Escrow"],
    kicker: "Escrow",
    status: "Live",
    icon: ICON.escrow,
    text: "Hold a payment on-chain until the deal is done, with a deadline both sides can see.",
    detail: "Both sides can check the escrow on the block explorer at any time.",
    href: "https://xlock.liquidlogicx.com/escrow",
    cta: "Open X-Escrow",
  },
];

export function HeroProducts() {
  return (
    <ul className="hero-products" aria-label="Products">
      {PRODUCTS.map((p) => {
        const featured = "featured" in p && p.featured;
        return (
          <li key={p.name.join(" ")} className={featured ? "hp-card hp-featured" : "hp-card"}>
            <div className="hp-top">
              <XMark />
              <span className="hp-status">{p.status}</span>
            </div>
            <h2 className="hp-name">
              <span>{p.name[0]}</span> {p.name[1]}
            </h2>
            <p className="hp-kicker">{p.kicker}</p>
            <p className="hp-text">{p.text}</p>
            <p className="hp-detail">{p.detail}</p>
            <div className="hp-foot">
              <span className="hp-tile">{p.icon}</span>
              <a className="hp-link" href={p.href}>
                {p.cta} <span aria-hidden="true">→</span>
              </a>
            </div>
            <span className="hp-arrow" aria-hidden="true">→</span>
          </li>
        );
      })}
    </ul>
  );
}
