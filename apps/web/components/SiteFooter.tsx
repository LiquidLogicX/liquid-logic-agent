export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="wrap foot-inner">
        <div>
          <p className="foot-nfa">Nothing on this site is financial advice.</p>
          <p>© 2026 Liquid Logic X LLC</p>
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
