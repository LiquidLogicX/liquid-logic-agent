import type { Metadata } from "next";
import { BridgeHero } from "@/components/BridgeHero";
import { BridgeSection } from "@/components/BridgeSection";
import { BRIDGE_CHAINS } from "@/lib/bridge";

const DESCRIPTION =
  "Liquid X Bridge: move $LLX V2 between six chains with LayerZero. Connect MetaMask or OKX Wallet. Beta.";

export const metadata: Metadata = {
  title: "Liquid X Bridge",
  description: DESCRIPTION,
  alternates: { canonical: "/bridge" },
  openGraph: {
    title: "Liquid X Bridge — Liquid Logic X",
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Liquid X Bridge" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Liquid X Bridge — Liquid Logic X",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

const STEPS = [
  ["Connect", "Connect MetaMask or OKX Wallet, or open this page in the wallet's own browser."],
  ["Pick a route", "Choose the From and To chains and enter how much $LLX to move."],
  ["Check the fee", "See the LayerZero fee, paid in the From chain's gas token, before you send."],
  ["Track it", "Delivery usually takes a few minutes. Follow it on LayerZero Scan."],
];

export default function BridgePage() {
  return (
    <main className="page bridge-landing">
      <BridgeHero />

      <section className="wrap bl-chains" aria-label="Supported chains">
        {BRIDGE_CHAINS.map((c) => (
          <div className="bl-chain" key={c.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="bl-chain-logo" src={`/chains/${c.id}.png`} alt={`${c.name} logo`} width={44} height={44} />
            <span>{c.name}</span>
          </div>
        ))}
      </section>

      <section className="wrap bl-steps">
        <h2>How it works</h2>
        <ol>
          {STEPS.map(([t, d], i) => (
            <li key={t}>
              <span className="bl-step-n">{i + 1}</span>
              <div><strong>{t}</strong><p>{d}</p></div>
            </li>
          ))}
        </ol>
        <ul className="bl-notes">
          <li>Each route allows up to 2,000,000 $LLX per day.</li>
          <li>Sending from Tempo isn&apos;t supported yet. You can still send to Tempo.</li>
          <li>
            Track transfers on{" "}
            <a href="https://layerzeroscan.com" target="_blank" rel="noopener noreferrer">LayerZero Scan</a>.
          </li>
        </ul>
      </section>

      <BridgeSection />
    </main>
  );
}
