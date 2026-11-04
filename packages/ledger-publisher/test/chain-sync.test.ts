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
  chunkSize,
  DEFAULT_MAX_BLOCKS_PER_RUN,
  DEFAULT_PAY_TO,
  endpointForAmount,
  fetchTransfersTo,
  formatCursor,
  parseCursorRaw,
  planScanWindow,
  reconcile,
  RPC_GETLOGS_RANGE_LIMIT,
  runChainSync,
  selectResumeState,
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
    assert.equal(endpointForAmount("0.03"), "https://audit.liquidlogicx.com/api/audit");
    assert.equal(endpointForAmount("0.05"), "https://audit.liquidlogicx.com/api/audit"); // legacy price
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
  it("chunks eth_getLogs ≤ 500 blocks, filters Transfer→payTo, caches block timestamps", async () => {
    const calls: Array<{ method: string; params: any[] }> = [];
    const log = transfers[0]!;
    const rpc = async <T>(method: string, params: any[]): Promise<T> => {
      calls.push({ method, params });
      if (method === "eth_getLogs") {
        const { fromBlock, toBlock, topics, address } = params[0];
        assert.ok(BigInt(toBlock) - BigInt(fromBlock) + 1n <= 500n);
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
    // 1500-block span with chunk 500 → exactly 3 eth_getLogs calls
    const got = await fetchTransfersTo({
      rpc: rpc as any,
      payTo: DEFAULT_PAY_TO,
      fromBlock: log.blockNumber - 1000n,
      toBlock: log.blockNumber + 499n,
      chunk: 500n,
    });
    assert.equal(got.length, 1);
    assert.equal(got[0]!.txHash, log.txHash);
    assert.equal(got[0]!.value, log.value);
    assert.equal(got[0]!.timestamp, log.timestamp);
    assert.equal(calls.filter((c) => c.method === "eth_getLogs").length, 3);
    assert.equal(calls.filter((c) => c.method === "eth_getBlockByNumber").length, 1);
  });

  it("auto-shrinks chunk when RPC says eth_getLogs is limited to a 500 range", async () => {
    const calls: Array<{ method: string; params: any[] }> = [];
    const log = transfers[0]!;
    const rpc = async <T>(method: string, params: any[]): Promise<T> => {
      calls.push({ method, params });
      if (method === "eth_getLogs") {
        const { fromBlock, toBlock } = params[0];
        const span = BigInt(toBlock) - BigInt(fromBlock) + 1n;
        if (span > 500n) throw new Error("eth_getLogs failed: eth_getLogs is limited to a 500 range");
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
    // Span must exceed 500 so the first oversized chunk actually hits the RPC limit.
    const got = await fetchTransfersTo({
      rpc: rpc as any,
      payTo: DEFAULT_PAY_TO,
      fromBlock: log.blockNumber - 100n,
      toBlock: log.blockNumber + 900n,
      chunk: 2000n, // too big for current public Base RPC
    });
    assert.equal(got.length, 1);
    const logCalls = calls.filter((c) => c.method === "eth_getLogs");
    assert.ok(logCalls.length >= 2, "first oversized call + shrunk retry");
    const firstSpan =
      BigInt(logCalls[0]!.params[0].toBlock) - BigInt(logCalls[0]!.params[0].fromBlock) + 1n;
    assert.ok(firstSpan > 500n);
    for (const c of logCalls.slice(1)) {
      const span = BigInt(c.params[0].toBlock) - BigInt(c.params[0].fromBlock) + 1n;
      assert.ok(span <= 500n);
    }
  });
});

const hexBlock = (n: bigint) => "0x" + n.toString(16);

/** Fake Base RPC. Every eth_getLogs span must stay inside the public cap. */
function fakeRpc(head: bigint, logs: Array<Record<string, unknown>> = []) {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const rpc = async <T>(method: string, params: unknown[]): Promise<T> => {
    calls.push({ method, params });
    if (method === "eth_blockNumber") return hexBlock(head) as T;
    if (method === "eth_getLogs") {
      const filter = params[0] as { fromBlock: string; toBlock: string };
      const from = BigInt(filter.fromBlock);
      const to = BigInt(filter.toBlock);
      assert.ok(to - from + 1n <= RPC_GETLOGS_RANGE_LIMIT, `eth_getLogs span ${to - from + 1n} exceeds RPC cap`);
      return logs.filter((l) => {
        const bn = BigInt(l.blockNumber as string);
        return bn >= from && bn <= to;
      }) as T;
    }
    if (method === "eth_getBlockByNumber") return { timestamp: "0x65000000" } as T;
    throw new Error(method);
  };
  return { rpc: rpc as Parameters<typeof runChainSync>[0]["rpc"], calls };
}

function payToLog(block: bigint, txHash: string) {
  return {
    transactionHash: txHash,
    blockNumber: hexBlock(block),
    logIndex: "0x1",
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "0x" + "ab".repeat(32),
      "0x" + DEFAULT_PAY_TO.slice(2).toLowerCase().padStart(64, "0"),
    ],
    data: "0x3e8",
  };
}

const paymentLine = (txHash: string, timestamp: string) =>
  JSON.stringify({
    type: "payment",
    timestamp,
    endpoint: "https://audit.liquidlogicx.com/api/allowance",
    amountUsdc: "0.001",
    asset: "USDC",
    network: "eip155:8453",
    txHash,
    walletAddress: "0x" + "ab".repeat(20),
    payTo: DEFAULT_PAY_TO,
    reason: "x402 payment received by payTo (Base chain-sync)",
  });

describe("bounded checkpointed scan", () => {
  const staleCursor = 52_257_940n;
  const backlog = 1_260_000n;

  it("keeps the per-run cap above Denim's 10× block rate and under a full rescan", () => {
    const sixHoursSeconds = 6n * 60n * 60n;
    const denimBlockTimeMs = 200n;
    const denimBlocksPerRun = (sixHoursSeconds * 1000n) / denimBlockTimeMs;
    assert.equal(denimBlocksPerRun, 108_000n);
    assert.ok(DEFAULT_MAX_BLOCKS_PER_RUN > denimBlocksPerRun);
    assert.ok(DEFAULT_MAX_BLOCKS_PER_RUN < backlog);
    assert.equal(DEFAULT_MAX_BLOCKS_PER_RUN / RPC_GETLOGS_RANGE_LIMIT, 500n);
    assert.equal(RPC_GETLOGS_RANGE_LIMIT, 500n);
  });

  it("plans a capped window across the 1.26M-block gap and a short one at the tip", () => {
    const fromBlock = staleCursor + 1n;
    const tip = fromBlock + backlog - 1n;
    const capped = planScanWindow({ fromBlock, confirmedTip: tip, maxBlocks: DEFAULT_MAX_BLOCKS_PER_RUN });
    assert.ok(capped);
    assert.equal(capped.toBlock - capped.fromBlock + 1n, DEFAULT_MAX_BLOCKS_PER_RUN);
    assert.equal(capped.caughtUp, false);
    assert.ok(capped.toBlock < tip);

    const nearTip = planScanWindow({
      fromBlock: tip - 100n,
      confirmedTip: tip,
      maxBlocks: DEFAULT_MAX_BLOCKS_PER_RUN,
    });
    assert.equal(nearTip?.toBlock, tip);
    assert.equal(nearTip?.caughtUp, true);
    assert.equal(planScanWindow({ fromBlock: tip + 1n, confirmedTip: tip, maxBlocks: 10n }), null);
    assert.throws(() => planScanWindow({ fromBlock: 1n, confirmedTip: 2n, maxBlocks: 0n }));
  });

  it("clamps eth_getLogs chunks to the RPC range cap", () => {
    assert.equal(chunkSize(5_000n), 500n);
    assert.equal(chunkSize(100n), 100n);
    assert.equal(chunkSize(0n), 500n);
    assert.equal(chunkSize(2_000n, 2_000n), 2_000n);
  });

  it("scans at most the cap, in ≤500-block chunks, and checkpoints the last block of the window", async () => {
    const fromBlock = staleCursor + 1n;
    const head = fromBlock + backlog + 12n;
    const { rpc, calls } = fakeRpc(head);
    let cursor = "";
    const result = await runChainSync({
      rpc,
      payTo: DEFAULT_PAY_TO,
      startBlock: fromBlock,
      chunk: 5_000n, // oversized on purpose; the run must clamp
      maxBlocks: DEFAULT_MAX_BLOCKS_PER_RUN,
      confirmations: 12n,
      localCursorRaw: null,
      localLedgerRaw: "",
      writeCursor: (body) => {
        cursor = body;
      },
      writeLedger: () => {
        throw new Error("ledger should not change when the window has no transfers");
      },
    });
    assert.equal("skipped" in result, false);
    if (!("scanned" in result)) throw new Error("expected a scan");
    assert.equal(result.blocksScanned, DEFAULT_MAX_BLOCKS_PER_RUN.toString());
    assert.equal(result.caughtUp, false);
    assert.equal(result.chunk, "500");
    assert.equal(result.scanned.fromBlock, fromBlock.toString());
    const logCalls = calls.filter((c) => c.method === "eth_getLogs");
    assert.equal(logCalls.length, 500);
    assert.equal(parseCursorRaw(cursor, DEFAULT_PAY_TO), BigInt(result.scanned.toBlock));
    const last = logCalls[logCalls.length - 1]!.params[0] as { toBlock: string };
    assert.equal(BigInt(last.toBlock), BigInt(result.scanned.toBlock));
  });

  it("resumes from the checkpoint and does not rescan the previous window", async () => {
    const startBlock = 1_000n;
    const head = startBlock + 1_000_000n;
    let cursorRaw: string | null = null;
    const base = {
      payTo: DEFAULT_PAY_TO,
      startBlock,
      chunk: 500n,
      maxBlocks: 1_000n,
      confirmations: 12n,
      localLedgerRaw: "",
      writeLedger: () => {
        throw new Error("no transfers");
      },
    };
    const firstRpc = fakeRpc(head);
    const first = await runChainSync({
      ...base,
      rpc: firstRpc.rpc,
      localCursorRaw: null,
      writeCursor: (body) => {
        cursorRaw = body;
      },
    });
    if (!("scanned" in first)) throw new Error("expected a scan");
    assert.equal(first.scanned.fromBlock, "1000");
    assert.equal(first.scanned.toBlock, "1999");
    assert.equal(firstRpc.calls.filter((c) => c.method === "eth_getLogs").length, 2);

    const secondRpc = fakeRpc(head);
    const second = await runChainSync({
      ...base,
      rpc: secondRpc.rpc,
      localCursorRaw: cursorRaw,
      writeCursor: (body) => {
        cursorRaw = body;
      },
    });
    if (!("scanned" in second)) throw new Error("expected a scan");
    assert.equal(second.resumedFromBlock, "1999");
    assert.equal(second.scanned.fromBlock, "2000");
    assert.equal(second.scanned.toBlock, "2999");
    for (const call of secondRpc.calls.filter((c) => c.method === "eth_getLogs")) {
      const filter = call.params[0] as { fromBlock: string };
      assert.ok(BigInt(filter.fromBlock) >= 2_000n);
    }
    assert.equal(parseCursorRaw(cursorRaw, DEFAULT_PAY_TO), 2_999n);
  });

  it("adopts a newer automation-branch checkpoint and keeps its unmerged payments", async () => {
    const localCursor = formatCursor(DEFAULT_PAY_TO, staleCursor);
    const resumeAt = 53_492_212n;
    const localTx = "0x" + "11".repeat(32);
    const resumedTx = "0x" + "22".repeat(32);
    const localLedger = paymentLine(localTx, "2026-10-06T00:00:00.000Z") + "\n";
    const resumeLedger =
      localLedger + paymentLine(resumedTx, "2026-10-20T00:00:00.000Z") + "\n";
    const head = resumeAt + 1_000n + 12n;
    const { rpc, calls } = fakeRpc(head);
    let ledger = "";
    const result = await runChainSync({
      rpc,
      payTo: DEFAULT_PAY_TO,
      startBlock: 51_266_000n,
      chunk: 500n,
      maxBlocks: DEFAULT_MAX_BLOCKS_PER_RUN,
      confirmations: 12n,
      localCursorRaw: localCursor,
      localLedgerRaw: localLedger,
      resumes: [{ cursorRaw: formatCursor(DEFAULT_PAY_TO, resumeAt), ledgerRaw: resumeLedger }],
      writeCursor: () => {},
      writeLedger: (body) => {
        ledger = body;
      },
    });
    if (!("scanned" in result)) throw new Error("expected a scan");
    assert.equal(result.resumedFromBlock, resumeAt.toString());
    assert.equal(result.scanned.fromBlock, (resumeAt + 1n).toString());
    assert.equal(result.blocksScanned, "1000");
    assert.equal(result.caughtUp, true);
    const logCalls = calls.filter((c) => c.method === "eth_getLogs");
    assert.equal(logCalls.length, 2);
    for (const call of logCalls) {
      const filter = call.params[0] as { fromBlock: string };
      assert.ok(BigInt(filter.fromBlock) > resumeAt);
    }
    assert.match(ledger, new RegExp(localTx));
    assert.match(ledger, new RegExp(resumedTx));
  });

  it("ignores a resume bundle that is empty, stale, malformed, or for another payTo", () => {
    const localLedger = paymentLine("0x" + "11".repeat(32), "2026-10-06T00:00:00.000Z") + "\n";
    const localCursor = formatCursor(DEFAULT_PAY_TO, 1_000n);
    const state = selectResumeState({
      payTo: DEFAULT_PAY_TO,
      startBlock: 100n,
      localCursorRaw: localCursor,
      localLedgerRaw: localLedger,
      resumes: [
        { cursorRaw: formatCursor(DEFAULT_PAY_TO, 9_000n), ledgerRaw: "" },
        { cursorRaw: formatCursor(DEFAULT_PAY_TO, 9_000n), ledgerRaw: null },
        { cursorRaw: "{", ledgerRaw: localLedger },
        { cursorRaw: formatCursor("0x" + "cd".repeat(20), 9_000n), ledgerRaw: localLedger },
        { cursorRaw: formatCursor(DEFAULT_PAY_TO, 500n), ledgerRaw: paymentLine("0x" + "33".repeat(32), "2026-10-01T00:00:00.000Z") + "\n" },
      ],
    });
    assert.equal(state.fromBlock, 1_001n);
    assert.equal(state.checkpointBlock, 1_000n);
    assert.equal(state.events.length, 1);
  });

  it("does not advance the checkpoint when the RPC scan fails", async () => {
    let writes = 0;
    const rpc = async <T>(method: string): Promise<T> => {
      if (method === "eth_blockNumber") return hexBlock(50_000n) as T;
      throw new Error("eth_getLogs failed: timeout");
    };
    await assert.rejects(() =>
      runChainSync({
        rpc: rpc as Parameters<typeof runChainSync>[0]["rpc"],
        payTo: DEFAULT_PAY_TO,
        startBlock: 1_000n,
        chunk: 500n,
        maxBlocks: 1_000n,
        confirmations: 12n,
        localCursorRaw: formatCursor(DEFAULT_PAY_TO, 999n),
        localLedgerRaw: "",
        writeCursor: () => {
          writes++;
        },
        writeLedger: () => {
          writes++;
        },
      }),
    );
    assert.equal(writes, 0);
  });

  it("writes the ledger before the checkpoint so a failed cursor write retries the window", async () => {
    const tx = "0x" + "44".repeat(32);
    const block = 1_500n;
    const { rpc } = fakeRpc(10_000n, [payToLog(block, tx)]);
    let cursorWrites = 0;
    await assert.rejects(
      () =>
        runChainSync({
          rpc,
          payTo: DEFAULT_PAY_TO,
          startBlock: 1_000n,
          chunk: 500n,
          maxBlocks: 1_000n,
          confirmations: 12n,
          localCursorRaw: null,
          localLedgerRaw: "",
          writeLedger: () => {
            throw new Error("disk full");
          },
          writeCursor: () => {
            cursorWrites++;
          },
        }),
      /disk full/,
    );
    assert.equal(cursorWrites, 0);
  });

  it("records a newer restored checkpoint even when the tip has not moved past it", async () => {
    const localTx = "0x" + "11".repeat(32);
    const resumedTx = "0x" + "55".repeat(32);
    const localLedger = paymentLine(localTx, "2026-10-06T00:00:00.000Z") + "\n";
    const resumeLedger = localLedger + paymentLine(resumedTx, "2026-10-20T00:00:00.000Z") + "\n";
    const resumeAt = 5_000n;
    const { rpc, calls } = fakeRpc(resumeAt + 12n);
    let cursor = "";
    let ledger = "";
    const result = await runChainSync({
      rpc,
      payTo: DEFAULT_PAY_TO,
      startBlock: 100n,
      chunk: 500n,
      maxBlocks: 1_000n,
      confirmations: 12n,
      localCursorRaw: formatCursor(DEFAULT_PAY_TO, 1_000n),
      localLedgerRaw: localLedger,
      resumes: [{ cursorRaw: formatCursor(DEFAULT_PAY_TO, resumeAt), ledgerRaw: resumeLedger }],
      writeCursor: (body) => {
        cursor = body;
      },
      writeLedger: (body) => {
        ledger = body;
      },
    });
    assert.equal(result.skipped, true);
    assert.equal(parseCursorRaw(cursor, DEFAULT_PAY_TO), resumeAt);
    assert.match(ledger, new RegExp(localTx));
    assert.match(ledger, new RegExp(resumedTx));
    assert.equal(calls.filter((c) => c.method === "eth_getLogs").length, 0);
  });

  it("skips when the checkpoint is already at the confirmed tip and does not rewrite the cursor", async () => {
    const { rpc, calls } = fakeRpc(1_010n);
    let cursorWrites = 0;
    const result = await runChainSync({
      rpc,
      payTo: DEFAULT_PAY_TO,
      startBlock: 1n,
      chunk: 500n,
      maxBlocks: 1_000n,
      confirmations: 12n,
      localCursorRaw: formatCursor(DEFAULT_PAY_TO, 1_000n),
      localLedgerRaw: "",
      writeCursor: () => {
        cursorWrites++;
      },
      writeLedger: () => {
        throw new Error("ledger unchanged");
      },
    });
    assert.equal(result.skipped, true);
    assert.equal(cursorWrites, 0);
    assert.equal(calls.filter((c) => c.method === "eth_getLogs").length, 0);
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
