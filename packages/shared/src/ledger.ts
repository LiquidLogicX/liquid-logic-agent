/**
 * Append-only ledger event shapes (JSONL).
 * Framing: operating spend for services — never "treasury growth".
 */

export type LedgerEventType =
  | "allowance_set"
  | "top_up"
  | "revocation"
  | "payment"
  | "payment_failed"
  | "wallet_address"
  | "note";

export interface LedgerEventBase {
  type: LedgerEventType;
  timestamp: string;
  reason?: string;
  walletAddress?: string;
}

export interface AllowanceSetEvent extends LedgerEventBase {
  type: "allowance_set";
  maxPerPaymentUsdc: string;
  dailyCapUsdc: string;
  allowlist: string[];
}

export interface TopUpEvent extends LedgerEventBase {
  type: "top_up";
  amountUsdc: string;
  txHash?: string;
  basescanUrl?: string;
}

export interface RevocationEvent extends LedgerEventBase {
  type: "revocation";
  detail: string;
}

export interface PaymentEvent extends LedgerEventBase {
  type: "payment";
  endpoint: string;
  amountUsdc: string;
  asset: "USDC";
  network: "eip155:8453" | "eip155:84532";
  txHash?: string;
  basescanUrl?: string;
}

export interface PaymentFailedEvent extends LedgerEventBase {
  type: "payment_failed";
  endpoint: string;
  amountUsdc?: string;
  error: string;
}

export interface WalletAddressEvent extends LedgerEventBase {
  type: "wallet_address";
  walletAddress: string;
}

export interface NoteEvent extends LedgerEventBase {
  type: "note";
  message: string;
}

export type LedgerEvent =
  | AllowanceSetEvent
  | TopUpEvent
  | RevocationEvent
  | PaymentEvent
  | PaymentFailedEvent
  | WalletAddressEvent
  | NoteEvent;

export function isPaymentEvent(e: LedgerEvent): e is PaymentEvent {
  return e.type === "payment";
}
