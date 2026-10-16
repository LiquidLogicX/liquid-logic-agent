/** Pure helpers for the "Run test call" button (no browser APIs; unit-tested). */
export const DEFAULT_TEST_TOKEN = "0xB9Dd507a5b352783b25e14c9b6E77D9f0067380f"; // LLX
export const BASE_CHAIN_ID = 8453;
export const BASE_CHAIN_HEX = "0x2105";
const ADDR = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(v: string): boolean {
  return ADDR.test(v.trim());
}

export function lockStatusPath(token: string, chain = "all"): string {
  const t = token.trim();
  if (!isAddress(t)) throw new Error("Enter a valid token address (0x + 40 hex chars).");
  const q = new URLSearchParams({ token: t });
  if (chain && chain !== "all") q.set("chain", chain);
  return `/api/lock-status?${q.toString()}`;
}

export const DEFAULT_ESCROW_CHAIN = "base";
export const DEFAULT_ESCROW_ID = "1";

export function escrowStatusPath(chain = DEFAULT_ESCROW_CHAIN, id = DEFAULT_ESCROW_ID): string {
  const c = chain.trim().toLowerCase();
  const i = id.trim();
  if (!/^[a-z0-9-]{2,32}$/.test(c)) throw new Error("Enter a chain key like base, ethereum or arbitrum.");
  if (!/^[1-9][0-9]{0,11}$/.test(i)) throw new Error("Enter an escrow id (a positive whole number).");
  return `/api/escrow-status?${new URLSearchParams({ chain: c, id: i }).toString()}`;
}

export function basescanTx(tx: string): string {
  return `https://basescan.org/tx/${tx}`;
}

/** OKX Wallet universal deep link that opens this page inside the OKX in-app browser. */
export function okxDeepLink(pageUrl: string): string {
  const inner = `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(pageUrl)}`;
  return `https://www.okx.com/download?deeplink=${encodeURIComponent(inner)}`;
}

/** Pick the injected provider, preferring OKX's own injection. */
export function pickProvider(w: { okxwallet?: unknown; ethereum?: unknown } | undefined): unknown {
  if (!w) return undefined;
  return w.okxwallet ?? w.ethereum;
}

export function shortTx(tx: string): string {
  return tx.length > 14 ? `${tx.slice(0, 8)}…${tx.slice(-6)}` : tx;
}
