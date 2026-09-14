/**
 * Assert bazaar output.example equals buildSpendSummary(local ledger).
 * Usage: LEDGER_SKIP_REMOTE=1 npx tsx scripts/check-example.ts
 */
import { AUDIT_OUTPUT_EXAMPLE } from "../lib/audit-output-example";
import { buildSpendSummary, readLocalLedgerEvents } from "../lib/spend-summary";

const wallet = AUDIT_OUTPUT_EXAMPLE.walletAddress;
const summary = buildSpendSummary(wallet, readLocalLedgerEvents());
const a = JSON.stringify(summary);
const b = JSON.stringify(AUDIT_OUTPUT_EXAMPLE);
if (a !== b) {
  console.error("example mismatch");
  console.error("built", a);
  console.error("example", b);
  process.exit(2);
}
console.log(
  JSON.stringify(
    {
      ok: true,
      paymentCount: summary.paymentCount,
      totalUsdc: summary.totalUsdc,
      destinations: summary.destinations.map((d) => d.endpoint),
    },
    null,
    2,
  ),
);
