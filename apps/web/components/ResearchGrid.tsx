export function ResearchGrid() {
  return (
    <div className="research">
      <article>
        <div className="stage">Live on Base</div>
        <h3>Treasurer, ledger and audit endpoint</h3>
        <p>The capped spending stack described on this site.</p>
      </article>
      <article>
        <div className="stage">Testnet only (Sepolia)</div>
        <h3>Confidential balances</h3>
        <p>
          Encrypted balances with access control, and a threshold check that
          reveals only whether a balance meets a limit. Built with Zama&apos;s
          open-source FHE libraries; no partnership or endorsement.
        </p>
      </article>
      <article>
        <div className="stage">Intent, not a commitment</div>
        <h3>Confidential spending limits</h3>
        <p>
          Enforce a fleet&apos;s limits without disclosing them, including to
          the agents spending against them.
        </p>
      </article>
    </div>
  );
}
