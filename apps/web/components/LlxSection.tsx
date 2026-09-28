"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { llxLaunchStatus } from "@/lib/launch";
import {
  LLX_BASESCAN,
  LLX_CONTRACT,
  LLX_VIRTUALS,
} from "@/lib/site";

export function LlxSection() {
  const [status, setStatus] = useState(() => llxLaunchStatus());

  useEffect(() => {
    setStatus(llxLaunchStatus());
    const id = window.setInterval(() => {
      setStatus(llxLaunchStatus());
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="token-grid">
      <dl className="terms token-terms">
        <dt>Launch</dt>
        <dd>{status}</dd>
        <dt>Platform</dt>
        <dd>Virtuals, Base</dd>
        <dt>Total supply</dt>
        <dd>1,000,000,000</dd>
        <dt>Liquidity pool</dt>
        <dd>100% of supply</dd>
        <dt>Team allocation</dt>
        <dd>None</dd>
        <dt>Liquidity lock</dt>
        <dd>10 years after graduation</dd>
        <dt>Contract</dt>
        <dd>
          <div className="ca" style={{ justifyContent: "flex-end" }}>
            <a
              className="mono"
              href={LLX_BASESCAN}
              rel="noopener noreferrer"
              target="_blank"
            >
              {LLX_CONTRACT}
            </a>
            <CopyButton value={LLX_CONTRACT} />
          </div>
        </dd>
        <dt>Links</dt>
        <dd>
          <a href={LLX_BASESCAN} rel="noopener noreferrer" target="_blank">
            BaseScan
          </a>
          {" · "}
          <a href={LLX_VIRTUALS} rel="noopener noreferrer" target="_blank">
            Virtuals
          </a>
        </dd>
      </dl>
      <div className="disclosure">
        <h3>Please read</h3>
        <p>
          This is the only official $LLX contract. Check the address before
          buying.
        </p>
        <p>
          $LLX is not an investment product. No returns, yield, buybacks or
          price support are promised.
        </p>
        <p>
          The agent&apos;s spending and the endpoints settle in USDC only. The
          agent never buys, sells or holds $LLX, and the public ledger tracks
          USDC only.
        </p>
      </div>
    </div>
  );
}
