/**
 * Ledger chain-sync tests (offline). Fixtures:
 *  - ledger-main-2026-09-24.jsonl: data/ledger.jsonl on main (1 payment)
 *  - payto-transfers-2026-09-24.json: the 9 real Base USDC Transfers to payTo
 *    0x1479…8c7b (read-only from mainnet.base.org)
 * Run: npm run test:ledger
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import * as shared from "@liquid-logic/shared";
import {
  isPaymentEvent,
  parseLedgerJsonl,
  serializeLedgerJsonl,
  sumSpentTodayAtomic,
  TREASURER_WALLET_ADDRESS,
  type LedgerEvent,
} from "@liquid-logic/shared";
import {
  type ChainTransfer,
  DEFAULT_PAY_TO,
  endpointForAmount,
  fetchTransfersTo,
  reconcile,
} from "../src/chain-sync.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const mainLedger = parseLedgerJsonl(fs.readFileSync(path.join(here, "ledger-main-2026-09-24.jsonl"), "utf8"));
const transfers: ChainTransfer[] = (
  JSON.parse(fs.readFileSync(path.join(here, "payto-transfers-2026-09-24.json"), "utf8")) as any[]
).map((t) => ({ ...t, blockNumber: BigInt(t.blockNumber), value: BigInt(t.value) }));

/** Same filter publish.ts uses for latest.json totalPayments. */
const published = (events: LedgerEvent[]) =>
  events.filter(isPaymentEvent).filter((p) => Boolean(p.txHash && /^0x[a-fA-F0-9]{64}$/i.test(p.txHash)));

describe("root cause: main ledger vs chain", () => {
  it("main ledger publishes 1 payment while payTo has 9 USDC receipts on Base", () => {
    assert.equal(published(mainLedger).length, 1);
    assert.equal(transfers.length, 9);
    assert.equal(new Set(transfers.map((t) => t.from.toLowerCase())).size, 2, "treasurer + one external agent");
  });
});

describe("reconcile", () => {
  it("brings the published count to 9 = chain", () => {
    const { events, added } = reconcile(mainLedger, transfers, DEFAULT_PAY_TO);
    assert.equal(added.length, 8);
    assert.equal(published(events).length, 9);
    const txs = new Set(published(events).map((p) => p.txHash!.toLowerCase()));
    for (const t of transfers) assert.ok(txs.has(t.txHash.toLowerCase()));
  });

  it("never rewrites an existing row (keeps the self-test row as-is)", () => {
    const { events } = reconcile(mainLedger, transfers, DEFAULT_PAY_TO);
    const selfTest = events.find((e) => "txHash" in e && e.txHash?.startsWith("0x93a15735"));
    assert.equal(selfTest?.reason, "self-test");
    assert.match(String((selfTest as any).endpoint), /\/api\/allowance\?wallet=/);
    // genesis rows + marker untouched
    assert.ok(events.some((e) => e.type === "note" && (e as any).message === "LAUNCH_GENESIS_RESET"));
    assert.ok(events.some((e) => e.type === "top_up"));
  });

  it("is idempotent — second run adds nothing", () => {
    const once = reconcile(mainLedger, transfers, DEFAULT_PAY_TO).events;
    const round = parseLedgerJsonl(serializeLedgerJsonl(once));
    const twice = reconcile(round, transfers, DEFAULT_PAY_TO);
    assert.equal(twice.added.length, 0);
    assert.equal(serializeLedgerJsonl(twice.events), serializeLedgerJsonl(round));
  });

  it("rows carry payer, payTo, Base network, block time, and an explorer link", () => {
    const { added } = reconcile(mainLedger, transfers, DEFAULT_PAY_TO);
    const ext = added.find((a) => a.txHash?.startsWith("0xe38b1f51"))!;
    assert.equal(ext.walletAddress, "0x7dd81398fac7de0bf843bfd874cbea68face17d2");
    assert.equal(ext.payTo, DEFAULT_PAY_TO);
    assert.equal(ext.network, "eip155:8453");
    assert.equal(ext.amountUsdc, "0.001");
    assert.equal(ext.timestamp, "2026-09-17T03:24:17.000Z");
    assert.equal(ext.basescanUrl, `https://basescan.org/tx/${ext.txHash}`);
    assert.equal(ext.endpoint, "https://audit.liquidlogicx.com/api/allowance");
  });

  it("ignores transfers to other addresses", () => {
    const other = { ...transfers[0]!, txHash: "0x" + "ff".repeat(32), to: "0x" + "12".repeat(20) };
    assert.equal(reconcile(mainLedger, [other], DEFAULT_PAY_TO).added.length, 0);
  });
});

describe("endpointForAmount (prices are unique per endpoint)", () => {
  it("maps audit / allowance prices", () => {
    assert.equal(endpointForAmount("0.05"), "https://audit.liquidlogicx.com/api/audit");
    assert.equal(endpointForAmount("0.001"), "https://audit.liquidlogicx.com/api/allowance");
    assert.match(endpointForAmount("0.3"), /unrecognized amount/);
  });
  it("maps the /api/prove price once PROVE_PRICE_USDC is in @liquid-logic/shared", (t) => {
    const prove = (shared as Record<string, unknown>).PROVE_PRICE_USDC;
    if (typeof prove !== "string") return t.skip("PROVE_PRICE_USDC not on this branch yet (lands with the /api/prove PR)");
    assert.equal(endpointForAmount(prove), "https://audit.liquidlogicx.com/api/prove");
  });
});

describe("fetchTransfersTo (Base JSON-RPC)", () => {
  it("chunks eth_getLogs ≤ 2,000 blocks, filters Transfer→payTo, caches block timestamps", async () => {
    const calls: Array<{ method: string; params: any[] }> = [];
    const log = transfers[0]!;
    const rpc = async <T>(method: string, params: any[]): Promise<T> => {
      calls.push({ method, params });
      if (method === "eth_getLogs") {
        const { fromBlock, toBlock, topics, address } = params[0];
        assert.ok(BigInt(toBlock) - BigInt(fromBlock) + 1n <= 2000n);
        assert.equal(address, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
        assert.equal(topics[2], "0x000000000000000000000000147991a1c25e78f6d9225d2dba61ed93a6158c7b");
        const bn = log.blockNumber;
        if (bn < BigInt(fromBlock) || bn > BigInt(toBlock)) return [] as T;
        return [
          {
            transactionHash: log.txHash,
            blockNumber: "0x" + bn.toString(16),
            logIndex: "0x" + log.logIndex.toString(16),
            topics: [
              "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
              "0x" + log.from.slice(2).padStart(64, "0"),
              "0x" + log.to.slice(2).padStart(64, "0"),
            ],
            data: "0x" + log.value.toString(16),
          },
        ] as T;
      }
      if (method === "eth_getBlockByNumber") return { timestamp: "0x" + log.timestamp.toString(16) } as T;
      throw new Error(method);
    };
    const got = await fetchTransfersTo({
      rpc: rpc as any,
      payTo: DEFAULT_PAY_TO,
      fromBlock: log.blockNumber - 4500n,
      toBlock: log.blockNumber + 10n,
      chunk: 2000n,
    });
    assert.equal(got.length, 1);
    assert.equal(got[0]!.txHash, log.txHash);
    assert.equal(got[0]!.value, log.value);
    assert.equal(got[0]!.timestamp, log.timestamp);
    assert.equal(calls.filter((c) => c.method === "eth_getLogs").length, 3);
    assert.equal(calls.filter((c) => c.method === "eth_getBlockByNumber").length, 1);
  });
});

describe("treasurer daily cap ignores other agents' payments to payTo", () => {
  it("sumSpentTodayAtomic(…, treasurer) skips inbound rows from other payers", () => {
    const now = new Date("2026-09-17T12:00:00Z");
    const { events } = reconcile(mainLedger, transfers, DEFAULT_PAY_TO);
    assert.equal(sumSpentTodayAtomic(events, now), 1000n, "unfiltered would count the external 0.001");
    assert.equal(sumSpentTodayAtomic(events, now, TREASURER_WALLET_ADDRESS), 0n);
  });
});
