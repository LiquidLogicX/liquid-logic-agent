"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BRIDGE_CHAINS,
  LAYERZERO_SCAN_TX,
  LLX_V2_TOKEN,
  SEL,
  chainByChainId,
  chainById,
  encodeBalanceOf,
  encodeQuoteSend,
  encodeSend,
  encodeUint32Call,
  explorerTx,
  formatUnits,
  parseAmount,
  readWord,
  removeDust,
  toHex,
  type BridgeChain,
} from "@/lib/bridge";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (ev: string, cb: (...a: unknown[]) => void) => void;
  removeListener?: (ev: string, cb: (...a: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193;
    okxwallet?: Eip1193;
  }
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000001";

function getProvider(): Eip1193 | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum ?? window.okxwallet;
}

async function rpc(chain: BridgeChain, method: string, params: unknown[]): Promise<string> {
  let lastErr: Error = new Error("RPC error");
  for (const url of [chain.rpc, ...(chain.rpcFallbacks ?? [])]) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`RPC ${res.status}`);
      const j = (await res.json()) as { result?: string; error?: { message?: string; data?: string } };
      if (j.error) {
        // A contract revert is a real answer: don't retry it on another RPC.
        if (j.error.data || /revert/i.test(j.error.message || "")) throw Object.assign(new Error(j.error.message || "reverted"), { final: true });
        throw new Error(j.error.message || "RPC error");
      }
      if (typeof j.result !== "string") throw new Error("RPC error");
      return j.result;
    } catch (e) {
      lastErr = e as Error;
      if ((e as { final?: boolean }).final) throw e;
    }
  }
  throw lastErr;
}

async function rpcRaw(chain: BridgeChain, method: string, params: unknown[]): Promise<unknown> {
  for (const url of [chain.rpc, ...(chain.rpcFallbacks ?? [])]) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as { result?: unknown; error?: unknown };
      if (!j.error) return j.result ?? null;
    } catch {}
  }
  return null;
}

const call = (chain: BridgeChain, data: string, from?: string) =>
  rpc(chain, "eth_call", [{ to: LLX_V2_TOKEN, data, ...(from ? { from } : {}) }, "latest"]);

type RouteInfo =
  | { state: "loading" }
  | { state: "soon"; reason: string }
  | { state: "open"; canSend: bigint; canReceive: bigint };

type Quote = { amount: bigint; fee: bigint } | null;

type Status =
  | { kind: "idle" }
  | { kind: "busy"; text: string }
  | { kind: "error"; text: string }
  | { kind: "sent"; hash: string; from: BridgeChain; to: BridgeChain; confirmed?: boolean; failed?: boolean };

function walletError(e: unknown): string {
  const err = e as { code?: number; message?: string; shortMessage?: string };
  if (err?.code === 4001) return "You cancelled the request in your wallet.";
  const m = err?.shortMessage || err?.message || "Something went wrong.";
  return m.length > 180 ? m.slice(0, 180) + "…" : m;
}

export function BridgeSection() {
  const sendable = BRIDGE_CHAINS.filter((c) => c.canSendFrom);
  const [fromId, setFromId] = useState("base");
  const [toId, setToId] = useState("hyperevm");
  const [amountText, setAmountText] = useState("");
  const [account, setAccount] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [route, setRoute] = useState<RouteInfo>({ state: "loading" });
  const [quote, setQuote] = useState<Quote>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pageUrl, setPageUrl] = useState("https://liquidlogicx.com/#bridge");
  const quoteSeq = useRef(0);

  const from = chainById(fromId)!;
  const to = chainById(toId)!;
  const amount = useMemo(() => {
    const v = parseAmount(amountText);
    return v === null ? null : removeDust(v);
  }, [amountText]);

  // Wallet detection + listeners
  useEffect(() => {
    setPageUrl(window.location.href.split("#")[0] + "#bridge");
    // in-app browsers sometimes inject a moment after load
    const t = setTimeout(() => setHasProvider(!!getProvider()), 400);
    setHasProvider(!!getProvider());
    const p = getProvider();
    if (!p) return () => clearTimeout(t);
    const onAcc = (...a: unknown[]) => {
      const list = a[0] as string[] | undefined;
      setAccount(list && list[0] ? list[0] : null);
    };
    const onChain = (...a: unknown[]) => setWalletChainId(Number(a[0] as string));
    p.request({ method: "eth_accounts" })
      .then((r) => onAcc(r))
      .catch(() => {});
    p.request({ method: "eth_chainId" })
      .then((r) => onChain(r))
      .catch(() => {});
    p.on?.("accountsChanged", onAcc);
    p.on?.("chainChanged", onChain);
    return () => {
      clearTimeout(t);
      p.removeListener?.("accountsChanged", onAcc);
      p.removeListener?.("chainChanged", onChain);
    };
  }, []);

  // Keep from/to distinct
  useEffect(() => {
    if (fromId === toId) {
      const alt = BRIDGE_CHAINS.find((c) => c.id !== fromId);
      if (alt) setToId(alt.id);
    }
  }, [fromId, toId]);

  // Route check: peer set, daily limits
  useEffect(() => {
    let live = true;
    setRoute({ state: "loading" });
    setQuote(null);
    (async () => {
      if (!from.canSendFrom) return setRoute({ state: "soon", reason: from.note || "Coming soon" });
      try {
        const [peer, out, inb] = await Promise.all([
          call(from, encodeUint32Call(SEL.peers, to.eid)),
          call(from, encodeUint32Call(SEL.getAmountCanBeSent, to.eid)),
          call(to, encodeUint32Call(SEL.inboundCanBeReceived, from.eid)),
        ]);
        const peerAddr = "0x" + peer.slice(-40);
        if (BigInt(peer) === 0n || peerAddr.toLowerCase() !== LLX_V2_TOKEN.toLowerCase()) {
          if (live) setRoute({ state: "soon", reason: "This route is not connected yet." });
          return;
        }
        const canSend = readWord(out, 1);
        const canReceive = readWord(inb, 0);
        if (live) {
          if (canSend === 0n && canReceive === 0n) {
            setRoute({ state: "soon", reason: "This route is not open yet." });
          } else {
            setRoute({ state: "open", canSend, canReceive });
          }
        }
      } catch {
        if (live) setRoute({ state: "soon", reason: "We couldn't check this route right now." });
      }
    })();
    return () => {
      live = false;
    };
  }, [from, to, status.kind === "sent"]); // re-check limits after a send

  // Balance on the From chain
  const loadBalance = useCallback(async () => {
    if (!account) return setBalance(null);
    try {
      setBalance(readWord(await call(from, encodeBalanceOf(account)), 0));
    } catch {
      setBalance(null);
    }
  }, [account, from]);
  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  const maxSendable = useMemo(() => {
    if (route.state !== "open") return 0n;
    let m = route.canSend < route.canReceive ? route.canSend : route.canReceive;
    if (balance !== null && balance < m) m = balance;
    return removeDust(m);
  }, [route, balance]);

  // Fee quote (debounced)
  useEffect(() => {
    setQuoteErr(null);
    if (route.state !== "open" || !amount || amount === 0n) {
      setQuote(null);
      return;
    }
    const seq = ++quoteSeq.current;
    const t = setTimeout(async () => {
      try {
        const recipient = account || ZERO_ADDR;
        const r = await call(from, encodeQuoteSend(to.eid, recipient, amount, amount), recipient);
        if (seq === quoteSeq.current) setQuote({ amount, fee: readWord(r, 0) });
      } catch {
        if (seq === quoteSeq.current) {
          setQuote(null);
          setQuoteErr("Couldn't get a fee quote for this route right now.");
        }
      }
    }, 350);
    return () => clearTimeout(t);
  }, [amount, route, from, to, account]);

  async function connect() {
    const p = getProvider();
    if (!p) return;
    setStatus({ kind: "busy", text: "Check your wallet…" });
    try {
      const acc = (await p.request({ method: "eth_requestAccounts" })) as string[];
      setAccount(acc[0] ?? null);
      setWalletChainId(Number(await p.request({ method: "eth_chainId" })));
      setStatus({ kind: "idle" });
    } catch (e) {
      setStatus({ kind: "error", text: walletError(e) });
    }
  }

  async function switchChain() {
    const p = getProvider();
    if (!p) return;
    const chainIdHex = "0x" + from.chainId.toString(16);
    setStatus({ kind: "busy", text: `Switching your wallet to ${from.name}…` });
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
    } catch (e) {
      const code = (e as { code?: number; data?: { originalError?: { code?: number } } })?.code;
      const inner = (e as { data?: { originalError?: { code?: number } } })?.data?.originalError?.code;
      if (code === 4902 || inner === 4902 || code === -32603) {
        try {
          await p.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: chainIdHex,
                chainName: from.name,
                nativeCurrency: from.native,
                rpcUrls: [from.rpc],
                blockExplorerUrls: [from.explorer],
              },
            ],
          });
        } catch (e2) {
          return setStatus({ kind: "error", text: walletError(e2) });
        }
      } else {
        return setStatus({ kind: "error", text: walletError(e) });
      }
    }
    try {
      setWalletChainId(Number(await p.request({ method: "eth_chainId" })));
    } catch {}
    setStatus({ kind: "idle" });
  }

  async function bridge() {
    const p = getProvider();
    if (!p || !account || !amount || route.state !== "open") return;
    if (amount > maxSendable) {
      return setStatus({ kind: "error", text: "That's more than you can bridge on this route right now." });
    }
    setStatus({ kind: "busy", text: "Getting a fresh fee quote…" });
    try {
      const r = await call(from, encodeQuoteSend(to.eid, account, amount, amount), account);
      const fee = readWord(r, 0);
      setQuote({ amount, fee });
      // OFT requires msg.value == fee.nativeFee. Pad 5% so a small gas move between quote and
      // confirmation can't revert; LayerZero refunds anything unused to the sender.
      const payFee = (fee * 105n) / 100n;
      const data = encodeSend(to.eid, account, amount, amount, payFee, account);
      setStatus({ kind: "busy", text: "Confirm the bridge in your wallet…" });
      const hash = (await p.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: LLX_V2_TOKEN, data, value: toHex(payFee) }],
      })) as string;
      setStatus({ kind: "sent", hash, from, to });
      setAmountText("");
      void watchReceipt(hash, from, to);
    } catch (e) {
      setStatus({ kind: "error", text: walletError(e) });
    }
  }

  async function watchReceipt(hash: string, src: BridgeChain, dst: BridgeChain) {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const raw = await rpcRaw(src, "eth_getTransactionReceipt", [hash]);
        const j = { result: raw as { status?: string } | null };
        if (j.result && j.result.status) {
          const ok = j.result.status === "0x1";
          setStatus({ kind: "sent", hash, from: src, to: dst, confirmed: ok, failed: !ok });
          void loadBalance();
          return;
        }
      } catch {}
    }
  }

  const onWrongChain = account !== null && walletChainId !== null && walletChainId !== from.chainId;
  const busy = status.kind === "busy";
  const routeSoon = route.state === "soon";
  const overMax = amount !== null && route.state === "open" && amount > maxSendable && balance !== null;

  let primary: { label: string; onClick?: () => void; disabled: boolean; soon?: boolean };
  if (routeSoon) primary = { label: "Coming soon", disabled: true, soon: true };
  else if (hasProvider === false) primary = { label: "Open in a wallet app", disabled: true };
  else if (!account) primary = { label: "Connect wallet", onClick: connect, disabled: busy };
  else if (onWrongChain) primary = { label: `Switch to ${from.name}`, onClick: switchChain, disabled: busy };
  else if (route.state === "loading") primary = { label: "Checking route…", disabled: true };
  else if (!amount || amount === 0n) primary = { label: "Enter an amount", disabled: true };
  else if (overMax) primary = { label: "Amount too high", disabled: true };
  else if (!quote || quote.amount !== amount) primary = { label: "Getting fee…", disabled: true };
  else primary = { label: `Bridge to ${to.name}`, onClick: bridge, disabled: busy };

  const host = pageUrl.replace(/^https?:\/\//, "");

  return (
    <section className="block" id="bridge">
      <div className="wrap sec-head">
        <div>
          <h2>Bridge $LLX</h2>
          <p className="intro">
            Move $LLX V2 between its six chains with LayerZero. You receive the same amount at the
            same address on the other chain. You pay only the LayerZero fee, in the From chain&apos;s
            gas token.
          </p>
          <p className="note">
            Each route has a daily limit set by the LLX V2 Vault (2-of-3 multi-sig). Your wallet
            sends the fee plus a 5% buffer; LayerZero refunds what isn&apos;t used. Delivery usually
            takes a few minutes. Track it on LayerZero Scan.
          </p>
        </div>

        <div className="bridge-card">
          <div className="bridge-row">
            <label>
              <span>From</span>
              <select value={fromId} onChange={(e) => setFromId(e.target.value)} disabled={busy}>
                {BRIDGE_CHAINS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.canSendFrom ? "" : " (coming soon)"}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="bridge-flip"
              aria-label="Swap From and To"
              disabled={busy || !to.canSendFrom}
              onClick={() => {
                setFromId(toId);
                setToId(fromId);
              }}
            >
              ⇄
            </button>
            <label>
              <span>To</span>
              <select value={toId} onChange={(e) => setToId(e.target.value)} disabled={busy}>
                {BRIDGE_CHAINS.filter((c) => c.id !== fromId).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="bridge-amount">
            <span>Amount</span>
            <div className="bridge-amount-in">
              <input
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.0"
                value={amountText}
                disabled={busy || routeSoon}
                onChange={(e) => setAmountText(e.target.value.replace(/[^0-9.,]/g, ""))}
              />
              <span className="bridge-unit">$LLX</span>
              <button
                type="button"
                className="bridge-max"
                disabled={busy || routeSoon || !account || maxSendable === 0n}
                onClick={() => setAmountText(formatUnits(maxSendable, 18, 6).replace(/,/g, ""))}
              >
                Max
              </button>
            </div>
          </label>

          <dl className="bridge-facts">
            <div>
              <dt>Your balance on {from.name}</dt>
              <dd className="mono">{account ? (balance === null ? "…" : `${formatUnits(balance)} $LLX`) : "Connect wallet"}</dd>
            </div>
            <div>
              <dt>Route limit left today</dt>
              <dd className="mono">
                {route.state === "open"
                  ? `${formatUnits(route.canSend < route.canReceive ? route.canSend : route.canReceive, 18, 2)} $LLX`
                  : route.state === "loading"
                    ? "…"
                    : "Coming soon"}
              </dd>
            </div>
            <div>
              <dt>LayerZero fee</dt>
              <dd className="mono">
                {quote && amount && quote.amount === amount
                  ? `${formatUnits(quote.fee, from.native.decimals, 8)} ${from.native.symbol}`
                  : quoteErr
                    ? "Unavailable"
                    : "—"}
              </dd>
            </div>
          </dl>

          {routeSoon && route.state === "soon" ? (
            <p className="bridge-msg soon" role="status">
              {from.name} → {to.name}: {route.reason}
            </p>
          ) : null}
          {quoteErr && !routeSoon ? <p className="bridge-msg err">{quoteErr}</p> : null}

          <button
            type="button"
            className={`btn primary bridge-go${primary.soon ? " is-soon" : ""}`}
            disabled={primary.disabled}
            onClick={primary.onClick}
          >
            {primary.label}
          </button>

          {hasProvider === false ? (
            <div className="bridge-open">
              <p>Open this page in your wallet&apos;s browser to bridge:</p>
              <div className="actions">
                <a className="btn secondary" href={`https://metamask.app.link/dapp/${host}`}>
                  Open in MetaMask
                </a>
                <a className="btn secondary" href={`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(pageUrl)}`}>
                  Open in OKX Wallet
                </a>
              </div>
            </div>
          ) : null}

          {account ? (
            <p className="bridge-acct mono">
              {account.slice(0, 6)}…{account.slice(-4)}
              {walletChainId ? ` · ${chainByChainId(walletChainId)?.name ?? `chain ${walletChainId}`}` : ""}
            </p>
          ) : null}

          {status.kind === "busy" ? <p className="bridge-msg" role="status">{status.text}</p> : null}
          {status.kind === "error" ? <p className="bridge-msg err" role="alert">{status.text}</p> : null}
          {status.kind === "sent" ? (
            <div className="bridge-msg ok" role="status">
              <p>
                {status.failed
                  ? `The transaction failed on ${status.from.name}. Nothing was bridged.`
                  : status.confirmed
                    ? `Sent from ${status.from.name}. Your $LLX arrives on ${status.to.name} after LayerZero delivers it (usually a few minutes).`
                    : `Submitted on ${status.from.name}. Waiting for confirmation…`}
              </p>
              <p className="bridge-links">
                <a href={LAYERZERO_SCAN_TX(status.hash)} target="_blank" rel="noopener noreferrer">
                  Track on LayerZero Scan
                </a>
                {" · "}
                <a href={explorerTx(status.from, status.hash)} target="_blank" rel="noopener noreferrer">
                  View on {status.from.name} explorer
                </a>
              </p>
            </div>
          ) : null}

          <p className="bridge-token mono">
            $LLX V2: {LLX_V2_TOKEN.slice(0, 8)}…{LLX_V2_TOKEN.slice(-6)} (same on all six chains)
          </p>
        </div>
      </div>
    </section>
  );
}
