/**
 * Settlement gate: a payment ledger row requires HTTP 2xx + a non-empty txHash.
 */

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

export function isNonEmptyTxHash(txHash: string | undefined | null): txHash is string {
  return typeof txHash === "string" && TX_HASH_RE.test(txHash.trim());
}

export function isHttpSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

export type SettlementCheck = {
  settled: boolean;
  txHash?: string;
  error?: string;
};

/** Require 2xx + extractable 0x…64 hash before writing type=payment. */
export function checkPaymentSettlement(opts: {
  status: number;
  txHash?: string | null;
}): SettlementCheck {
  const hash = opts.txHash?.trim();
  if (!isHttpSuccess(opts.status)) {
    return {
      settled: false,
      txHash: isNonEmptyTxHash(hash) ? hash : undefined,
      error: `HTTP ${opts.status}; settlement incomplete (need 2xx + txHash)`,
    };
  }
  if (!isNonEmptyTxHash(hash)) {
    return {
      settled: false,
      error: "Missing or empty txHash after x402 settlement (refusing payment ledger row)",
    };
  }
  return { settled: true, txHash: hash };
}
