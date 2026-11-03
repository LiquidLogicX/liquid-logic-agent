"use client";

import { useEffect, useState } from "react";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (ev: string, cb: (...a: unknown[]) => void) => void;
  removeListener?: (ev: string, cb: (...a: unknown[]) => void) => void;
};

function provider(): Eip1193 | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { ethereum?: Eip1193; okxwallet?: Eip1193 };
  return w.ethereum ?? w.okxwallet;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function goToFlow() {
  document.getElementById("bridge")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Hero for /bridge. Connecting here uses the same injected wallet as
 * BridgeSection (which listens for accountsChanged), so the flow below picks
 * up the account with no duplicated contract logic.
 */
export function BridgeHero() {
  const [account, setAccount] = useState<string>("");
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);
  const [err, setErr] = useState("");
  const [host, setHost] = useState("liquidlogicx.com/bridge");

  useEffect(() => {
    setHost(window.location.host + "/bridge");
    const p = provider();
    setHasWallet(!!p);
    if (!p) return;
    p.request({ method: "eth_accounts" })
      .then((a) => setAccount(((a as string[]) ?? [])[0] ?? ""))
      .catch(() => {});
    const on = (...a: unknown[]) => setAccount(((a[0] as string[]) ?? [])[0] ?? "");
    p.on?.("accountsChanged", on);
    return () => p.removeListener?.("accountsChanged", on);
  }, []);

  async function connect() {
    setErr("");
    const p = provider();
    if (!p) return;
    try {
      const a = (await p.request({ method: "eth_requestAccounts" })) as string[];
      setAccount(a?.[0] ?? "");
      setTimeout(goToFlow, 150);
    } catch (e) {
      setErr((e as Error).message || "Wallet connection was cancelled.");
    }
  }

  return (
    <section className="bl-hero">
      <div className="wrap">
        <span className="bl-badge">Beta</span>
        <h1>Liquid X Bridge</h1>
        <p className="bl-lede">Bridge $LLX across six chains. 
          Move $LLX V2 between Hyperliquid, Base, BNB Chain, Arc, Robinhood Chain and Tempo with
          LayerZero. Same amount, same address, on the other side.
        </p>

        {account ? (
          <div className="bl-cta">
            <span className="bl-connected">Connected {short(account)}</span>
            <button className="btn primary bl-btn" onClick={goToFlow}>Continue to bridge ↓</button>
          </div>
        ) : hasWallet === false ? (
          <div className="bl-cta">
            <p className="bl-hint">Open this page in your wallet&apos;s browser to connect:</p>
            <div className="bl-wallets">
              <a className="btn primary bl-btn" href={`https://metamask.app.link/dapp/${host}`}>Open in MetaMask</a>
              <a className="btn secondary bl-btn" href={`okx://wallet/dapp/url?dappUrl=${encodeURIComponent("https://" + host)}`}>Open in OKX Wallet</a>
            </div>
          </div>
        ) : (
          <div className="bl-cta">
            <button className="btn primary bl-btn" onClick={connect}>Connect Wallet</button>
            <p className="bl-hint">MetaMask or OKX Wallet, including their in-app browsers.</p>
          </div>
        )}
        {err && <p className="bl-err">{err}</p>}
      </div>
    </section>
  );
}
