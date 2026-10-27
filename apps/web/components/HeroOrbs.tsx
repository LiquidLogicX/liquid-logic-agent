/** Decorative floating glass chips around the hero. Hidden from screen readers and on small screens. */
const ICONS = {
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  usdc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9.4c-.4-1-1.5-1.6-2.8-1.6-1.6 0-2.8.8-2.8 2s1.1 1.7 2.8 2.1 2.8 1 2.8 2.2-1.2 2-2.8 2c-1.4 0-2.5-.6-2.9-1.7M12 6.3v1.5M12 16.2v1.5" />
    </svg>
  ),
  card: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
};

const ORBS = [
  { cls: "o1", icon: ICONS.lock, label: "X-Lock" },
  { cls: "o2", icon: ICONS.usdc, label: "X-Escrow" },
  { cls: "o3", icon: ICONS.card, label: "X-Pay" },
  { cls: "o4", icon: ICONS.shield, label: "ZK-Zero" },
];

export function HeroOrbs() {
  return (
    <div className="hero-orbs" aria-hidden="true">
      {ORBS.map((o) => (
        <div key={o.cls} className={`orb ${o.cls}`}>
          <span className="ic">{o.icon}</span>
          {o.label}
        </div>
      ))}
    </div>
  );
}
