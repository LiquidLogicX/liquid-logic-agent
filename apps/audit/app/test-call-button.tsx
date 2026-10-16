"use client";
/**
 * "Run test call": pays $0.005 USDC on Base for /api/lock-status with the visitor's own wallet
 * (x402 exact scheme -> EIP-3009 transferWithAuthorization signature; the facilitator settles).
 * Works with injected wallets (OKX Wallet in-app browser, MetaMask, Coinbase Wallet browser).
 * Safe as a public demo: the visitor pays from their own wallet; no server keys are used here.
 */
import { useState, type ReactNode } from "react";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { base } from "viem/chains";
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import {
  BASE_CHAIN_HEX, DEFAULT_ESCROW_CHAIN, DEFAULT_ESCROW_ID, DEFAULT_TEST_TOKEN, basescanTx, escrowStatusPath,
  isAddress, lockStatusPath, okxDeepLink, pickProvider, shortTx,
} from "@/lib/test-call/core";

type Phase = "idle" | "connecting" | "paying" | "done" | "error";

const inputStyle = {
  display: "block", width: "100%", fontFamily: "monospace", fontSize: 14, padding: 8, margin: "6px 0 12px", boxSizing: "border-box",
} as const;

/** Shared wallet-signing flow + result display. `buildPath` throws a user-facing Error on bad input. */
function PaidCallSection({ title, price, buildPath, children }: {
  title: string; price: string; buildPath: () => string; children: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [tx, setTx] = useState<string | null>(null);
  const [noWallet, setNoWallet] = useState(false);

  async function run() {
    setMsg(""); setResult(null); setTx(null); setNoWallet(false);
    let path: string;
    try { path = buildPath(); } catch (e) { setPhase("error"); setMsg(e instanceof Error ? e.message : String(e)); return; }
    const provider = pickProvider(window as never) as EIP1193Provider | undefined;
    if (!provider) { setPhase("error"); setNoWallet(true); setMsg("No wallet found in this browser."); return; }
    try {
      setPhase("connecting");
      const [address] = (await provider.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_CHAIN_HEX }] });
      } catch { /* signing typed data does not strictly require Base to be active */ }
      const wallet = createWalletClient({ account: address, chain: base, transport: custom(provider) });
      const signer = toClientEvmSigner({
        address,
        signTypedData: (m) => wallet.signTypedData({ account: address, ...(m as object) } as never),
      });
      const client = new x402Client();
      registerExactEvmScheme(client, { signer });
      const payFetch = wrapFetchWithPayment(fetch, client);
      setPhase("paying");
      const res = await payFetch(path, { method: "GET" });
      const body = await res.json().catch(() => ({ error: "Non-JSON response" }));
      const header = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
      if (header) {
        try { const s = decodePaymentResponseHeader(header) as { transaction?: string }; if (s.transaction) setTx(s.transaction); } catch { /* ignore */ }
      }
      setResult(body);
      if (!res.ok) {
        let reason = "";
        if (res.status === 402) {
          // Signed retry was rejected: the facilitator's reason is in the PAYMENT-REQUIRED header (body is empty).
          const pr = res.headers.get("PAYMENT-REQUIRED");
          if (pr) {
            try { const d = JSON.parse(atob(pr)) as { error?: string }; if (d.error) reason = d.error; } catch { /* ignore */ }
          }
          const ar = res.headers.get("PAYMENT-RESPONSE");
          if (!reason && ar) {
            try { const d = decodePaymentResponseHeader(ar) as { errorReason?: string }; if (d.errorReason) reason = d.errorReason; } catch { /* ignore */ }
          }
        }
        setPhase("error");
        setMsg(`HTTP ${res.status}${reason ? `: ${reason}` : ""} (not charged for 4xx/5xx)`);
        return;
      }
      setPhase("done");
    } catch (e) {
      setPhase("error");
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = phase === "connecting" || phase === "paying";
  return (
    <section style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginTop: 24, maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {children}
      <button onClick={run} disabled={busy} style={{ padding: "10px 18px", fontSize: 16 }}>
        {phase === "connecting" ? "Connecting wallet…" : phase === "paying" ? "Approve signature in wallet…" : "Run test call"}
      </button>
      <p style={{ fontSize: 13, color: "#555" }}>
        Your wallet signs a USDC transfer authorization for {price} on Base. No gas needed; you are charged only if the call succeeds.
      </p>
      {msg && <p role="alert" style={{ color: phase === "error" ? "#b00" : undefined }}>{msg}</p>}
      {noWallet && (
        <p>On iPhone, <a href={okxDeepLink(typeof window !== "undefined" ? window.location.href : "https://audit.liquidlogicx.com/")}>open this page in OKX Wallet</a> (Discover → browser) and tap the button again.</p>
      )}
      {tx && <p>Settlement: <a href={basescanTx(tx)} target="_blank" rel="noreferrer">{shortTx(tx)} on BaseScan</a></p>}
      {result !== null && (
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#f6f6f6", padding: 12, fontSize: 12, maxHeight: 400, overflow: "auto" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </section>
  );
}

export default function TestCallButton() {
  const [token, setToken] = useState(DEFAULT_TEST_TOKEN);
  return (
    <PaidCallSection title="Try it: lock check ($0.005 USDC on Base)" price="$0.005"
      buildPath={() => lockStatusPath(token)}>
      <label htmlFor="tc-token">Token address</label>
      <input id="tc-token" value={token} onChange={(e) => setToken(e.target.value)} spellCheck={false}
        autoCapitalize="off" autoCorrect="off" style={inputStyle} />
    </PaidCallSection>
  );
}

export function EscrowTestCallButton() {
  const [chain, setChain] = useState(DEFAULT_ESCROW_CHAIN);
  const [id, setId] = useState(DEFAULT_ESCROW_ID);
  return (
    <PaidCallSection title="Try it: escrow check ($0.005 USDC on Base)" price="$0.005"
      buildPath={() => escrowStatusPath(chain, id)}>
      <label htmlFor="tc-esc-chain">Chain (e.g. base, ethereum, arbitrum)</label>
      <input id="tc-esc-chain" value={chain} onChange={(e) => setChain(e.target.value)} spellCheck={false}
        autoCapitalize="off" autoCorrect="off" style={inputStyle} />
      <label htmlFor="tc-esc-id">Escrow id</label>
      <input id="tc-esc-id" value={id} onChange={(e) => setId(e.target.value)} inputMode="numeric" spellCheck={false}
        style={inputStyle} />
    </PaidCallSection>
  );
}
