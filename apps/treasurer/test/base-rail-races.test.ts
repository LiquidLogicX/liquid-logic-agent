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
import { getHoldResolution } from "../src/lib/hold.js";
import { LedgerStore } from "../src/lib/ledger-store.js";
import { committedTodayAtomic, quoteFrom402 } from "../src/lib/base-pay.js";

const USDC_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const EP = "https://audit.liquidlogicx.com/api/audit";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mock facilitator: unpaid request → 402 at `price` (atomic string); paid → 200 + unique tx. */
function facilitator(opts: { price: () => string | null; latencyMs?: number; failSettle?: boolean }) {
  let n = 0;
  const state = { settled: 0, paidAtomic: 0n };
  const fetchImpl = (async (input: RequestInfo | URL) => {
    await sleep(Math.random() * (opts.latencyMs ?? 10));
    const p = opts.price();
    const accepts = p == null ? [] : [{ scheme: "exact", network: "eip155:84532", asset: USDC_SEPOLIA, amount: p }];
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
      const q = await quoteFrom402(first, { network: "eip155:84532", asset: USDC_SEPOLIA });
      await sleep(Math.random() * (opts.latencyMs ?? 10));
      if (opts.failSettle) return new Response("boom", { status: 500 });
      state.settled++;
      state.paidAtomic += q!.atomic;
      const tx = "0x" + (++n).toString(16).padStart(64, "0");
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

  it("a failed approval returns the hold to pending so it can be retried", async () => {
    mute();
    facilitator({ price: () => "900000", failSettle: true });
    const { config, ledger } = setup({ HOLD_ABOVE_USDC: "0.50" });
    const held = requestHold({ config, ledger, url: EP, amountUsdc: "0.90" });
    const r = await approveHold({ config, ledger, holdId: held.holdId });
    assert.equal(r.status, 500);
    assert.equal(getHoldResolution(ledger.readAll(), held.holdId), "pending");
    assert.equal(committedTodayAtomic(ledger.readAll()), 0n, "reservation released");
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
