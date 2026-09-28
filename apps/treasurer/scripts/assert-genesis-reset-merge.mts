/**
 * Assert: disk JSONL with pre-reset payments + remote with LAUNCH_GENESIS_RESET
 * → merged public ledger has 0 pre-reset payments (genesis + post-reset only).
 *
 * Run: npx tsx scripts/assert-genesis-reset-merge.mts
 */
import {
  isPaymentEvent,
  mergeLedgerEvents,
  parseLedgerJsonl,
  serializeLedgerJsonl,
} from "@liquid-logic/shared";
import { mergeLedgerForGitHubPush } from "../src/lib/sync-ledger-github.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const MARKER_TS = "2026-09-15T04:16:00.000Z";

const remoteJsonl = [
  {
    type: "wallet_address",
    timestamp: "2026-09-13T14:11:07.316Z",
    walletAddress: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D",
    reason: "CDP-managed x402 payer address",
  },
  {
    type: "top_up",
    timestamp: "2026-09-13T15:20:07.000Z",
    amountUsdc: "5.00",
    txHash:
      "0x86725a32173f31957011a2a7b6a8136d48ed8074ac436396472adf3b7ce96310",
    basescanUrl:
      "https://basescan.org/tx/0x86725a32173f31957011a2a7b6a8136d48ed8074ac436396472adf3b7ce96310",
    reason: "USDC top-up from OKX (on-chain funding tx)",
  },
  {
    type: "note",
    timestamp: MARKER_TS,
    message: "LAUNCH_GENESIS_RESET",
    reason:
      "Day-one launch truncate — prefer this remote over longer Render disk until disk is wiped",
  },
]
  .map((e) => JSON.stringify(e))
  .join("\n");

// Longer Render disk: pre-reset phantom payments + one post-reset payment
const diskJsonl = [
  {
    type: "wallet_address",
    timestamp: "2026-09-13T14:11:07.316Z",
    walletAddress: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D",
  },
  {
    type: "payment",
    timestamp: "2026-09-13T15:23:37.000Z",
    endpoint: "https://audit.liquidlogicx.com/api/audit",
    amountUsdc: "0.001",
    asset: "USDC",
    network: "eip155:8453",
    txHash:
      "0x4f940314772fc825f077caa13d36debea8f5dac4843d93e6b8cb740b3d1fb7fe",
  },
  {
    type: "payment",
    timestamp: "2026-09-14T01:07:28.169Z",
    endpoint: "https://audit.liquidlogicx.com/api/audit",
    amountUsdc: "0.05",
    asset: "USDC",
    network: "eip155:8453",
    txHash:
      "0xa2013bf05ced393b8a678debd04711189cbded68fb57063bc80d28fd4cddbe90",
  },
  {
    type: "payment",
    timestamp: "2026-09-14T17:53:42.894Z",
    endpoint: "https://audit.liquidlogicx.com/api/audit",
    amountUsdc: "0.05",
    asset: "USDC",
    network: "eip155:8453",
    txHash:
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
  {
    type: "payment",
    timestamp: "2026-09-15T12:00:00.000Z",
    endpoint: "https://audit.liquidlogicx.com/api/audit",
    amountUsdc: "0.05",
    asset: "USDC",
    network: "eip155:8453",
    txHash:
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  },
]
  .map((e) => JSON.stringify(e))
  .join("\n");

const remoteEvents = parseLedgerJsonl(remoteJsonl);
const localEvents = parseLedgerJsonl(diskJsonl);

assert(remoteEvents.length === 3, "remote genesis has 3 events");
assert(
  localEvents.filter(isPaymentEvent).length === 4,
  "disk has 4 payments (3 pre + 1 post)",
);

const naive = mergeLedgerEvents(remoteEvents, localEvents);
assert(
  naive.filter(isPaymentEvent).length === 4,
  "sanity: naive union would include all 4 payments",
);

const { merged, markerTimestamp, droppedLocal } = mergeLedgerForGitHubPush(
  remoteEvents,
  localEvents,
);

assert(markerTimestamp === MARKER_TS, `marker ts ${markerTimestamp}`);
assert(droppedLocal >= 3, `dropped at least 3 local pre-marker, got ${droppedLocal}`);

const payments = merged.filter(isPaymentEvent);
assert(
  payments.length === 1,
  `public/merged must have exactly 1 payment (post-reset), got ${payments.length}`,
);
assert(
  payments[0]!.timestamp >= MARKER_TS,
  "sole payment must be at/after marker",
);
assert(
  payments[0]!.txHash ===
    "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "sole payment is the post-reset one",
);

const preResetPayments = payments.filter((p) => p.timestamp < MARKER_TS);
assert(preResetPayments.length === 0, "0 pre-reset payments in merged ledger");

assert(
  merged.some((e) => e.type === "wallet_address"),
  "wallet_address retained from remote",
);
assert(merged.some((e) => e.type === "top_up"), "top_up retained from remote");
assert(
  merged.some(
    (e) =>
      e.type === "note" &&
      "message" in e &&
      String((e as { message: string }).message).includes("LAUNCH_GENESIS_RESET"),
  ),
  "reset marker retained",
);

assert(
  parseLedgerJsonl(serializeLedgerJsonl(localEvents)).filter(isPaymentEvent)
    .length === 4,
  "disk snapshot still has all 4 payments (untouched by merge helper)",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      markerTimestamp,
      droppedLocal,
      mergedEvents: merged.length,
      mergedPayments: payments.length,
      preResetPayments: 0,
      rule: "exclude local events with timestamp < LAUNCH_GENESIS_RESET marker; disk untouched",
    },
    null,
    2,
  ),
);
