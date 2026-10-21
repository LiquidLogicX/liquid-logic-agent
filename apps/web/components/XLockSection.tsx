import { XLOCK_URL } from "@/lib/site";

const CHAINS = [
  { label: "BASE", name: "Base", color: "#0052ff", ink: "#fff" },
  { label: "ETH", name: "Ethereum", color: "#627eea", ink: "#fff" },
  { label: "ARB", name: "Arbitrum", color: "#28a0f0", ink: "#fff" },
  { label: "OP", name: "Optimism", color: "#ff0420", ink: "#fff" },
  { label: "BNB", name: "BNB Chain", color: "#f0b90b", ink: "#18202f" },
  { label: "POL", name: "Polygon", color: "#8247e5", ink: "#fff" },
  { label: "AVAX", name: "Avalanche", color: "#e84142", ink: "#fff" },
  { label: "ARC", name: "Arc", color: "#7c5cff", ink: "#fff" },
  { label: "TEMPO", name: "Tempo", color: "#10b981", ink: "#fff" },
  { label: "RH", name: "Robinhood Chain", color: "#ccff00", ink: "#18202f" },
  { label: "XRPL", name: "XRPL EVM", color: "#23292f", ink: "#fff" },
] as const;

export function XLockSection() {
  return (
    <section className="block" id="xlock">
      <div className="wrap sec-head">
        <div>
          <h2>Liquid X-Lock</h2>
          <p className="intro">
            Lock or vest any token on 11 live chains: Base, BNB Chain,
            Ethereum, Arbitrum, Polygon, Avalanche, Optimism, Arc, Tempo,
            Robinhood Chain and XRPL EVM. Fixed unlock date, permissionless release, every
            lock verifiable on the chain&apos;s block explorer.
          </p>
          <p className="intro">
            10 USDC per lock (10 USDG on Robinhood Chain, 10 RLUSD on XRPL EVM), or pay in $LLX at a
            discount on Base.
          </p>
          <ul className="chain-pills" aria-label="Live on 11 chains">
            {CHAINS.map((c) => (
              <li
                key={c.label}
                title={c.name}
                style={{ background: c.color, color: c.ink }}
              >
                {c.label}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="llxpay-buttons">
            <a
              className="btn primary"
              href={XLOCK_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Liquid X-Lock
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
