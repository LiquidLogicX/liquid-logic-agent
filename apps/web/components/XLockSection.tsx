import { XLOCK_URL } from "@/lib/site";

export function XLockSection() {
  return (
    <section className="block" id="xlock">
      <div className="wrap sec-head">
        <div>
          <h2>Liquid X Lock</h2>
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
        </div>
        <div>
          <div className="llxpay-buttons">
            <a
              className="btn primary"
              href={XLOCK_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Liquid X Lock
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
