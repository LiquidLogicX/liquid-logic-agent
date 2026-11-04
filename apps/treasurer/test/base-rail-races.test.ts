/**
 * Base x402 rail regression tests (mocked facilitator; no network, no keys).
 *   1. concurrent approvals of one hold → exactly one payment
 *   2. concurrent payments against the daily cap → cap holds (reservations)
 *   3. payments with no stated amount → priced from the 402, checked, recorded
 *      at the real amount; unknown price refused
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { CdpX402Client } from "@coinbase/cdp-sdk/x402";
import { TREASURER_WALLET_ADDRESS } from "@liquid-logic/shared";
import {
  approveHold,
  payEndpoint,
  requestHold,
  setBasePaymentTransportForTests,
  type BasePaymentTransport,
} from "../src/lib/client.js";
import { loadConfig } from "../src/lib/config.js";
import { getHoldResolution, recoverStaleApprovals } from "../src/lib/hold.js";
import { LedgerStore } from "../src/lib/ledger-store.js";
import { committedTodayAtomic, quoteFrom402 } from "../src/lib/base-pay.js";
import { withLedgerFileLock } from "../src/lib/file-lock.js";

const USDC_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const EP = "https://audit.liquidlogicx.com/api/audit";
const PAY_TO = "0x147991A1c25e78f6D9225d2dBA61eD93A6158c7b";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FacilitatorOpts = {
  price: () => string | null;
  latencyMs?: number;
  /** Settle HTTP response is 500 (payment may have been submitted). */
  failSettle?: boolean;
  /** HTTP 200 with no tx hash. */
  omitTx?: boolean;
  /** Throw after the 402 is quoted, before the signed header is sent. */
  throwPhase?: "before-sign" | "after-sign";
  fixedTx?: string;
  payTo?: string;
  /** Second accept with a different payTo (must be refused before sign). */
  altPayTo?: string;
  omitPayTo?: boolean;
  headerPayTo?: string;
  headerAmount?: string;
  headerNetwork?: string;
};

/** Mock facilitator: unpaid request → 402; signed retry is checked; then 200 + tx. */
function facilitator(opts: FacilitatorOpts) {
  let n = 0;
  const state = { settled: 0, paidAtomic: 0n };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (
      opts.throwPhase === "after-sign" &&
      (headers.get("payment-signature") || headers.get("x-payment"))
    ) {
      throw new Error("socket hangup after sign");
    }
    await sleep(Math.random() * (opts.latencyMs ?? 10));
    const p = opts.price();
    const payTo = opts.omitPayTo ? undefined : (opts.payTo ?? PAY_TO);
    const accepts =
      p == null
        ? []
        : [
            { scheme: "exact", network: "eip155:84532", asset: USDC_SEPOLIA, amount: p, payTo },
            ...(opts.altPayTo
              ? [{ scheme: "exact", network: "eip155:84532", asset: USDC_SEPOLIA, amount: p, payTo: opts.altPayTo }]
              : []),
          ];
    const body = { x402Version: 2, accepts, resource: { url: String(input) } };
    return new Response(JSON.stringify(body), {
      status: 402,
      headers: { "payment-required": Buffer.from(JSON.stringify(body)).toString("base64") },
    });
  }) as typeof fetch;
  const transport: BasePaymentTransport = {
    getAddress: async () => TREASURER_WALLET_ADDRESS,
    async payFetch(_cfg, url, guarded) {
      const first = await guarded(url); // quote guard runs here and may throw
      if (first.status !== 402) return first;
      if (opts.throwPhase === "before-sign") throw new Error("network down before sign");
      const q = await quoteFrom402(first, { network: "eip155:84532", asset: USDC_SEPOLIA });
      const amount = opts.headerAmount ?? q!.atomic.toString();
      const payTo = opts.headerPayTo ?? q!.payTo ?? PAY_TO;
      const network = opts.headerNetwork ?? "eip155:84532";
      const payload = {
        x402Version: 2,
        accepted: { scheme: "exact", network, amount, asset: USDC_SEPOLIA, payTo },
        payload: {
          authorization: {
            from: TREASURER_WALLET_ADDRESS,
            to: payTo,
            value: amount,
            validAfter: "0",
            validBefore: "9999999999",
            nonce: "0x" + "11".repeat(32),
          },
        },
      };
      // Signed retry goes back through the guard, which must match the pin before send.
      await guarded(url, {
        headers: { "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payload)).toString("base64") },
      });
      await sleep(Math.random() * (opts.latencyMs ?? 10));
      if (opts.failSettle) return new Response("boom", { status: 500 });
      if (opts.omitTx) return new Response("{}", { status: 200 });
      state.settled++;
      state.paidAtomic += q!.atomic;
      const tx = opts.fixedTx ?? "0x" + (++n).toString(16).padStart(64, "0");
      return new Response("{}", {
        status: 200,
        headers: { "payment-response": Buffer.from(JSON.stringify({ transaction: tx })).toString("base64") },
      });
    },
  };
  setBasePaymentTransportForTests(transport, fetchImpl);
  return state;
}

function setup(extra: Record<string, string> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "base-rail-"));
  const config = loadConfig({
    CDP_X402_ENVIRONMENT: "development",
    TREASURER_ALLOWLIST: EP,
    TREASURER_MAX_PER_PAYMENT_USDC: "1.00",
    TREASURER_DAILY_CAP_USDC: "10.00",
    TREASURER_LEDGER_PATH: path.join(dir, "ledger.jsonl"),
    ...extra,
  } as NodeJS.ProcessEnv);
  return { config, ledger: new LedgerStore(config.ledgerPath) };
}
const payments = (l: LedgerStore) => l.readAll().filter((e) => e.type === "payment");

const quiet = { log: console.log, warn: console.warn, error: console.error };
afterEach(() => {
  setBasePaymentTransportForTests(null);
  Object.assign(console, quiet);
});
function mute() {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}

describe("H1: concurrent hold approvals", () => {
  it("20 concurrent approvals of one hold produce exactly one payment", async () => {
    mute();
    const f = facilitator({ price: () => "900000" });
    const { config, ledger } = setup({ HOLD_ABOVE_USDC: "0.50" });
    const held = requestHold({ config, ledger, url: EP, amountUsdc: "0.90" });
    const rs = await Promise.allSettled(
      Array.from({ length: 20 }, () => approveHold({ config, ledger, holdId: held.holdId })),
    );
    assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
    for (const r of rs) {
      if (r.status === "rejected") assert.match(String(r.reason?.message), /HOLD_NOT_PENDING|HOLD_ALREADY_PAID/);
    }
    assert.equal(f.settled, 1);
    assert.equal(payments(ledger).length, 1);
    assert.equal(getHoldResolution(ledger.readAll(), held.holdId), "paid");
  });

  it("a settle that returns non-2xx moves the hold to needs_review and keeps the reservation", async () => {
    mute();
    facilitator({ price: () => "900000", failSettle: true });
    const { config, ledger } = setup({ HOLD_ABOVE_USDC: "0.50" });
    const held = requestHold({ config, ledger, url: EP, amountUsdc: "0.90" });
    const r = await approveHold({ config, ledger, holdId: held.holdId });
    assert.equal(r.status, 500);
    assert.equal(r.needsReview, true);
    assert.equal(getHoldResolution(ledger.readAll(), held.holdId), "needs_review");
    assert.equal(committedTodayAtomic(ledger.readAll()), 900_000n, "reservation kept");
    assert.equal(ledger.readAll().filter((e) => e.type === "reservation_released").length, 0);
    await assert.rejects(approveHold({ config, ledger, holdId: held.holdId }), /HOLD_NEEDS_REVIEW/);
  });

  it("a 200 with no txHash is needs_review, not pending", async () => {
    mute();
    facilitator({ price: () => "900000", omitTx: true });
    const { config, ledger } = setup({ HOLD_ABOVE_USDC: "0.50" });
    const held = requestHold({ config, ledger, url: EP, amountUsdc: "0.90" });
    const r = await approveHold({ config, ledger, holdId: held.holdId });
    assert.equal(r.status, 200);
    assert.equal(r.needsReview, true);
    assert.equal(getHoldResolution(ledger.readAll(), held.holdId), "needs_review");
    assert.equal(payments(ledger).length, 0);
    assert.equal(committedTodayAtomic(ledger.readAll()), 900_000n);
  });

  it("a failure before the payment is signed returns the hold to pending", async () => {
    mute();
    facilitator({ price: () => "900000", throwPhase: "before-sign" });
    const { config, ledger } = setup({ HOLD_ABOVE_USDC: "0.50" });
    const held = requestHold({ config, ledger, url: EP, amountUsdc: "0.90" });
    await assert.rejects(approveHold({ config, ledger, holdId: held.holdId }), /network down before sign/);
    assert.equal(getHoldResolution(ledger.readAll(), held.holdId), "pending");
    assert.equal(committedTodayAtomic(ledger.readAll()), 0n, "reservation released");
  });

  it("a throw after the signed header was sent keeps the reservation for review", async () => {
    mute();
    facilitator({ price: () => "900000", throwPhase: "after-sign" });
    const { config, ledger } = setup({ HOLD_ABOVE_USDC: "0.50" });
    const held = requestHold({ config, ledger, url: EP, amountUsdc: "0.90" });
    await assert.rejects(approveHold({ config, ledger, holdId: held.holdId }), /NEEDS_REVIEW/);
    assert.equal(getHoldResolution(ledger.readAll(), held.holdId), "needs_review");
    assert.equal(committedTodayAtomic(ledger.readAll()), 900_000n);
  });
});

describe("H2: concurrent payments against the daily cap", () => {
  it("40 concurrent 0.90 payments never exceed the 10.00 cap", async () => {
    mute();
    const f = facilitator({ price: () => "900000" });
    const { config, ledger } = setup();
    await Promise.allSettled(
      Array.from({ length: 40 }, () => payEndpoint({ config, ledger, url: EP, maxAmountHintUsdc: "0.90" })),
    );
    assert.equal(f.settled, 11);
    assert.ok(f.paidAtomic <= 10_000_000n);
    assert.equal(payments(ledger).length, 11);
    assert.equal(committedTodayAtomic(ledger.readAll()), 9_900_000n);
  });

  it("an unclosed reservation (crash mid-payment) still counts against the cap", () => {
    const { ledger } = setup();
    ledger.append({
      type: "reserved",
      reservationId: "r1",
      timestamp: new Date().toISOString(),
      endpoint: EP,
      amountUsdc: "9.50",
    });
    assert.equal(committedTodayAtomic(ledger.readAll()), 9_500_000n);
  });

  it("reuses one CDP client per process so its 24h cumulative control accumulates", async () => {
    mute();
    const seen = new Set<unknown>();
    const proto = CdpX402Client.prototype as unknown as Record<string, unknown>;
    const orig = proto.getAddresses;
    proto.getAddresses = async function (this: unknown) {
      seen.add(this);
      return { evmAddress: TREASURER_WALLET_ADDRESS };
    };
    try {
      const { config } = setup();
      const { getWalletAddress } = await import("../src/lib/client.js");
      await getWalletAddress(config);
      await getWalletAddress(config);
      await getWalletAddress(config);
      assert.equal(seen.size, 1);
    } finally {
      proto.getAddresses = orig;
    }
  });
});

describe("H3: payments with no stated amount", () => {
  it("refuses when the 402 price is over the per-payment max", async () => {
    mute();
    const f = facilitator({ price: () => "5000000" });
    const { config, ledger } = setup();
    await assert.rejects(payEndpoint({ config, ledger, url: EP }), /maxPerPaymentUsdc/);
    assert.equal(f.settled, 0);
    assert.equal(payments(ledger).length, 0);
  });

  it("refuses when the price is unknown (no accepts / malformed amount)", async () => {
    mute();
    facilitator({ price: () => null });
    const a = setup();
    await assert.rejects(payEndpoint({ config: a.config, ledger: a.ledger, url: EP }), /PRICE_UNKNOWN/);
    const f = facilitator({ price: () => "1.5" });
    const b = setup();
    await assert.rejects(payEndpoint({ config: b.config, ledger: b.ledger, url: EP }), /PRICE_UNKNOWN/);
    assert.equal(f.settled, 0);
  });

  it("records the actual quoted amount and counts it toward the cap", async () => {
    mute();
    const f = facilitator({ price: () => "500000" });
    const { config, ledger } = setup();
    await Promise.allSettled(Array.from({ length: 300 }, () => payEndpoint({ config, ledger, url: EP })));
    assert.equal(f.settled, 20);
    const rows = payments(ledger);
    assert.equal(rows.length, 20);
    assert.ok(rows.every((e) => e.type === "payment" && e.amountUsdc === "0.5"));
  });

  it("refuses when the 402 price is above the stated amount", async () => {
    mute();
    const f = facilitator({ price: () => "950000" });
    const { config, ledger } = setup();
    await assert.rejects(payEndpoint({ config, ledger, url: EP, maxAmountHintUsdc: "0.50" }), /exceeds the stated amount/);
    assert.equal(f.settled, 0);
  });

  it("refuses an unheld no-amount payment priced at/above HOLD_ABOVE_USDC", async () => {
    mute();
    const f = facilitator({ price: () => "800000" });
    const { config, ledger } = setup({ HOLD_ABOVE_USDC: "0.50" });
    await assert.rejects(payEndpoint({ config, ledger, url: EP }), /HOLD_ABOVE_USDC/);
    assert.equal(f.settled, 0);
  });
});

describe("ambiguous settle does not free the reservation", () => {
  it("keeps the reservation when the txHash is already on the ledger", async () => {
    mute();
    const tx = "0x" + "ab".repeat(32);
    facilitator({ price: () => "500000", fixedTx: tx });
    const { config, ledger } = setup();
    ledger.recordPayment({
      endpoint: EP,
      amountUsdc: "0.10",
      network: "eip155:84532",
      txHash: tx,
      walletAddress: TREASURER_WALLET_ADDRESS,
    });
    const r = await payEndpoint({ config, ledger, url: EP, maxAmountHintUsdc: "0.50" });
    assert.equal(r.status, 200);
    assert.equal(r.needsReview, true);
    assert.equal(payments(ledger).length, 1, "duplicate hash is not a second payment row");
    assert.equal(ledger.readAll().filter((e) => e.type === "reservation_released").length, 0);
    assert.equal(ledger.readAll().filter((e) => e.type === "needs_review").length, 1);
    assert.equal(committedTodayAtomic(ledger.readAll()), 600_000n, "0.10 recorded + 0.50 still reserved");
  });
});

describe("signed payment header is checked against the pinned payTo", () => {
  it("records the pinned payTo and accepts a header that matches amount, payTo and network", async () => {
    mute();
    const f = facilitator({ price: () => "100000", headerNetwork: "base-sepolia" });
    const { config, ledger } = setup();
    const r = await payEndpoint({ config, ledger, url: EP, maxAmountHintUsdc: "0.10" });
    assert.equal(r.status, 200);
    assert.equal(f.settled, 1);
    const reserved = ledger.readAll().find((e) => e.type === "reserved");
    assert.equal(reserved && "payTo" in reserved ? reserved.payTo : "", PAY_TO);
    const paid = payments(ledger)[0];
    assert.equal(paid && paid.type === "payment" ? paid.payTo : "", PAY_TO);
  });

  it("refuses a signed header whose payTo, amount or network differs, before send", async () => {
    mute();
    const stranger = "0x2222222222222222222222222222222222222222";
    for (const header of [
      { headerPayTo: stranger },
      { headerAmount: "1" },
      { headerNetwork: "eip155:8453" },
    ] as const) {
      facilitator({ price: () => "100000", ...header });
      const { config, ledger } = setup();
      await assert.rejects(
        payEndpoint({ config, ledger, url: EP, maxAmountHintUsdc: "0.10" }),
        /SIGNED_PAYMENT_MISMATCH/,
      );
      assert.equal(payments(ledger).length, 0);
      assert.equal(committedTodayAtomic(ledger.readAll()), 0n, "not sent, so the reservation is released");
    }
  });

  it("refuses when matching accepts disagree on payTo or omit it", async () => {
    mute();
    facilitator({ price: () => "100000", altPayTo: "0x2222222222222222222222222222222222222222" });
    const a = setup();
    await assert.rejects(payEndpoint({ config: a.config, ledger: a.ledger, url: EP, maxAmountHintUsdc: "0.10" }), /PAYTO_UNPINNED/);
    assert.equal(a.ledger.readAll().filter((e) => e.type === "reserved").length, 0);

    facilitator({ price: () => "100000", omitPayTo: true });
    const b = setup();
    await assert.rejects(payEndpoint({ config: b.config, ledger: b.ledger, url: EP, maxAmountHintUsdc: "0.10" }), /PAYTO_UNPINNED/);
  });

  it("refuses a 402 payTo that is not the configured TREASURER_PAY_TO", async () => {
    mute();
    facilitator({ price: () => "100000" });
    const { config, ledger } = setup({ TREASURER_PAY_TO: "0x3333333333333333333333333333333333333333" });
    await assert.rejects(
      payEndpoint({ config, ledger, url: EP, maxAmountHintUsdc: "0.10" }),
      /TREASURER_PAY_TO/,
    );
    assert.equal(ledger.readAll().filter((e) => e.type === "reserved").length, 0);
  });
});

describe("ledger file lock (CLI and server, same host)", () => {
  it("is exclusive for one ledger path and is stolen when the owner pid is dead", async () => {
    const { config } = setup();
    const order: string[] = [];
    const first = withLedgerFileLock(config.ledgerPath, async () => {
      order.push("first-enter");
      await sleep(40);
      order.push("first-leave");
    });
    await sleep(10);
    const second = withLedgerFileLock(config.ledgerPath, async () => {
      order.push("second");
    });
    await Promise.all([first, second]);
    assert.deepEqual(order, ["first-enter", "first-leave", "second"]);

    const dir = `${config.ledgerPath}.lock`;
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "owner"), JSON.stringify({ pid: 2_147_000_000 }));
    let ran = false;
    await withLedgerFileLock(config.ledgerPath, async () => {
      ran = true;
    });
    assert.equal(ran, true);
    assert.equal(fs.existsSync(dir), false);
  });
});

describe("approving holds recover after a TTL", () => {
  const old = "2020-01-01T00:00:00.000Z";
  const later = new Date("2020-01-01T00:30:00.000Z");

  function heldApproving(ledger: LedgerStore, holdId: string) {
    ledger.append({
      type: "held",
      holdId,
      timestamp: old,
      endpoint: EP,
      amountUsdc: "0.90",
      asset: "USDC",
      network: "eip155:84532",
    });
    ledger.append({
      type: "approving",
      holdId,
      approvedBy: "operator",
      timestamp: old,
    });
  }

  it("returns to pending when nothing was reserved", () => {
    const { ledger } = setup();
    heldApproving(ledger, "h-plain");
    const ids = recoverStaleApprovals(ledger, 60, later);
    assert.deepEqual(ids, ["h-plain"]);
    assert.equal(getHoldResolution(ledger.readAll(), "h-plain"), "pending");
  });

  it("moves to needs_review and keeps the reservation when one is open", () => {
    const { ledger } = setup();
    heldApproving(ledger, "h-open");
    ledger.append({
      type: "reserved",
      reservationId: "r-open",
      holdId: "h-open",
      timestamp: old,
      endpoint: EP,
      amountUsdc: "0.90",
      network: "eip155:84532",
      payTo: PAY_TO,
    });
    const ids = recoverStaleApprovals(ledger, 60, later);
    assert.deepEqual(ids, ["h-open"]);
    assert.equal(getHoldResolution(ledger.readAll(), "h-open"), "needs_review");
    assert.equal(ledger.readAll().filter((e) => e.type === "reservation_released").length, 0);
    assert.equal(committedTodayAtomic(ledger.readAll(), new Date(old)), 900_000n);
  });

  it("leaves a fresh approving hold alone", () => {
    const { ledger } = setup();
    const now = new Date();
    ledger.append({
      type: "held",
      holdId: "h-fresh",
      timestamp: now.toISOString(),
      endpoint: EP,
      amountUsdc: "0.90",
      asset: "USDC",
      network: "eip155:84532",
    });
    ledger.append({
      type: "approving",
      holdId: "h-fresh",
      approvedBy: "operator",
      timestamp: now.toISOString(),
    });
    assert.deepEqual(recoverStaleApprovals(ledger, 900, now), []);
    assert.equal(getHoldResolution(ledger.readAll(), "h-fresh"), "approving");
  });
});
