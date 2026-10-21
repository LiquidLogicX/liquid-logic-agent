const CLLX_ZERO_URL = "https://zk.liquidlogicx.com";

export function CllxZeroSection() {
  return (
    <section className="block" id="cllx-zero">
      <div className="wrap sec-head cllx-zero">
        <div>
          <h2>
            cLLX-ZERO <span className="cllx-zero-badge">Beta</span>
          </h2>
          <p className="intro">
            Send LLX on Base without linking your wallet. Proofs are made in
            your browser, and withdrawals go through a relayer.
          </p>
          <div className="llxpay-buttons">
            <a
              className="btn primary"
              href={CLLX_ZERO_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open cLLX-ZERO
            </a>
          </div>
        </div>
        <div className="cllx-zero-art">
          <img
            src="/cllx-vault.webp"
            width={440}
            height={440}
            alt="Steel vault door"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
