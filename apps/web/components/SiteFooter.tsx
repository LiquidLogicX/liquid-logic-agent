export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="wrap foot-inner">
        <div>
          <p>
            USDC on Base for x402 services. $LLX is the Liquid Logic Agent token
            on Virtuals (Base). It is not an investment product. No returns,
            yield, buybacks or price support are promised. Roadmap describes
            intent, not a commitment.
          </p>
        </div>
        <div>
          <p>
            <a href="mailto:hello@liquidlogicx.com">hello@liquidlogicx.com</a>
          </p>
          <p>
            <a
              href="https://x.com/LiquidLogicX"
              rel="me noopener noreferrer"
            >
              @LiquidLogicX on X
            </a>
          </p>
          <p>
            <a href="/docs">Endpoint docs</a>
            {" · "}
            <a href="/ledger">Ledger</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
