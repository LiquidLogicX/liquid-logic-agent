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
};

export function shortAddr(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function basescanAddress(addr: string): string {
  return `https://basescan.org/address/${addr}`;
}

export function paymentBasescan(p: LedgerPayment): string | undefined {
  if (p.basescanUrl) return p.basescanUrl;
  if (p.txHash) return `https://basescan.org/tx/${p.txHash}`;
  return undefined;
}
