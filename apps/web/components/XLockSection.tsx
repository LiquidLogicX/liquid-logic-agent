import { XLOCK_URL } from "@/lib/site";

export function XLockSection() {
  return (
    <section className="block" id="xlock">
      <div className="wrap sec-head">
        <div>
          <h2>X-Lock</h2>
          <p className="intro">
            Lock or vest any token on Base. Fixed unlock date, permissionless
            release, every lock verifiable on Basescan.
          </p>
        </div>
        <div>
          <p className="llxpay-sub" style={{ marginTop: 0, marginBottom: 18 }}>
            10 USDC per lock, or pay in $LLX at a discount.
          </p>
          <div className="llxpay-buttons">
            <a
              className="btn primary"
              href={XLOCK_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open X-Lock
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
