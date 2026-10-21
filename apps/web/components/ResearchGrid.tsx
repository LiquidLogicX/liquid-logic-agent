export function ResearchGrid() {
  return (
    <div className="research">
      <article>
        <div className="stage">Live on 11 chains</div>
        <h3>
          <a href="https://xlock.liquidlogicx.com">Liquid X Lock</a>
        </h3>
        <p>
          Token lock and vesting on Base, BNB Chain, Ethereum, Arbitrum,
          Polygon, Avalanche, Optimism, Arc, Tempo, Robinhood Chain and XRPL EVM.
          Fixed unlock dates, permissionless release, every lock verifiable
          on-chain. Fees in USDC (USDG on Robinhood Chain, RLUSD on XRPL EVM), or $LLX on Base.
          Launched October 2026.
        </p>
      </article>
      <article>
        <div className="stage">Live on Tempo</div>
        <h3>Settlement proofs on Tempo</h3>
        <p>
          Liquid X Pay runs on Tempo mainnet with on-chain settlement proofs and a
          public verifier at proofs.liquidlogicx.com.
        </p>
      </article>
      <article>
        <div className="stage">Live on Base</div>
        <h3>Treasurer, ledger and audit endpoint</h3>
        <p>The capped spending stack described on this site.</p>
      </article>
      <article>
        <div className="stage">Deployed · Sepolia testnet</div>
        <h3>Confidential balances</h3>
        <p>
          Encrypted balances with access control, and a threshold check that
          reveals only whether a balance meets a limit. Built with Zama&apos;s
          open-source FHE libraries; no partnership or endorsement.
        </p>
      </article>
      <article>
        <div className="stage">Next</div>
        <h3>Confidential spending limits</h3>
        <p>
          Enforce a fleet&apos;s limits without disclosing them, including to
          the agents spending against them.
        </p>
      </article>
      <article>
        <div className="stage">Coming soon</div>
        <h3>$LLX payments for proofs and audits</h3>
        <p>
          x402 endpoints accept $LLX alongside USDC, at a discount to the USDC
          price.
        </p>
      </article>
      <article>
        <div className="stage">Live</div>
        <h3>$LLX for Liquid X Lock and Liquid X Pay</h3>
        <p>
          Pay Liquid X Lock fees in $LLX at a discount — live now. Early access to new
          Liquid X Pay features for holders is next.
        </p>
      </article>
      <article>
        <div className="stage">Phase 3</div>
        <h3>LLX Privacy Network</h3>
        <p>
          Our own L2 built for private finance. Proof of funds, confidential
          balances and settlement proofs run natively, powered by fully
          homomorphic encryption (FHE). Businesses prove what they hold without
          ever showing it.
        </p>
      </article>
    </div>
  );
}
