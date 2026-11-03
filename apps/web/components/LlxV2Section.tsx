import { CopyButton } from "@/components/CopyButton";
import { LLX_V2_CONTRACT, LLX_V2_EXPLORERS, LLX_V2_PINKLOCK } from "@/lib/site";

/** $LLX V2: the current token. Same address on all six chains, HyperEVM first. */
export function LlxV2Section() {
  return (
    <div className="token-grid">
      <dl className="terms token-terms">
        <dt>Standard</dt>
        <dd>LayerZero V2 OFT, 18 decimals</dd>
        <dt>Chains</dt>
        <dd>HyperEVM, BNB Chain, Base, Arc, Robinhood Chain, Tempo</dd>
        <dt>Total supply</dt>
        <dd>25,000,000 LLX</dd>
        <dt>Contract</dt>
        <dd>
          <div className="ca" style={{ justifyContent: "flex-end" }}>
            <a
              className="mono"
              href={LLX_V2_EXPLORERS[0].href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {LLX_V2_CONTRACT}
            </a>
            <CopyButton value={LLX_V2_CONTRACT} />
          </div>
          <p className="ca-note">Same address on all six chains. Any other $LLX address is not ours.</p>
        </dd>
        <dt>Explorers</dt>
        <dd>
          {LLX_V2_EXPLORERS.map((e, i) => (
            <span key={e.label}>
              {i > 0 ? " · " : ""}
              <a href={e.href} rel="noopener noreferrer" target="_blank">
                {e.label}
              </a>
            </span>
          ))}
        </dd>
        <dt>Locks</dt>
        <dd>
          14,000,000 LLX (team, treasury, partnerships) locked on PinkLock with monthly vesting.{" "}
          <a href={LLX_V2_PINKLOCK} rel="noopener noreferrer" target="_blank">
            View locks
          </a>
        </dd>
      </dl>
    </div>
  );
}
