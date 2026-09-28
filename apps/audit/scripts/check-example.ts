/**
 * Assert bazaar output.example equals buildSpendSummary(local ledger)
 * and paymentCount/totalUsdc match published latest.json when present.
 * Usage: LEDGER_SKIP_REMOTE=1 npx tsx scripts/check-example.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  AUDIT_EXAMPLE_WALLET,
  AUDIT_OUTPUT_EXAMPLE,
  buildAuditOutputExample,
} from "../lib/audit-output-example";
import { buildSpendSummary, readLocalLedgerEvents } from "../lib/spend-summary";

const events = readLocalLedgerEvents();
const summary = buildSpendSummary(AUDIT_EXAMPLE_WALLET, events);
const derived = buildAuditOutputExample(events);
const a = JSON.stringify(summary);
const b = JSON.stringify(AUDIT_OUTPUT_EXAMPLE);
const c = JSON.stringify(derived);
if (a !== b || a !== c) {
  console.error("example mismatch (static export vs rebuild)");
  console.error("built", a);
  console.error("example", b);
  console.error("derived", c);
  process.exit(2);
}

const latestCandidates = [
  path.join(process.cwd(), "public/ledger/latest.json"),
  path.join(process.cwd(), "../../apps/web/public/ledger/latest.json"),
  path.join(process.cwd(), "../../public/ledger/latest.json"),
];
let latest: { totalPayments?: number; totalPaidUsdcApprox?: number } | null =
  null;
for (const p of latestCandidates) {
  if (!fs.existsSync(p)) continue;
  latest = JSON.parse(fs.readFileSync(p, "utf8")) as {
    totalPayments?: number;
    totalPaidUsdcApprox?: number;
  };
  break;
}
if (latest) {
  if (summary.paymentCount !== (latest.totalPayments ?? 0)) {
    console.error("paymentCount drift vs latest.json", {
      example: summary.paymentCount,
      latest: latest.totalPayments,
    });
    process.exit(2);
  }
  if (summary.totalUsdc !== (latest.totalPaidUsdcApprox ?? 0)) {
    console.error("totalUsdc drift vs latest.json", {
      example: summary.totalUsdc,
      latest: latest.totalPaidUsdcApprox,
    });
    process.exit(2);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      sourcedFrom: "readLocalLedgerEvents → buildSpendSummary",
      paymentCount: summary.paymentCount,
      totalUsdc: summary.totalUsdc,
      destinations: summary.destinations.map((d) => d.endpoint),
      matchesLatestJson: Boolean(latest),
    },
    null,
    2,
  ),
);
