import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BRIDGE_CHAINS,
  LLX_V2_TOKEN,
  encodeQuoteSend,
  encodeSend,
  formatUnits,
  parseAmount,
  readWord,
  removeDust,
} from "../lib/bridge";

const W = "0xd626a1ba375048d5630ea5f0ed939e4cf58838cc";
const TEN = 10n * 10n ** 18n;

// Reference: `cast calldata 'send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address)' ...`
const CAST_SEND =
  "0xc7c7f5b300000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000638587d762a80000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d626a1ba375048d5630ea5f0ed939e4cf58838cc000000000000000000000000000000000000000000000000000000000000769f000000000000000000000000d626a1ba375048d5630ea5f0ed939e4cf58838cc0000000000000000000000000000000000000000000000008ac7230489e800000000000000000000000000000000000000000000000000008ac7230489e8000000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

test("send calldata matches cast byte-for-byte", () => {
  assert.equal(encodeSend(30367, W, TEN, TEN, 109425160839848n, W), CAST_SEND);
});

test("quoteSend calldata has the right selector and shape", () => {
  const d = encodeQuoteSend(30367, W, TEN, TEN);
  assert.ok(d.startsWith("0x3b6f743b"));
  assert.equal((d.length - 10) / 64, 12);
});

test("six chains, unique EIDs, Tempo is receive-only on this page", () => {
  assert.equal(BRIDGE_CHAINS.length, 6);
  assert.deepEqual(
    BRIDGE_CHAINS.map((c) => c.eid).sort(),
    [30102, 30184, 30367, 30410, 30416, 30417],
  );
  assert.equal(BRIDGE_CHAINS.find((c) => c.id === "tempo")!.canSendFrom, false);
  assert.equal(LLX_V2_TOKEN, "0x72885fBFA330d1a8fA95880A85b73d699943053B");
});

test("amount parsing, dust removal and formatting", () => {
  assert.equal(parseAmount("10"), TEN);
  assert.equal(parseAmount("1.5"), 15n * 10n ** 17n);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount("1.0000000000000000001"), null);
  assert.equal(removeDust(1234567890123456789n), 1234567000000000000n);
  assert.equal(formatUnits(1000n * 10n ** 18n, 18, 2), "1,000");
  assert.equal(formatUnits(111253759284832n, 18, 6), "0.000111");
  assert.equal(formatUnits(111253759284832n, 18, 8), "0.00011125");
  assert.equal(readWord("0x" + "0".repeat(63) + "5" + "0".repeat(63) + "7", 1), 7n);
});
