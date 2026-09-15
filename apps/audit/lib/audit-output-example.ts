import {
  buildSpendSummary,
  readLocalLedgerEvents,
  type SpendSummary,
} from "./spend-summary";

/** Treasurer wallet — must match published ledger / paid-call fixtures. */
export const AUDIT_EXAMPLE_WALLET =
  "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D";

/**
 * Bazaar `output.example` for GET/POST /api/audit.
 *
 * Derived at module load from local ledger files (`public/ledger/latest.json`
 * day files + `data/ledger.jsonl`) via `buildSpendSummary` — never hand-typed
 * payment counts or USDC totals, so the example cannot drift from the
 * published genesis/public ledger. Genesis-only (0 payments) is reflected
 * honestly when the ledger has no settled payments.
 */
export function buildAuditOutputExample(
  events = readLocalLedgerEvents(),
): SpendSummary {
  return buildSpendSummary(AUDIT_EXAMPLE_WALLET, events);
}

export const AUDIT_OUTPUT_EXAMPLE: SpendSummary = buildAuditOutputExample();
