/**
 * Focused assert: payment settlement gate + recordPayment refuse without hash.
 * Run: npx tsx scripts/assert-payment-requires-hash.mts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LedgerStore } from "../src/lib/ledger-store.js";
import {
  checkPaymentSettlement,
  isNonEmptyTxHash,
} from "../src/lib/payment-settlement.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const good =
  "0x5ae8ef780242dfd2f03a9f52a58fcec71a45e6aae6eb4b3a96107698c92411ea";

assert(isNonEmptyTxHash(good), "valid hash accepted");
assert(!isNonEmptyTxHash(""), "empty rejected");
assert(!isNonEmptyTxHash(undefined), "undefined rejected");
assert(!isNonEmptyTxHash("0xabc"), "short rejected");

assert(
  checkPaymentSettlement({ status: 200, txHash: good }).settled,
  "2xx+hash settled",
);
assert(
  !checkPaymentSettlement({ status: 200, txHash: undefined }).settled,
  "2xx without hash not settled",
);
assert(
  !checkPaymentSettlement({ status: 502, txHash: good }).settled,
  "non-2xx not settled even with hash",
);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llx-ledger-"));
const file = path.join(dir, "ledger.jsonl");
const ledger = new LedgerStore(file);

let threw = false;
try {
  ledger.recordPayment({
    endpoint: "https://example.com/pay",
    amountUsdc: "0.05",
    network: "eip155:8453",
    // intentionally no txHash
  });
} catch {
  threw = true;
}
assert(threw, "recordPayment must throw without txHash");
assert(ledger.readAll().length === 0, "no payment row written without hash");

const added = ledger.recordPayment({
  endpoint: "https://example.com/pay",
  amountUsdc: "0.05",
  network: "eip155:8453",
  txHash: good,
  walletAddress: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D",
});
assert(added, "payment with hash appended");
const rows = ledger.readAll();
assert(rows.length === 1 && rows[0]!.type === "payment", "one payment row");
assert(
  "txHash" in rows[0]! && rows[0]!.txHash === good,
  "payment row has txHash",
);

fs.rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, checks: "payment settlement + recordPayment gate" }));
