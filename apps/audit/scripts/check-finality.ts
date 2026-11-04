/**
 * Pure Base finality tests for /api/prove. Same rule as the recorder:
 * age >= 60s OR block <= L1-safe head, AND a 300-block floor.
 * Offline. Run via `npm run check-prove -w @liquid-logic/audit`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIN_BASE_CONFIRMATIONS, MIN_BASE_SETTLEMENT_SECONDS } from "../lib/prove/config";
import { assessBaseFinality } from "../lib/prove/finality";

const BLOCK = 1_000n;
const T0 = 1_700_000_000n;

function gate(over: Partial<Parameters<typeof assessBaseFinality>[0]> = {}) {
  return assessBaseFinality({
    blockNumber: BLOCK,
    blockTimestamp: T0,
    head: BLOCK + 11n,
    headTimestamp: T0 + 2n,
    safeHead: BLOCK - 1n,
    ...over,
  });
}

describe("assessBaseFinality (Denim: 60s or L1-safe, 300-block floor)", () => {
  it("uses a 60s age and a 300-block floor", () => {
    assert.equal(MIN_BASE_SETTLEMENT_SECONDS, 60);
    assert.equal(MIN_BASE_CONFIRMATIONS, 300);
  });

  it("rejects 12 confirmations that are only ~2s old (the old 2s-block wait)", () => {
    const d = gate();
    assert.equal(d.settled, false);
    if (!d.settled) {
      assert.equal(d.confirmations, 12n);
      assert.match(d.message, /2s old/);
      assert.match(d.message, /L1-safe head 999/);
      assert.match(d.message, /need at least 300/);
      // 60 - 2, not (12 - 12) * 2 + 2.
      assert.equal(d.retryAfterSeconds, 58);
    }
  });

  it("rejects 59 seconds even with the floor met", () => {
    const d = gate({
      head: BLOCK + 299n,
      headTimestamp: T0 + 59n,
      safeHead: BLOCK - 1n,
    });
    assert.equal(d.settled, false);
    if (!d.settled) {
      assert.match(d.message, /59s old/);
      assert.equal(d.retryAfterSeconds, 1);
      assert.doesNotMatch(d.message, /confirmation/);
    }
  });

  it("accepts exactly 60 seconds once 300 confirmations exist", () => {
    const d = gate({
      head: BLOCK + 299n,
      headTimestamp: T0 + BigInt(MIN_BASE_SETTLEMENT_SECONDS),
      safeHead: null,
    });
    assert.deepEqual(d, { settled: true, confirmations: 300n, via: "time" });
  });

  it("keeps the 300-block floor on top of time", () => {
    const d = gate({
      head: BLOCK + 29n,
      headTimestamp: T0 + 60n,
      safeHead: null,
    });
    assert.equal(d.settled, false);
    if (!d.settled) {
      assert.match(d.message, /30 confirmation\(s\)/);
      assert.match(d.message, /need at least 300/);
      assert.doesNotMatch(d.message, /L1-safe/);
      // Observed cadence is 60s / 29 blocks, not a hardcoded 2s.
      assert.equal(d.retryAfterSeconds, 559);
    }
  });

  it("accepts a young block at the L1-safe head once the floor is met", () => {
    const d = gate({
      head: BLOCK + 299n,
      headTimestamp: T0 + 1n,
      safeHead: BLOCK,
    });
    assert.deepEqual(d, { settled: true, confirmations: 300n, via: "l1-safe" });
  });

  it("accepts a young block strictly behind the L1-safe head", () => {
    const d = gate({
      head: BLOCK + 399n,
      headTimestamp: T0 + 1n,
      safeHead: BLOCK + 1n,
    });
    assert.equal(d.settled, true);
    if (d.settled) assert.equal(d.via, "l1-safe");
  });

  it("does not let L1-safe skip the 300-block floor", () => {
    const d = gate({
      head: BLOCK + 10n,
      headTimestamp: T0 + 1n,
      safeHead: BLOCK,
    });
    assert.equal(d.settled, false);
    if (!d.settled) {
      assert.match(d.message, /11 confirmation/);
      assert.ok(d.retryAfterSeconds >= 1);
      assert.notEqual(d.retryAfterSeconds, (12 - 11) * 2 + 2);
    }
  });

  it("does not treat a missing safe head as settled", () => {
    const d = gate({ safeHead: null });
    assert.equal(d.settled, false);
    if (!d.settled) assert.match(d.message, /L1-safe head is unavailable/);
  });

  it("prefers time when both time and L1-safe would pass", () => {
    const d = gate({
      head: BLOCK + 400n,
      headTimestamp: T0 + 90n,
      safeHead: BLOCK,
    });
    assert.deepEqual(d, { settled: true, confirmations: 401n, via: "time" });
  });

  it("rejects a block ahead of the chain head", () => {
    const d = gate({ head: BLOCK - 1n, headTimestamp: T0 + 120n });
    assert.equal(d.settled, false);
    if (!d.settled) assert.match(d.message, /ahead of chain head/);
  });

  it("rejects a block timestamp ahead of the head timestamp", () => {
    const d = gate({
      head: BLOCK + 299n,
      headTimestamp: T0 - 5n,
      safeHead: null,
    });
    assert.equal(d.settled, false);
    if (!d.settled) {
      assert.match(d.message, /5s ahead of the chain head/);
      assert.equal(d.retryAfterSeconds, 60);
    }
  });
});
