import { isFrozenFromLedger } from "@liquid-logic/shared";
import type { LedgerStore } from "./ledger-store.js";

/** True when the ledger's latest freeze/unfreeze event is `frozen`. */
export function isPaymentsFrozen(ledger: LedgerStore): boolean {
  return isFrozenFromLedger(ledger.readAll());
}

export function recordFrozen(
  ledger: LedgerStore,
  reason = "Operator freeze — outbound payments halted",
): { type: "frozen"; timestamp: string; reason: string } {
  const event = {
    type: "frozen" as const,
    timestamp: new Date().toISOString(),
    reason,
  };
  ledger.append(event);
  return event;
}

export function recordUnfrozen(
  ledger: LedgerStore,
  reason = "Operator unfreeze — outbound payments resumed",
): { type: "unfrozen"; timestamp: string; reason: string } {
  const event = {
    type: "unfrozen" as const,
    timestamp: new Date().toISOString(),
    reason,
  };
  ledger.append(event);
  return event;
}
