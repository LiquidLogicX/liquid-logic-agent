/**
 * Tempo rail (Demo Pay) tests. The chain, recorder and bridge are mocked:
 * no RPC, no keys with funds, no transactions.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import {
  TREASURER_WALLET_ADDRESS,
  USDC_E_TEMPO_MAINNET,
  explorerTxUrl,
  sumSpentTodayAtomic,
  type LedgerEvent,
} from "@liquid-logic/shared";
import { loadConfig } from "../src/lib/config.js";
import { LedgerStore } from "../src/lib/ledger-store.js";
import { getHoldResolution } from "../src/lib/hold.js";
import { startOperatorHttpServer } from "../src/lib/http-api.js";
import { parseUsd6, formatUsd6 } from "../src/lib/tempo/amount.js";
import { loadTempoRailConfig, publicTempoConfig, tempoPayerKeyStatus, type TempoRailConfig } from "../src/lib/tempo/config.js";
import { createTempoRuntime } from "../src/lib/tempo/runtime.js";
import { evaluateTempoPayment, tempoSpentTodayAtomic } from "../src/lib/tempo/policy.js";
import { FlowStore, TempoRail, type DemoPayFlow } from "../src/lib/tempo/flows.js";
import type { TempoChain } from "../src/lib/tempo/chain.js";
import { createHttpRecorder, RecorderError, type TempoRecorder } from "../src/lib/tempo/recorder.js";
import { getLastProofAttempt, resetLastProofAttempt } from "../src/lib/tempo/last-proof-attempt.js";
import type { BridgeMirror } from "../src/lib/tempo/bridge.js";
import type { TempoRuntime } from "../src/lib/tempo/runtime.js";

// Well-known public test keys (Foundry/Anvil accounts 0 and 1). Never funded on Tempo.
const KEY_A = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const KEY_B = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const PAYER = privateKeyToAccount(KEY_A).address;
const OTHER = privateKeyToAccount(KEY_B).address;
const PAYEE = "0x1111111111111111111111111111111111111111" as Address;
const STRANGER = "0x2222222222222222222222222222222222222222" as Address;
const SERVICE_TOKEN = "test-service-token-0123456789abcdef";
const TX_PAY = `0x${"ab".repeat(32)}` as Hex;
const TX_PROOF = `0x${"cd".repeat(32)}` as Hex;
const REF_ID = `0x${"ef".repeat(32)}`;

const tmpDirs: string[] = [];
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "tempo-rail-"));
  tmpDirs.push(d);
  return d;
}
after(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

function env(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    TREASURER_TEMPO_ENABLED: "true",
    TEMPO_PAYER_PRIVATE_KEY: KEY_A,
    TEMPO_PAYER_ADDRESS: PAYER,
    TREASURER_TEMPO_ALLOWLIST: PAYEE,
    TREASURER_SERVICE_TOKEN: SERVICE_TOKEN,
    RECORDER_API_KEY: "recorder-test-key",
    ...overrides,
  };
}

function cfgOrThrow(e = env()): TempoRailConfig {
  const c = loadTempoRailConfig(e);
  if (!c.enabled) throw new Error(c.reason);
  return c;
}

type FakeChain = TempoChain & { sent: Array<{ token: Address; to: Address; amount: bigint; memo: Hex }> };
function fakeChain(opts: { balance?: bigint; chainId?: number; revert?: boolean } = {}): FakeChain {
  const sent: FakeChain["sent"] = [];
  return {
    sent,
    getChainId: async () => opts.chainId ?? 4217,
    balanceOf: async () => opts.balance ?? 100_000_000n,
    transferWithMemo: async (a) => {
      sent.push(a);
      return TX_PAY;
    },
    waitForReceipt: async () => ({ status: opts.revert ? "reverted" : "success", blockNumber: 43_000_000n }),
  };
}

function fakeRecorder(script: Array<"ok" | "503" | "400"> = ["ok"]): TempoRecorder & { calls: number } {
  const r = {
    calls: 0,
    async recordProof() {
      const step = script[Math.min(r.calls, script.length - 1)];
      r.calls++;
      if (step === "503") throw new RecorderError("Recorder HTTP 503", 503, "LOW_GAS_BALANCE", true);
      if (step === "400") throw new RecorderError("TIP-20 Transfer did not match", 400, "TIP20_AMOUNT_UNVERIFIED", false);
      return {
        proofTxHash: TX_PROOF,
        proofExplorerUrl: `https://explore.tempo.xyz/tx/${TX_PROOF}`,
        verifyUrl: `https://proofs.liquidlogicx.com/proofs/${REF_ID}?network=tempo-mainnet`,
        refId: REF_ID,
        idempotent: false,
      };
    },
  };
  return r;
}

function fakeBridge(): BridgeMirror & { posts: string[] } {
  const posts: string[] = [];
  let n = 0;
  return {
    posts,
    post: async ({ body }) => {
      posts.push(body);
      return `MSG${++n}`;
    },
  };
}

function makeRail(opts: {
  e?: Record<string, string | undefined>;
  chain?: FakeChain;
  recorder?: ReturnType<typeof fakeRecorder>;
  now?: () => Date;
  ledger?: LedgerStore;
} = {}) {
  const dir = tmpDir();
  const ledger = opts.ledger ?? new LedgerStore(path.join(dir, "ledger.jsonl"));
  const chain = opts.chain ?? fakeChain();
  const recorder = opts.recorder ?? fakeRecorder();
  const bridge = fakeBridge();
  const rail = new TempoRail({
    cfg: cfgOrThrow(opts.e ?? env()),
    ledger,
    chain,
    recorder,
    bridge,
    store: new FlowStore(path.join(dir, "tempo-flows.json")),
    holdTtlSeconds: 3600,
    now: opts.now,
    sleep: async () => undefined,
    recorderRetryDelaysMs: [1, 1, 1],
  });
  return { rail, ledger, chain, recorder, bridge, dir };
}

describe("amounts (6-decimal TIP-20)", () => {
  it("parses and formats USDC.e amounts strictly", () => {
    assert.equal(parseUsd6("1"), 1_000_000n);
    assert.equal(parseUsd6("1.5"), 1_500_000n);
    assert.equal(parseUsd6("0.000001"), 1n);
    assert.throws(() => parseUsd6("0.0000001"), /at most 6 places/);
    assert.throws(() => parseUsd6("-1"));
    assert.throws(() => parseUsd6("1e18"));
    assert.equal(formatUsd6(1_000_000n), "1.00");
    assert.equal(formatUsd6(2_500_000n), "2.50");
    assert.equal(formatUsd6(1n), "0.000001");
  });
});

describe("Tempo rail config", () => {
  it("is off unless TREASURER_TEMPO_ENABLED=true (flag off)", () => {
    for (const v of [undefined, "", "false", "1", "TRUE"]) {
      const c = loadTempoRailConfig(env({ TREASURER_TEMPO_ENABLED: v }));
      assert.equal(c.enabled, false, `flag ${v}`);
    }
  });

  it("refuses to start when the key does not belong to TEMPO_PAYER_ADDRESS", () => {
    const c = loadTempoRailConfig(env({ TEMPO_PAYER_ADDRESS: OTHER }));
    assert.equal(c.enabled, false);
    assert.match((c as { reason: string }).reason, /does not belong to TEMPO_PAYER_ADDRESS/);
    assert.ok(!(c as { reason: string }).reason.includes(KEY_A.slice(2)), "never echoes the key");
  });

  it("reports a non-secret payer key status (derived address match), even with the flag off", () => {
    const ok = tempoPayerKeyStatus(env({ TREASURER_TEMPO_ENABLED: undefined }));
    assert.deepEqual(ok, { keyPresent: true, keyFormatOk: true, expectedAddress: PAYER, derivedAddress: PAYER, match: true });
    const bad = tempoPayerKeyStatus(env({ TEMPO_PAYER_ADDRESS: OTHER }));
    assert.equal(bad.match, false);
    assert.equal(bad.derivedAddress, PAYER);
    assert.deepEqual(tempoPayerKeyStatus(env({ TEMPO_PAYER_PRIVATE_KEY: "0x12" })), {
      keyPresent: true, keyFormatOk: false, expectedAddress: PAYER, derivedAddress: null, match: false,
    });
    assert.equal(tempoPayerKeyStatus(env({ TEMPO_PAYER_PRIVATE_KEY: undefined })).keyPresent, false);
    assert.equal(tempoPayerKeyStatus(env({ TEMPO_PAYER_ADDRESS: undefined })).match, false);

    const dir = tmpDir();
    const ledgerPath = path.join(dir, "ledger.jsonl");
    const rt = createTempoRuntime({
      ledger: new LedgerStore(ledgerPath), ledgerPath, holdTtlSeconds: 900,
      env: env({ TREASURER_TEMPO_ENABLED: undefined }) as NodeJS.ProcessEnv,
    });
    assert.equal(rt.rail, null);
    const h = rt.health() as { enabled: boolean; payerKey: { match: boolean; derivedAddress: string } };
    assert.equal(h.enabled, false);
    assert.equal(h.payerKey.match, true);
    assert.equal(h.payerKey.derivedAddress, PAYER);
    assert.ok(!JSON.stringify(h).toLowerCase().includes(KEY_A.slice(2).toLowerCase()), "health never carries the key");
  });

  it("requires the key, the expected address, an allowlist and a service token", () => {
    const cases: Array<[Record<string, string | undefined>, RegExp]> = [
      [{ TEMPO_PAYER_PRIVATE_KEY: undefined }, /TEMPO_PAYER_PRIVATE_KEY is not set/],
      [{ TEMPO_PAYER_PRIVATE_KEY: "0x1234" }, /32-byte hex key/],
      [{ TEMPO_PAYER_ADDRESS: undefined }, /TEMPO_PAYER_ADDRESS is not set/],
      [{ TREASURER_TEMPO_ALLOWLIST: "" }, /allowlist|ALLOWLIST/i],
      [{ TREASURER_TEMPO_ALLOWLIST: PAYER }, /must not contain the payer/],
      [{ TEMPO_DEMO_PAYEE_ADDRESS: STRANGER }, /must also be on TREASURER_TEMPO_ALLOWLIST/],
      [{ TREASURER_SERVICE_TOKEN: undefined }, /TREASURER_SERVICE_TOKEN/],
      [{ TREASURER_SERVICE_TOKEN: "short" }, /TREASURER_SERVICE_TOKEN/],
      [{ TEMPO_CHAIN_ID: "8453" }, /TEMPO_CHAIN_ID/],
      [{ TEMPO_CHAIN_ID: "42431" }, /TEMPO_PAY_TOKEN is required/],
      [{ TREASURER_TEMPO_MAX_PER_PAYMENT_USDC: "30", TREASURER_TEMPO_DAILY_CAP_USDC: "25" }, /must not exceed/],
    ];
    for (const [over, re] of cases) {
      const c = loadTempoRailConfig(env(over));
      assert.equal(c.enabled, false, JSON.stringify(over));
      assert.match((c as { reason: string }).reason, re, JSON.stringify(over));
    }
  });

  it("defaults to Tempo mainnet, USDC.e (6 dec) as payment AND fee token, caps 5/25, hold 2.00", () => {
    const c = cfgOrThrow();
    assert.equal(c.chainId, 4217);
    assert.equal(c.network, "eip155:4217");
    assert.equal(c.networkLabel, "Tempo mainnet");
    assert.equal(c.token, USDC_E_TEMPO_MAINNET);
    assert.equal(c.feeToken, USDC_E_TEMPO_MAINNET);
    assert.equal(c.tokenSymbol, "USDC.e");
    assert.equal(c.rpcUrl, "https://rpc.tempo.xyz");
    assert.equal(c.maxPerPaymentAtomic, 5_000_000n);
    assert.equal(c.dailyCapAtomic, 25_000_000n);
    assert.equal(c.holdAboveAtomic, 2_000_000n);
    assert.equal(c.payerAddress, PAYER);
    assert.equal(c.demoPayee, PAYEE);
    const pub = JSON.stringify(publicTempoConfig(c));
    assert.ok(!pub.includes(KEY_A.slice(2)), "public config has no key");
    assert.ok(!pub.includes(SERVICE_TOKEN), "public config has no service token");
    assert.ok(!pub.includes("recorder-test-key"), "public config has no recorder key");
  });

  it("testnet fallback is labeled Tempo testnet", () => {
    const c = cfgOrThrow(env({ TEMPO_CHAIN_ID: "42431", TEMPO_PAY_TOKEN: "0x20C0000000000000000000000000000000000001" }));
    assert.equal(c.networkLabel, "Tempo testnet");
    assert.equal(c.network, "eip155:42431");
  });

  it("leaves the Base rail config identical whether or not Tempo vars are set", () => {
    const baseEnv = { TREASURER_ALLOWLIST: "https://audit.liquidlogicx.com/api/audit", HOLD_ABOVE_USDC: "0.01", TREASURER_LEDGER_PATH: "/tmp/x.jsonl" };
    const a = loadConfig(baseEnv as NodeJS.ProcessEnv);
    const b = loadConfig({ ...baseEnv, ...env() } as NodeJS.ProcessEnv);
    assert.deepEqual(b, a);
    assert.equal(a.network, "eip155:8453");
  });
});

describe("Tempo policy (cap, allowlist, hold, daily cap)", () => {
  const cfg = cfgOrThrow();
  const now = new Date("2026-10-12T18:00:00Z");
  const pay = (amountUsdc: string, over: Partial<{ network: string; walletAddress: string; timestamp: string }> = {}): LedgerEvent =>
    ({
      type: "payment",
      timestamp: over.timestamp ?? "2026-10-12T10:00:00Z",
      endpoint: "x",
      amountUsdc,
      asset: "USDC",
      network: (over.network ?? "eip155:4217") as "eip155:4217",
      txHash: TX_PAY,
      walletAddress: over.walletAddress ?? PAYER,
    }) as LedgerEvent;

  it("1.00 pays straight through, 2.00 and 3.00 are held (at/above), over 5.00 is refused", () => {
    assert.equal(evaluateTempoPayment({ cfg, events: [], payee: PAYEE, amountUsdc: "1.00", now }).decision, "allow");
    assert.equal(evaluateTempoPayment({ cfg, events: [], payee: PAYEE, amountUsdc: "1.999999", now }).decision, "allow");
    assert.equal(evaluateTempoPayment({ cfg, events: [], payee: PAYEE, amountUsdc: "2.00", now }).decision, "hold");
    assert.equal(evaluateTempoPayment({ cfg, events: [], payee: PAYEE, amountUsdc: "3.00", now }).decision, "hold");
    assert.equal(evaluateTempoPayment({ cfg, events: [], payee: PAYEE, amountUsdc: "5.00", now }).decision, "hold");
    const over = evaluateTempoPayment({ cfg, events: [], payee: PAYEE, amountUsdc: "5.000001", now });
    assert.equal(over.decision, "refuse");
    assert.equal((over as { code: string }).code, "OVER_MAX_PER_PAYMENT");
  });

  it("approve path (skipHold) re-checks everything except the hold", () => {
    assert.equal(evaluateTempoPayment({ cfg, events: [], payee: PAYEE, amountUsdc: "3.00", now, skipHold: true }).decision, "allow");
    assert.equal(evaluateTempoPayment({ cfg, events: [], payee: PAYEE, amountUsdc: "6", now, skipHold: true }).decision, "refuse");
  });

  it("refuses payees that are not on the allowlist (case-insensitive match for listed ones)", () => {
    const r = evaluateTempoPayment({ cfg, events: [], payee: STRANGER, amountUsdc: "1", now });
    assert.equal(r.decision, "refuse");
    assert.equal((r as { code: string }).code, "PAYEE_NOT_ALLOWLISTED");
    assert.equal(evaluateTempoPayment({ cfg, events: [], payee: PAYEE.toLowerCase(), amountUsdc: "1", now }).decision, "allow");
  });

  it("refuses bad amounts (0, >6 decimals, text)", () => {
    for (const a of ["0", "0.00", "1.0000001", "abc", ""]) {
      const r = evaluateTempoPayment({ cfg, events: [], payee: PAYEE, amountUsdc: a, now });
      assert.equal(r.decision, "refuse", a);
      assert.equal((r as { code: string }).code, "BAD_AMOUNT", a);
    }
  });

  it("enforces the UTC daily cap from Tempo payer rows only", () => {
    const events = [
      pay("4.00"), pay("4.00"), pay("4.00"), pay("4.00"), pay("4.00"), pay("4.00"), // 24.00 today
      pay("5.00", { network: "eip155:8453", walletAddress: TREASURER_WALLET_ADDRESS }), // Base: ignored
      pay("5.00", { walletAddress: OTHER }), // other wallet: ignored
      pay("5.00", { timestamp: "2026-10-11T23:59:59Z" }), // yesterday: ignored
    ];
    assert.equal(tempoSpentTodayAtomic(events, cfg, now), 24_000_000n);
    assert.equal(evaluateTempoPayment({ cfg, events, payee: PAYEE, amountUsdc: "1.00", now }).decision, "allow");
    const r = evaluateTempoPayment({ cfg, events, payee: PAYEE, amountUsdc: "1.01", now });
    assert.equal(r.decision, "refuse");
    assert.equal((r as { code: string }).code, "OVER_DAILY_CAP");
    assert.equal(r.remainingAtomic, 1_000_000n);
  });

  it("refuses everything while the operator freeze is on", () => {
    const events: LedgerEvent[] = [{ type: "frozen", timestamp: "2026-10-12T09:00:00Z" } as LedgerEvent];
    const r = evaluateTempoPayment({ cfg, events, payee: PAYEE, amountUsdc: "1", now });
    assert.equal((r as { code: string }).code, "FROZEN");
  });

  it("Tempo spend never counts against the Base treasurer daily cap", () => {
    const events = [pay("4.00"), pay("1.00", { network: "eip155:8453", walletAddress: TREASURER_WALLET_ADDRESS })];
    assert.equal(sumSpentTodayAtomic(events, now, TREASURER_WALLET_ADDRESS), 1_000_000n);
  });

  it("explorer links for Tempo rows go to explore.tempo.xyz", () => {
    assert.equal(explorerTxUrl("eip155:4217", TX_PAY), `https://explore.tempo.xyz/tx/${TX_PAY}`);
    assert.equal(explorerTxUrl("eip155:42431", TX_PAY), `https://explore.testnet.tempo.xyz/tx/${TX_PAY}`);
    assert.equal(explorerTxUrl("eip155:8453", TX_PAY), `https://basescan.org/tx/${TX_PAY}`);
  });
});

describe("Demo Pay flow (mocked chain + recorder)", () => {
  it("happy path: policy → payment on Tempo → proof on Tempo → receipt, all in the ledger", async () => {
    const { rail, ledger, chain, bridge } = makeRail();
    const { flow, settled } = await rail.start({ amountUsdc: "1.00", memo: "Crypto World's Fair demo" });
    assert.equal(flow.steps[0]!.status, "done");
    const done = await settled;
    await rail.flushMirror(done.id);

    assert.equal(done.status, "done");
    assert.deepEqual(done.steps.map((s) => [s.label, s.status]), [
      ["Policy check", "done"],
      ["Payment sent on Tempo", "done"],
      ["Proof recorded on Tempo", "done"],
      ["Receipt ready", "done"],
    ]);
    assert.ok(done.steps.every((s) => s.at), "every step has a timestamp");
    assert.equal(done.networkLabel, "Tempo mainnet");
    assert.equal(done.payment?.explorerUrl, `https://explore.tempo.xyz/tx/${TX_PAY}`);
    assert.equal(done.proof?.explorerUrl, `https://explore.tempo.xyz/tx/${TX_PROOF}`);
    assert.match(done.verifyUrl!, /proofs\.liquidlogicx\.com\/proofs\/0x(ef)+\?network=tempo-mainnet/);

    assert.equal(chain.sent.length, 1);
    assert.equal(chain.sent[0]!.amount, 1_000_000n, "6-decimal units");
    assert.equal(chain.sent[0]!.token, USDC_E_TEMPO_MAINNET);
    assert.equal(chain.sent[0]!.to, PAYEE);

    const rows = ledger.readAll();
    const payment = rows.find((e) => e.type === "payment") as Record<string, unknown>;
    assert.equal(payment.network, "eip155:4217");
    assert.equal(payment.walletAddress, PAYER);
    assert.equal(payment.tokenSymbol, "USDC.e");
    assert.equal(payment.amountUsdc, "1.00");
    assert.equal(payment.basescanUrl, `https://explore.tempo.xyz/tx/${TX_PAY}`);
    const notes = rows.filter((e) => e.type === "note").map((e) => (e as { message: string }).message);
    assert.equal(notes.length, 3);
    assert.match(notes[0]!, /policy check passed/);
    assert.match(notes[1]!, /proof recorded on Tempo/);
    assert.match(notes[2]!, /receipt ready/);

    assert.equal(bridge.posts.length, 4);
    assert.match(bridge.posts[0]!, /1\/4 Policy check passed/);
    assert.match(bridge.posts[1]!, /2\/4 Payment sent on Tempo/);
    assert.match(bridge.posts[2]!, /3\/4 Proof recorded on Tempo/);
    assert.match(bridge.posts[3]!, /4\/4 Receipt ready/);
    assert.ok(bridge.posts.every((p) => !/0x[0-9a-f]{64}/i.test(p)), "bridge bodies shorten hashes");
  });

  it("hold path: 3.00 is held, nothing is sent until approve, then pays with holdId + approvedBy", async () => {
    const { rail, ledger, chain } = makeRail();
    const { flow } = await rail.start({ amountUsdc: "3.00" });
    assert.equal(flow.status, "held");
    assert.equal(flow.steps[0]!.status, "held");
    assert.equal(chain.sent.length, 0);
    const held = ledger.readAll().find((e) => e.type === "held") as Record<string, unknown>;
    assert.equal(held.network, "eip155:4217");
    assert.equal(held.holdId, flow.holdId);
    assert.equal(getHoldResolution(ledger.readAll(), flow.holdId!), "pending");

    const { settled } = await rail.approve(flow.id, "Miles");
    const done = await settled;
    assert.equal(done.status, "done");
    assert.equal(chain.sent.length, 1);
    assert.equal(chain.sent[0]!.amount, 3_000_000n);
    const payment = ledger.readAll().find((e) => e.type === "payment") as Record<string, unknown>;
    assert.equal(payment.holdId, flow.holdId);
    assert.equal(payment.approvedBy, "Miles");
    assert.equal(getHoldResolution(ledger.readAll(), flow.holdId!), "paid");
    await assert.rejects(rail.approve(flow.id), /not pending/);
  });

  it("deny and TTL expiry stop a held flow without paying", async () => {
    let clock = new Date("2026-10-12T18:00:00Z");
    const { rail, chain, ledger } = makeRail({ now: () => clock });
    const a = (await rail.start({ amountUsdc: "3.00" })).flow;
    const denied = rail.deny(a.id, "Miles");
    assert.equal(denied.status, "denied");
    assert.equal(getHoldResolution(ledger.readAll(), a.holdId!), "denied");

    const b = (await rail.start({ amountUsdc: "4.00" })).flow;
    clock = new Date(clock.getTime() + 3601_000);
    assert.equal(rail.get(b.id)!.status, "expired");
    assert.equal(chain.sent.length, 0);
  });

  it("over-cap and non-allowlisted requests are refused at the policy step, nothing is sent", async () => {
    const { rail, chain } = makeRail();
    const r1 = (await rail.start({ amountUsdc: "6.00" })).flow;
    assert.equal(r1.status, "refused");
    assert.equal(r1.error?.code, "OVER_MAX_PER_PAYMENT");
    const r2 = (await rail.start({ amountUsdc: "1.00", payee: STRANGER })).flow;
    assert.equal(r2.error?.code, "PAYEE_NOT_ALLOWLISTED");
    assert.equal(chain.sent.length, 0);
  });

  it("daily cap counts earlier Demo Pay payments", async () => {
    const { rail } = makeRail({ e: env({ TREASURER_TEMPO_DAILY_CAP_USDC: "1.50", TREASURER_TEMPO_MAX_PER_PAYMENT_USDC: "1.00" }) });
    const first = await (await rail.start({ amountUsdc: "1.00" })).settled;
    assert.equal(first.status, "done");
    const second = (await rail.start({ amountUsdc: "1.00" })).flow;
    assert.equal(second.status, "refused");
    assert.equal(second.error?.code, "OVER_DAILY_CAP");
  });

  it("insufficient payer balance fails the payment step and writes no payment row", async () => {
    const { rail, ledger, chain } = makeRail({ chain: fakeChain({ balance: 1_000_000n }) });
    const done = await (await rail.start({ amountUsdc: "1.00" })).settled;
    assert.equal(done.status, "failed");
    assert.equal(done.error?.code, "INSUFFICIENT_BALANCE");
    assert.equal(chain.sent.length, 0);
    assert.equal(ledger.readAll().filter((e) => e.type === "payment").length, 0);
  });

  it("wrong RPC chain or a reverted tx never produces a payment row", async () => {
    const wrong = makeRail({ chain: fakeChain({ chainId: 42431 }) });
    const w = await (await wrong.rail.start({ amountUsdc: "1.00" })).settled;
    assert.equal(w.error?.code, "CHAIN_MISMATCH");
    const rev = makeRail({ chain: fakeChain({ revert: true }) });
    const r = await (await rev.rail.start({ amountUsdc: "1.00" })).settled;
    assert.equal(r.error?.code, "PAYMENT_REVERTED");
    assert.equal(rev.ledger.readAll().filter((e) => e.type === "payment").length, 0);
    assert.equal(rev.ledger.readAll().filter((e) => e.type === "payment_failed").length, 1);
  });

  it("retries a transient recorder error, and never fakes a proof on a hard error", async () => {
    const retry = makeRail({ recorder: fakeRecorder(["503", "ok"]) });
    const ok = await (await retry.rail.start({ amountUsdc: "1.00" })).settled;
    assert.equal(ok.status, "done");
    assert.equal(retry.recorder.calls, 2);

    const hard = makeRail({ recorder: fakeRecorder(["400"]) });
    const bad = await (await hard.rail.start({ amountUsdc: "1.00" })).settled;
    assert.equal(bad.status, "failed");
    assert.equal(bad.error?.step, "proof");
    assert.equal(bad.steps[1]!.status, "done", "the payment itself is real and shown");
    assert.equal(bad.steps[2]!.status, "failed");
    assert.equal(bad.steps[3]!.status, "pending");
    assert.equal(bad.proof, null);
    assert.equal(bad.verifyUrl, null);
    assert.equal(hard.recorder.calls, 1);
  });

  it("is idempotent per clientRequestId (double tap)", async () => {
    const { rail, chain } = makeRail();
    const a = await rail.start({ amountUsdc: "1.00", clientRequestId: "tap-1" });
    await a.settled;
    const b = await rail.start({ amountUsdc: "1.00", clientRequestId: "tap-1" });
    assert.equal(b.flow.id, a.flow.id);
    assert.equal(chain.sent.length, 1);
  });

  it("persists flows next to the ledger", async () => {
    const { rail, dir } = makeRail();
    const done = await (await rail.start({ amountUsdc: "1.00" })).settled;
    const store = new FlowStore(path.join(dir, "tempo-flows.json"));
    assert.equal(store.get(done.id)?.status, "done");
  });
});

describe("last recorder proof attempt", () => {
  it("records HTTP status + body preview and never stores the API key", async () => {
    resetLastProofAttempt();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const recorder = createHttpRecorder({
      url: "https://recorder.test",
      apiKey: "super-secret-recorder-key",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify({ error: "TIP-20 Transfer did not match", code: "TIP20_AMOUNT_UNVERIFIED" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      },
    });
    await assert.rejects(
      () =>
        recorder.recordProof({
          txHash: TX_PAY,
          payee: PAYEE,
          amountAtomic: 1_000_000n,
          memo: "demo",
        }),
      /TIP-20 Transfer did not match/,
    );
    const attempt = getLastProofAttempt();
    assert.ok(attempt);
    assert.equal(attempt!.paymentTxHash, TX_PAY);
    assert.equal(attempt!.status, 400);
    assert.equal(attempt!.ok, false);
    assert.match(attempt!.error ?? "", /TIP-20/);
    assert.match(attempt!.bodyPreview ?? "", /TIP20_AMOUNT_UNVERIFIED/);
    assert.ok(!JSON.stringify(attempt).includes("super-secret-recorder-key"));
    const auth = String((calls[0]!.init?.headers as Record<string, string>).authorization ?? "");
    assert.match(auth, /^Bearer /);
  });

  it("surfaces lastProofAttempt on a failed Demo Pay flow and on /healthz + the debug route", async () => {
    resetLastProofAttempt();
    const { dir } = makeRail();
    const httpRec = createHttpRecorder({
      url: "https://recorder.test",
      apiKey: "k",
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: "fee token balance too low", code: "LOW_GAS_BALANCE" }), { status: 503 }),
    });
    // Swap in the HTTP recorder for this rail by making a dedicated rail.
    const ledger = new LedgerStore(path.join(dir, "ledger2.jsonl"));
    const cfg = cfgOrThrow();
    const rail2 = new TempoRail({
      cfg,
      ledger,
      chain: fakeChain(),
      recorder: httpRec,
      bridge: { post: async () => null },
      store: new FlowStore(null),
      holdTtlSeconds: 600,
      recorderRetryDelaysMs: [],
    });
    const done = await (await rail2.start({ amountUsdc: "1.00" })).settled;
    assert.equal(done.status, "failed");
    assert.equal(done.error?.step, "proof");
    assert.match(done.error?.message ?? "", /fee token balance too low/);
    assert.match(done.steps.find((s) => s.key === "proof")!.detail ?? "", /fee token balance too low/);
    assert.equal(done.lastProofAttempt?.status, 503);
    assert.match(done.lastProofAttempt?.error ?? "", /fee token/);

    const runtime: TempoRuntime = {
      status: cfg,
      rail: rail2,
      health: () => ({ ...publicTempoConfig(cfg), lastProofAttempt: { status: done.lastProofAttempt!.status, at: done.lastProofAttempt!.at, error: done.lastProofAttempt!.error } }),
    };
    process.env.LLX_OPERATOR_TOKEN = "operator-test-token";
    const config = loadConfig({ TREASURER_LEDGER_PATH: path.join(dir, "ledger-http.jsonl"), HOLD_ABOVE_USDC: "0.01" } as NodeJS.ProcessEnv);
    const server = startOperatorHttpServer({ config, port: 0, host: "127.0.0.1", tempo: runtime });
    await new Promise<void>((r) => server.once("listening", () => r()));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    try {
      const health = (await (await fetch(`${base}/healthz`)).json()) as { tempo: { lastProofAttempt: { status: number; error: string } } };
      assert.equal(health.tempo.lastProofAttempt.status, 503);
      assert.match(health.tempo.lastProofAttempt.error, /fee token/);

      assert.equal((await fetch(`${base}/api/tempo/last-proof-attempt`)).status, 401);
      const got = await fetch(`${base}/api/tempo/last-proof-attempt`, { headers: { authorization: `Bearer ${SERVICE_TOKEN}` } });
      assert.equal(got.status, 200);
      const body = (await got.json()) as { ok: boolean; attempt: { paymentTxHash: string; status: number; bodyPreview: string; error: string } };
      assert.equal(body.ok, true);
      assert.equal(body.attempt.paymentTxHash, TX_PAY);
      assert.equal(body.attempt.status, 503);
      assert.match(body.attempt.bodyPreview, /LOW_GAS_BALANCE/);
      assert.match(body.attempt.error, /fee token/);
    } finally {
      server.close();
    }
  });
});

describe("treasurer HTTP: Tempo routes", () => {
  async function serve(tempo: TempoRuntime, ledgerPath: string) {
    process.env.LLX_OPERATOR_TOKEN = "operator-test-token";
    const config = loadConfig({ TREASURER_LEDGER_PATH: ledgerPath, HOLD_ABOVE_USDC: "0.01" } as NodeJS.ProcessEnv);
    const server = startOperatorHttpServer({ config, port: 0, host: "127.0.0.1", tempo });
    await new Promise<void>((r) => server.once("listening", () => r()));
    const { port } = server.address() as AddressInfo;
    return { server, base: `http://127.0.0.1:${port}` };
  }

  it("is 503 when the rail is off, and Base health still answers", async () => {
    const dir = tmpDir();
    const off: TempoRuntime = { status: { enabled: false, reason: "off" }, rail: null, health: () => ({ enabled: false }) };
    const { server, base } = await serve(off, path.join(dir, "ledger.jsonl"));
    try {
      const r = await fetch(`${base}/api/tempo/config`, { headers: { authorization: `Bearer ${SERVICE_TOKEN}` } });
      assert.equal(r.status, 503);
      const h = (await (await fetch(`${base}/healthz`)).json()) as Record<string, unknown>;
      assert.equal(h.ok, true);
      assert.deepEqual(h.tempo, { enabled: false });
    } finally {
      server.close();
    }
  });

  it("requires the service token, runs a flow, and routes operator approve of a Tempo hold to the Tempo payer", async () => {
    const { rail, ledger, chain, dir } = makeRail();
    const runtime: TempoRuntime = { status: rail.cfg, rail, health: () => publicTempoConfig(rail.cfg) };
    const { server, base } = await serve(runtime, path.join(dir, "ledger.jsonl"));
    try {
      assert.equal((await fetch(`${base}/api/tempo/config`)).status, 401);
      assert.equal((await fetch(`${base}/api/tempo/config`, { headers: { authorization: "Bearer nope" } })).status, 403);
      assert.equal(
        (await fetch(`${base}/api/tempo/config`, { headers: { authorization: "Bearer operator-test-token" } })).status,
        403,
        "operator token is not the service token",
      );
      const auth = { authorization: `Bearer ${SERVICE_TOKEN}`, "content-type": "application/json" };
      const cfg = (await (await fetch(`${base}/api/tempo/config`, { headers: auth })).json()) as Record<string, unknown>;
      assert.equal(cfg.networkLabel, "Tempo mainnet");
      assert.equal(cfg.demoPayee, PAYEE);

      const start = await fetch(`${base}/api/tempo/flows`, { method: "POST", headers: auth, body: JSON.stringify({ amountUsdc: "3.00", memo: "hold demo" }) });
      assert.equal(start.status, 201);
      const { flow } = (await start.json()) as { flow: DemoPayFlow };
      assert.equal(flow.status, "held");

      // Operator HTTP approve (LLX_OPERATOR_TOKEN) dispatches Tempo holds to the Tempo rail.
      const appr = await fetch(`${base}/api/hold/${flow.holdId}/approve`, { method: "POST", headers: { authorization: "Bearer operator-test-token" } });
      assert.equal(appr.status, 200);
      const body = (await appr.json()) as Record<string, unknown>;
      assert.equal(body.type, "tempo_approved");
      for (let i = 0; i < 50 && rail.get(flow.id)!.status !== "done"; i++) await new Promise((r) => setTimeout(r, 10));
      assert.equal(rail.get(flow.id)!.status, "done");
      assert.equal(chain.sent.length, 1);
      assert.equal(getHoldResolution(ledger.readAll(), flow.holdId!), "paid");

      const got = await fetch(`${base}/api/tempo/flows/${flow.id}`, { headers: auth });
      assert.equal(((await got.json()) as { flow: DemoPayFlow }).flow.status, "done");
      assert.equal((await fetch(`${base}/api/tempo/flows/nope`, { headers: auth })).status, 404);
    } finally {
      server.close();
    }
  });
});
