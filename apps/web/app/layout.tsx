import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Liquid Logic Agent",
  description:
    "Autonomous USDC operating spend on Base via x402 — services only, public ledger.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a className="logo" href="/">
            Liquid Logic <span className="x">X</span>
          </a>
          <nav>
            <a href="/#ledger-live">Ledger</a>
            <a href="/#changelog">Changelog</a>
            <a href="/plans">Plans</a>
            <a href="/docs">Endpoint docs</a>
            <a href="/#contact">Contact</a>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <p>
            USDC on Base for x402 services. $LLX is the Liquid Logic Agent token
            on Virtuals (Base). It is not an investment product — no returns,
            yield, buybacks, or price support are promised. Plans describes
            intent, not a commitment.
          </p>
          <p className="site-footer-x">
            <a href="https://x.com/LiquidLogicX" rel="me noopener noreferrer">
              @LiquidLogicX
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
