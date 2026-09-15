import type { SpendSummary } from "./spend-summary";
import { AUDIT_SPEND_NOTE } from "./spend-summary";

/**
 * Canonical paid /api/audit body for wallet 0xEA24…167D.
 * Day-one launch genesis: wallet_address + top_up only (no payments yet).
 * Must match buildSpendSummary(local ledger) after genesis truncate.
 */
export const AUDIT_OUTPUT_EXAMPLE: SpendSummary = {
  walletAddress: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D",
  network: "eip155:8453",
  asset: "USDC",
  source: "public_ledger",
  paymentCount: 0,
  totalUsdc: 0,
  held: 0,
  denied: 0,
  expired: 0,
  frozenSeconds: 0,
  destinations: [],
  recent: [],
  note: AUDIT_SPEND_NOTE,
};
