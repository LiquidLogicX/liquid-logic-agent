export type LedgerPayment = {
  type?: string;
  timestamp: string;
  endpoint?: string;
  amountUsdc: string;
  asset?: string;
  network?: string;
  txHash?: string;
  basescanUrl?: string;
  walletAddress?: string;
  reason?: string;
  holdId?: string;
  approvedBy?: string;
  message?: string;
  error?: string;
};

/** Non-payment / takeover event shown distinctly on the public ledger. */
export type LedgerEventRow = {
  type: string;
  timestamp: string;
  endpoint?: string;
  amountUsdc?: string;
  asset?: string;
  network?: string;
  txHash?: string;
  basescanUrl?: string;
  walletAddress?: string;
  reason?: string;
  holdId?: string;
  approvedBy?: string;
  message?: string;
  error?: string;
};

export type LedgerLatest = {
  generatedAt?: string;
  network?: string;
  asset?: string;
  walletAddress?: string | null;
  totalEvents?: number;
  totalPayments?: number;
  totalPaidUsdcApprox?: number;
  days?: string[];
  today?: string;
  recentPayments?: LedgerPayment[];
  /** Last N events of any type (preferred for UI that shows holds / freeze). */
  recentEvents?: LedgerEventRow[];
};

export function shortAddr(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function basescanAddress(addr: string): string {
  return `https://basescan.org/address/${addr}`;
}

export function paymentBasescan(p: {
  basescanUrl?: string;
  txHash?: string;
  network?: string;
}): string | undefined {
  if (p.basescanUrl) return p.basescanUrl;
  if (p.txHash) {
    if (p.network === "eip155:5042") {
      return `https://explorer.arc.io/tx/${p.txHash}`;
    }
    return `https://basescan.org/tx/${p.txHash}`;
  }
  return undefined;
}

/** Alias — explorer link selected off network (BaseScan or Arc). */
export const paymentExplorer = paymentBasescan;

const NON_PAYMENT_TYPES = new Set([
  "held",
  "denied",
  "expired",
  "frozen",
  "unfrozen",
  "payment_failed",
  "wallet_address",
  "top_up",
  "note",
  "allowance_set",
  "revocation",
]);

export function isNonPaymentType(type: string | undefined): boolean {
  if (!type) return false;
  return type !== "payment" && NON_PAYMENT_TYPES.has(type);
}

export function eventTypeLabel(type: string): string {
  switch (type) {
    case "held":
      return "Held";
    case "denied":
      return "Denied";
    case "expired":
      return "Expired";
    case "frozen":
      return "Frozen";
    case "unfrozen":
      return "Unfrozen";
    case "payment_failed":
      return "Payment failed";
    case "top_up":
      return "Top-up";
    case "wallet_address":
      return "Wallet";
    case "payment":
      return "Payment";
    case "note":
      return "Note";
    default:
      return type;
  }
}


/** Short destination for UI: host · last path segment (full URL stays in title/tooltip). */
export function endpointShortLabel(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    return last ? `${u.host} · ${last}` : u.host;
  } catch {
    return endpoint;
  }
}

export function isSelfTestReason(reason: string | undefined): boolean {
  return reason === "self-test";
}

/** Cache-busting fetch for published ledger JSON (proof page must not serve stale CDN). */
export async function fetchLedgerLatest(
  base = "",
): Promise<LedgerLatest | null> {
  const bust = `t=${Date.now()}`;
  const url = `${base}/ledger/latest.json?${bust}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  if (!res.ok) return null;
  return (await res.json()) as LedgerLatest;
}
