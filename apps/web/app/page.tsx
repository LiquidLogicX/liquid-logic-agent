import { LlxPaySection } from "@/components/LlxPaySection";
import { LlxSection } from "@/components/LlxSection";
import { LlxUtility } from "@/components/LlxUtility";
import { XLockSection } from "@/components/XLockSection";
import {
  TeamSection,
  TokenRoadmapSection,
  TokenomicsSection,
  WhyV2Section,
} from "@/components/TokenomicsSection";
import { CllxZeroSection } from "@/components/CllxZeroSection";
import { HeroArt } from "@/components/HeroArt";
import { HeroOrbs } from "@/components/HeroOrbs";
import { HeroProducts } from "@/components/HeroProducts";

export default function HomePage() {
  return (
    <>
      <div className="hero hero-v2" id="products">
        <HeroOrbs />
        <div className="wrap">
          <div className="hero-copy">
            <div className="hero-text">
              <h1>Lock, pay and send privately. All on-chain.</h1>
              <p className="lede">
                Liquid Logic X builds payment tools for businesses, token teams and
                AI agents. Lock tokens, approve company payments, send privately and
                hold funds in escrow. Every step can be checked on a block explorer.
              </p>
              <div className="actions">
                <a className="btn primary" href="https://xlock.liquidlogicx.com">
                  Open X-Lock
                </a>
                <a className="btn secondary" href="#tokenomics">
                  The $LLX token
                </a>
              </div>
            </div>
            <HeroArt />
          </div>
          <HeroProducts />
        </div>
      </div>

      <LlxPaySection />

      <XLockSection />

      <CllxZeroSection />

      <WhyV2Section />

      <TokenomicsSection />

      <TokenRoadmapSection />

      <TeamSection />

      <section className="block" id="llx">
        <div className="wrap sec-head">
          <div>
            <h2>$LLX V1 (original)</h2>
            <p className="intro">
              The original Liquid Logic Agent token on Virtuals, on Base.
              Holders at the snapshot can migrate to $LLX V2.
            </p>
          </div>
          <LlxSection />
        </div>
      </section>

      <section className="block" id="llx-utility">
        <div className="wrap sec-head">
          <div>
            <h2>$LLX utility</h2>
            <p className="intro">
              What $LLX does across Liquid Logic X products.
            </p>
          </div>
          <LlxUtility />
        </div>
      </section>
    </>
  );
}
