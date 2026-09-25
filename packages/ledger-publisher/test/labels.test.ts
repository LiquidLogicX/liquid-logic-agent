/**
 * Publish-time payment labels (offline).
 *  - payer == treasurer (any case) → "self-test", including FUTURE rows from any
 *    writer (chain-sync append, paid-*-call scripts, treasurer disk sync)
 *  - ledger-labels.json override by exact tx hash → "likely Bazaar indexing check"
 *  - data/ledger.jsonl is never rewritten by the publisher
 * Run: npm run test:ledger
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isPaymentEvent,
  parseLedgerJsonl,
  serializeLedgerJsonl,
  TREASURER_WALLET_ADDRESS,
  type LedgerEvent,
  type PaymentEvent,
} from "@liquid-logic/shared";
import { type ChainTransfer, DEFAULT_PAY_TO, reconcile } from "../src/chain-sync.js";
import {
  applyLabels,
  DEFAULT_LABELS_PATH,
  labelFor,
  loadLabelOverrides,
  parseLabelOverrides,
  SELF_TEST_LABEL,
} from "../src/labels.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const ledgerPath = path.join(repoRoot, "data/ledger.jsonl");
const publishTs = path.resolve(here, "../src/publish.ts");

const BAZAAR_TX = "0xe38b1f519ca64dfa8c2260b7d49f76375c0c292c6bb04ea80096fb3573a3c0ce";
const BAZAAR_SENDER = "0x7dd81398fac7de0bf843bfd874cbea68face17d2";
const BAZAAR_LABEL = "likely Bazaar indexing check";

const overrides = loadLabelOverrides();
const ledger = parseLedgerJsonl(fs.readFileSync(ledgerPath, "utf8"));
const payments = () => ledger.filter(isPaymentEvent);

const futurePayment = (over: Partial<PaymentEvent>): PaymentEvent => ({
  type: "payment",
  timestamp: "2026-10-01T12:00:00.000Z",
  endpoint: "https://audit.liquidlogicx.com/api/audit",
  amountUsdc: "0.05",
  asset: "USDC",
  network: "eip155:8453",
  txHash: "0x" + "ab".repeat(32),
  ...over,
});

describe("self-test rule (payer = treasurer, case-insensitive)", () => {
  it("labels checksum, lowercase and uppercase treasurer payers", () => {
    for (const w of [
      TREASURER_WALLET_ADDRESS,
      TREASURER_WALLET_ADDRESS.toLowerCase(),
      "0x" + TREASURER_WALLET_ADDRESS.slice(2).toUpperCase(),
      ` ${TREASURER_WALLET_ADDRESS} `,
    ]) {
      assert.equal(labelFor(futurePayment({ walletAddress: w })), SELF_TEST_LABEL, w);
    }
  });
  it("does not label other payers, missing payer, or non-payment rows", () => {
    assert.equal(labelFor(futurePayment({ walletAddress: BAZAAR_SENDER })), undefined);
    assert.equal(labelFor(futurePayment({ walletAddress: "0x" + "12".repeat(20) })), undefined);
    assert.equal(labelFor(futurePayment({})), undefined);
    const topUp = ledger.find((e) => e.type === "top_up")!;
    const wallet = ledger.find((e) => e.type === "wallet_address")!;
    assert.equal(wallet.walletAddress, TREASURER_WALLET_ADDRESS);
    assert.equal(labelFor(topUp, overrides), undefined);
    assert.equal(labelFor(wallet, overrides), undefined);
  });
});

describe("current data/ledger.jsonl", () => {
  it("every treasurer payment is self-test; only the Bazaar row is not", () => {
    const labeled = applyLabels(ledger, overrides).filter(isPaymentEvent);
    const self = labeled.filter((p) => p.label === SELF_TEST_LABEL);
    const treasurerRows = labeled.filter(
      (p) => p.walletAddress?.toLowerCase() === TREASURER_WALLET_ADDRESS.toLowerCase(),
    );
    assert.ok(treasurerRows.length >= 10, "10 treasurer payments as of 2026-09-25");
    assert.deepEqual(self, treasurerRows);
    assert.equal(labeled.find((p) => p.txHash === BAZAAR_TX)?.label, BAZAAR_LABEL);
    // every other payer's row stays unlabeled unless it has an override
    for (const p of labeled) {
      if (p.label === SELF_TEST_LABEL || overrides.has(p.txHash!.toLowerCase())) continue;
      assert.equal(p.label, undefined, p.txHash);
    }
  });

  it("the Bazaar override matches the one 0.001 USDC payment from 0x7dd8…17d2 to payTo", () => {
    assert.deepEqual([...overrides.keys()], [BAZAAR_TX]);
    const fromSender = payments().filter((p) => p.walletAddress?.toLowerCase() === BAZAAR_SENDER);
    assert.equal(fromSender.length, 1, "only payment from that sender");
    const p = fromSender[0]!;
    assert.ok(BAZAAR_SENDER.endsWith("17d2"));
    assert.equal(p.txHash, BAZAAR_TX);
    assert.equal(p.amountUsdc, "0.001");
    assert.equal(p.payTo?.toLowerCase(), DEFAULT_PAY_TO.toLowerCase());
    assert.equal(p.timestamp, "2026-09-17T03:24:17.000Z"); // Sep 16 8:24 PM PT
  });

  it("applyLabels does not mutate the input rows", () => {
    const before = serializeLedgerJsonl(ledger);
    applyLabels(ledger, overrides);
    assert.equal(serializeLedgerJsonl(ledger), before);
  });
});

describe("override map", () => {
  it("override wins over the treasurer rule and a row label; keys are case-insensitive", () => {
    const tx = "0x" + "CD".repeat(32);
    const o = parseLabelOverrides({ labels: { [tx]: { label: "custom" } } });
    assert.equal(labelFor(futurePayment({ txHash: tx.toLowerCase(), walletAddress: TREASURER_WALLET_ADDRESS, label: "x" }), o), "custom");
  });
  it("rejects malformed entries", () => {
    assert.throws(() => parseLabelOverrides({ labels: { "0x12": "x" } }), /bad tx hash/);
    assert.throws(() => parseLabelOverrides({ labels: { ["0x" + "ab".repeat(32)]: { label: "" } } }), /missing label/);
  });
  it("default path resolves to the checked-in file", () => {
    assert.ok(fs.existsSync(DEFAULT_LABELS_PATH));
  });
});

describe("future treasurer payments", () => {
  it("chain-sync appends new treasurer rows with label self-test (existing rows untouched)", () => {
    const t: ChainTransfer = {
      txHash: "0x" + "01".repeat(32),
      blockNumber: 52_000_000n,
      logIndex: 0,
      from: TREASURER_WALLET_ADDRESS.toLowerCase(),
      to: DEFAULT_PAY_TO.toLowerCase(),
      value: 20_000n,
      timestamp: 1_790_000_000,
    };
    const ext: ChainTransfer = { ...t, txHash: "0x" + "02".repeat(32), from: "0x" + "34".repeat(20), logIndex: 1 };
    const { events, added } = reconcile(ledger, [t, ext], DEFAULT_PAY_TO);
    assert.equal(added.length, 2);
    assert.equal(added[0]!.label, SELF_TEST_LABEL);
    assert.equal(added[1]!.label, undefined);
    // existing rows byte-identical
    const existingKeys = new Set(ledger.map((e) => JSON.stringify(e)));
    assert.equal(events.filter((e) => existingKeys.has(JSON.stringify(e))).length, ledger.length);
  });

  it("an unlabeled treasurer row from paid-*-call / treasurer sync is labeled at publish", () => {
    const row = futurePayment({ walletAddress: TREASURER_WALLET_ADDRESS, reason: "paid-audit-call" });
    assert.equal(applyLabels([...ledger, row], overrides).at(-1)!.label, SELF_TEST_LABEL);
  });
});

describe("publish.ts output (end-to-end, temp dirs)", () => {
  it("writes label into latest.json, <day>.json, the ledger HTML and social drafts", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-labels-"));
    const jsonl = path.join(tmp, "ledger.jsonl");
    const future = futurePayment({ walletAddress: TREASURER_WALLET_ADDRESS.toLowerCase(), reason: "treasurer sync" });
    const external = futurePayment({ txHash: "0x" + "ef".repeat(32), timestamp: "2026-10-01T13:00:00.000Z", walletAddress: "0x" + "56".repeat(20) });
    const input = serializeLedgerJsonl([...ledger, future, external] as LedgerEvent[]);
    fs.writeFileSync(jsonl, input);
    execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), publishTs], {
      cwd: tmp, // no repo markers here → mirrors are not written into the repo
      env: {
        ...process.env,
        LEDGER_JSONL_PATH: jsonl,
        LEDGER_OUT_DIR: path.join(tmp, "out"),
        SOCIAL_DRAFTS_DIR: path.join(tmp, "drafts"),
        LEDGER_LABELS_PATH: DEFAULT_LABELS_PATH,
      },
      stdio: "pipe",
    });
    assert.equal(fs.readFileSync(jsonl, "utf8"), input, "publisher never rewrites ledger.jsonl");

    const latest = JSON.parse(fs.readFileSync(path.join(tmp, "out/latest.json"), "utf8"));
    const byTx = new Map<string, any>(latest.recentPayments.map((p: any) => [p.txHash, p]));
    assert.equal(byTx.get(BAZAAR_TX).label, BAZAAR_LABEL);
    assert.equal(byTx.get(future.txHash!).label, SELF_TEST_LABEL);
    assert.equal(byTx.get(external.txHash!).label, undefined);
    const treasurerCount = payments().filter((p) => p.walletAddress?.toLowerCase() === TREASURER_WALLET_ADDRESS.toLowerCase()).length;
    assert.equal(latest.selfTestPayments, treasurerCount + 1);
    assert.equal(latest.totalPayments, payments().length + 2);
    assert.equal(latest.recentEvents.find((e: any) => e.txHash === BAZAAR_TX).label, BAZAAR_LABEL);

    const day = JSON.parse(fs.readFileSync(path.join(tmp, "out/2026-09-17.json"), "utf8"));
    assert.equal(day.events.find((e: any) => e.txHash === BAZAAR_TX).label, BAZAAR_LABEL);
    const html17 = fs.readFileSync(path.join(tmp, "out/2026-09-17.html"), "utf8");
    assert.match(html17, /<th>Label<\/th>/);
    assert.match(html17, /<span class="label">likely Bazaar indexing check<\/span>/);
    const html14 = fs.readFileSync(path.join(tmp, "out/2026-09-14.html"), "utf8");
    const sep14Treasurer = payments().filter(
      (p) => p.timestamp.startsWith("2026-09-14") && p.walletAddress?.toLowerCase() === TREASURER_WALLET_ADDRESS.toLowerCase(),
    ).length;
    assert.equal(sep14Treasurer, 6);
    assert.equal((html14.match(/<span class="label">self-test<\/span>/g) ?? []).length, sep14Treasurer);
    const draft = fs.readFileSync(path.join(tmp, "drafts/2026-09-17.md"), "utf8");
    assert.match(draft, /\[likely Bazaar indexing check\]/);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
