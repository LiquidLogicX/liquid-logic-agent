/**
 * Base chain → data/ledger.jsonl reconciler for x402 payments received by payTo.
 *
 * Why: the ledger was only fed by (a) the treasurer disk sync and (b) the
 * paid-*-call scripts, i.e. only LLX's own outgoing payments. Payments that
 * other agents make to /api/audit, /api/allowance, /api/prove never reached
 * data/ledger.jsonl, and the LAUNCH_GENESIS_RESET truncate dropped the
 * pre-launch treasurer→payTo payments. The published ledger therefore showed 1
 * payment while payTo had 9 USDC Transfers on Base.
 *
 * This reads Base USDC Transfers *to* payTo via JSON-RPC eth_getLogs and
 * appends any tx hash that is not already in the ledger. Existing rows are
 * never modified. Only blocks with ≥ CONFIRMATIONS are scanned.
 *
 * Each run writes data/chain-sync.json (`lastScannedBlock`) and scans at most
 * DEFAULT_MAX_BLOCKS_PER_RUN blocks, in chunks no larger than the RPC
 * eth_getLogs cap (500 on public mainnet.base.org). If the node returns
 * "limited to a N range", the scanner auto-shrinks. The next run resumes at
 * lastScannedBlock + 1.
 *
 * publish-ledger checks out main, and main is protected, so the checkpoint
 * usually lives on automation/ledger-publish until that PR merges. A newer
 * checkpoint passed via LEDGER_CHAIN_SYNC_RESUME_* wins over the file on
 * main, and that branch's ledger rows are merged in first so those blocks
 * are not scanned again and unmerged payments are not dropped.
 *
 * Base Denim (~2026-11-05) produces blocks about 10× faster (~200ms,
 * ~108_000 per 6-hour run). The per-run cap stays above that inflow so a
 * backlog shrinks, and far below the ~1.26M-block rescan from the stale
 * cursor on main (52257940).
 *
 * Usage (repo root): npm run chain-sync-ledger
 * Env: BASE_RPC_URL, LEDGER_PAY_TO_EVM, LEDGER_JSONL_PATH, LEDGER_CHAIN_SYNC_CURSOR,
 *      LEDGER_CHAIN_SYNC_CHUNK (default 500), LEDGER_CHAIN_SYNC_MAX_BLOCKS
 *      (default DEFAULT_MAX_BLOCKS_PER_RUN), LEDGER_CHAIN_SYNC_RPC_LIMIT
 *      (paid endpoints that allow a wider eth_getLogs), LEDGER_CHAIN_SYNC_START_BLOCK
 *      (default DEFAULT_START_BLOCK = full payTo history, including the
 *      pre-launch Sep 13–14 treasurer self-tests the genesis reset dropped),
 *      LEDGER_CHAIN_SYNC_RESUME_CURSOR, LEDGER_CHAIN_SYNC_RESUME_LEDGER
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as shared from "@liquid-logic/shared";
import {
  ALLOWANCE_PRICE_USDC,
  AUDIT_PRICE_USDC,
  atomicToUsdc,
  explorerTxUrl,
  ledgerEventKey,
  mergeLedgerEvents,
  NETWORK_BASE,
  parseLedgerJsonl,
  serializeLedgerJsonl,
  USDC_BASE_MAINNET,
  type LedgerEvent,
  type PaymentEvent,
} from "@liquid-logic/shared";

/** x402 payTo for audit.liquidlogicx.com on Base (AUDIT_PAY_TO_EVM in Vercel). */
export const DEFAULT_PAY_TO = "0x147991A1c25e78f6D9225d2dBA61eD93A6158c7b";
/** Just before payTo's first USDC receipt (block 51266731, 2026-09-13). */
export const DEFAULT_START_BLOCK = 51_266_000n;
export const CONFIRMATIONS = 12n;
/** Public mainnet.base.org eth_getLogs range cap (500 as of 2026-10-05). */
export const RPC_GETLOGS_RANGE_LIMIT = 500n;
/** Default eth_getLogs window. Override via LEDGER_CHAIN_SYNC_CHUNK. Clamped to the RPC cap. */
export const DEFAULT_CHUNK = RPC_GETLOGS_RANGE_LIMIT;
/**
 * Blocks scanned per publish-ledger run.
 * 6h at 2s blocks ≈ 10_800; Denim at ~200ms ≈ 108_000. 250_000 stays ahead of
 * that inflow (500 eth_getLogs calls at the public cap) and bounds a cold
 * start that would otherwise walk ~1.26M blocks back to the cursor on main.
 */
export const DEFAULT_MAX_BLOCKS_PER_RUN = 250_000n;
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const AUDIT_ORIGIN = "https://audit.liquidlogicx.com";

export type ChainTransfer = {
  txHash: string;
  blockNumber: bigint;
  logIndex: number;
  from: string;
  to: string;
  value: bigint;
  timestamp: number; // unix seconds (Base block time)
};

/**
 * Price → endpoint. Prices are unique per endpoint so the amount identifies the
 * route. PROVE_PRICE_USDC is read optionally so this works before and after the
 * /api/prove PR lands in @liquid-logic/shared.
 */
export function endpointForAmount(amountUsdc: string): string {
  const table: Array<[unknown, string]> = [
    [AUDIT_PRICE_USDC, "/api/audit"],
    ["0.05", "/api/audit"], // legacy audit price (before the $0.03 change); keeps old payments mapped
    [ALLOWANCE_PRICE_USDC, "/api/allowance"],
    [(shared as Record<string, unknown>).PROVE_PRICE_USDC, "/api/prove"],
  ];
  for (const [price, route] of table) {
    if (typeof price !== "string") continue;
    if (shared.usdcToAtomic(price) === shared.usdcToAtomic(amountUsdc)) return `${AUDIT_ORIGIN}${route}`;
  }
  return `${AUDIT_ORIGIN} (x402 payment, unrecognized amount)`;
}

export function transferToEvent(t: ChainTransfer, payTo: string): PaymentEvent {
  const amountUsdc = atomicToUsdc(t.value);
  return {
    type: "payment",
    timestamp: new Date(t.timestamp * 1000).toISOString(),
    endpoint: endpointForAmount(amountUsdc),
    amountUsdc,
    asset: "USDC",
    network: NETWORK_BASE,
    txHash: t.txHash,
    basescanUrl: explorerTxUrl(NETWORK_BASE, t.txHash),
    walletAddress: t.from,
    payTo,
    reason: "x402 payment received by payTo (Base chain-sync)",
  };
}

/**
 * Pure merge: add a payment row for every transfer whose tx hash is not already
 * a payment/top_up in the ledger. Never rewrites existing rows (so a richer
 * treasurer row, e.g. reason "self-test", is kept as-is).
 */
export function reconcile(
  existing: LedgerEvent[],
  transfers: ChainTransfer[],
  payTo: string,
): { events: LedgerEvent[]; added: PaymentEvent[] } {
  const have = new Set(existing.map((e) => ledgerEventKey(e)));
  const haveTx = new Set(
    existing
      .filter((e) => (e.type === "payment" || e.type === "top_up") && "txHash" in e && e.txHash)
      .map((e) => (e as { txHash: string }).txHash.toLowerCase()),
  );
  const added: PaymentEvent[] = [];
  for (const t of transfers) {
    if (t.to.toLowerCase() !== payTo.toLowerCase()) continue;
    const tx = t.txHash.toLowerCase();
    if (haveTx.has(tx)) continue;
    const ev = transferToEvent(t, payTo);
    if (have.has(ledgerEventKey(ev))) continue;
    haveTx.add(tx);
    added.push(ev);
  }
  return { events: added.length ? mergeLedgerEvents(existing, added) : existing, added };
}

// ------------------------------------------------------------------ RPC

type Rpc = <T>(method: string, params: unknown[]) => Promise<T>;

/** Parse "eth_getLogs is limited to a 500 range" → 500n, else null. */
export function parseGetLogsRangeLimit(message: string): bigint | null {
  const m = message.match(/limited to a (\d+)\s*range/i);
  return m ? BigInt(m[1]!) : null;
}

export function jsonRpc(url: string, fetchImpl: typeof fetch = fetch): Rpc {
  let id = 0;
  return async <T>(method: string, params: unknown[]): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      });
      const body = (await res.json().catch(() => ({}))) as { result?: T; error?: { message?: string } };
      if (res.ok && !body.error) return body.result as T;
      const msg = body.error?.message ?? String(res.status);
      // Range-limit and other permanent RPC policy errors: do not burn retries.
      if (parseGetLogsRangeLimit(msg) !== null || attempt >= 4) {
        throw new Error(`${method} failed: ${msg}`);
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  };
}

const hex = (n: bigint) => `0x${n.toString(16)}`;
const topicAddr = (t: string) => `0x${t.slice(-40)}`;
const addrTopic = (a: string) => `0x${a.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

type GetLogsRow = {
  transactionHash: string;
  blockNumber: string;
  logIndex: string;
  topics: string[];
  data: string;
  removed?: boolean;
};

export async function fetchTransfersTo(opts: {
  rpc: Rpc;
  payTo: string;
  fromBlock: bigint;
  toBlock: bigint;
  chunk: bigint;
}): Promise<ChainTransfer[]> {
  const out: ChainTransfer[] = [];
  const tsCache = new Map<string, number>();
  let chunk = opts.chunk > 0n ? opts.chunk : DEFAULT_CHUNK;

  for (let from = opts.fromBlock; from <= opts.toBlock; ) {
    const to = from + chunk - 1n < opts.toBlock ? from + chunk - 1n : opts.toBlock;
    let logs: GetLogsRow[];
    try {
      logs = await opts.rpc<GetLogsRow[]>("eth_getLogs", [
        {
          address: USDC_BASE_MAINNET,
          fromBlock: hex(from),
          toBlock: hex(to),
          topics: [TRANSFER_TOPIC, null, addrTopic(opts.payTo)],
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const limit = parseGetLogsRangeLimit(msg);
      const span = to - from + 1n;
      if (limit !== null && limit > 0n && span > limit) {
        // Public Base RPC tightened; shrink and retry this window (and remaining).
        chunk = limit;
        continue;
      }
      throw err;
    }
    for (const l of logs) {
      if (l.removed || l.topics.length !== 3) continue;
      let ts = tsCache.get(l.blockNumber);
      if (ts === undefined) {
        const b = await opts.rpc<{ timestamp: string }>("eth_getBlockByNumber", [l.blockNumber, false]);
        ts = Number(BigInt(b.timestamp));
        tsCache.set(l.blockNumber, ts);
      }
      out.push({
        txHash: l.transactionHash,
        blockNumber: BigInt(l.blockNumber),
        logIndex: Number(BigInt(l.logIndex)),
        from: topicAddr(l.topics[1]!),
        to: topicAddr(l.topics[2]!),
        value: BigInt(l.data),
        timestamp: ts,
      });
    }
    from = to + 1n;
  }
  return out;
}

// ------------------------------------------------------------------ scan window

type Cursor = { payTo: string; lastScannedBlock: string };

/** eth_getLogs span to request. Never larger than the RPC range cap. */
export function chunkSize(requested: bigint, rpcRangeLimit: bigint = RPC_GETLOGS_RANGE_LIMIT): bigint {
  const limit = rpcRangeLimit > 0n ? rpcRangeLimit : RPC_GETLOGS_RANGE_LIMIT;
  if (requested <= 0n || requested > limit) return limit;
  return requested;
}

/**
 * Inclusive window for this run. null when every confirmed block is already
 * behind the resume point. `caughtUp` is false when the cap, not the chain
 * tip, ended the window — the checkpoint must still advance.
 */
export function planScanWindow(opts: {
  fromBlock: bigint;
  confirmedTip: bigint;
  maxBlocks: bigint;
}): { fromBlock: bigint; toBlock: bigint; caughtUp: boolean } | null {
  if (opts.maxBlocks <= 0n) throw new Error("maxBlocks must be positive");
  if (opts.confirmedTip < opts.fromBlock) return null;
  const cappedEnd = opts.fromBlock + opts.maxBlocks - 1n;
  const toBlock = cappedEnd < opts.confirmedTip ? cappedEnd : opts.confirmedTip;
  return { fromBlock: opts.fromBlock, toBlock, caughtUp: toBlock === opts.confirmedTip };
}

export function formatCursor(payTo: string, lastScannedBlock: bigint): string {
  return JSON.stringify({ payTo, lastScannedBlock: lastScannedBlock.toString() } satisfies Cursor, null, 2) + "\n";
}

/** Checkpoint block for this payTo, or null when the file is missing, malformed, or for another address. */
export function parseCursorRaw(raw: string | null | undefined, payTo: string): bigint | null {
  if (!raw?.trim()) return null;
  let parsed: Partial<Cursor>;
  try {
    parsed = JSON.parse(raw) as Partial<Cursor>;
  } catch {
    return null;
  }
  if (parsed.payTo?.toLowerCase() !== payTo.toLowerCase()) return null;
  if (typeof parsed.lastScannedBlock !== "string" || !/^\d+$/.test(parsed.lastScannedBlock)) return null;
  return BigInt(parsed.lastScannedBlock);
}

export type ResumeBundle = {
  cursorRaw: string | null;
  ledgerRaw: string | null;
};

/**
 * Resume at one past the newest checkpoint. A resume bundle is adopted only
 * when its cursor is strictly ahead and it carries a non-empty ledger, and
 * those rows are union-merged so unmerged payments survive the next commit
 * (which is cut from main, not from the automation branch).
 */
export function selectResumeState(opts: {
  payTo: string;
  startBlock: bigint;
  localCursorRaw: string | null;
  localLedgerRaw: string;
  resumes?: ResumeBundle[];
}): { fromBlock: bigint; events: LedgerEvent[]; checkpointBlock: bigint | null } {
  const localEvents = parseLedgerJsonl(opts.localLedgerRaw);
  let bestBlock = parseCursorRaw(opts.localCursorRaw, opts.payTo);
  let bestEvents: LedgerEvent[] | null = null;

  for (const resume of opts.resumes ?? []) {
    if (resume.ledgerRaw == null || resume.ledgerRaw.trim() === "") continue;
    const block = parseCursorRaw(resume.cursorRaw, opts.payTo);
    if (block === null) continue;
    if (bestBlock !== null && block <= bestBlock) continue;
    bestBlock = block;
    bestEvents = parseLedgerJsonl(resume.ledgerRaw);
  }

  const events = bestEvents ? mergeLedgerEvents(localEvents, bestEvents) : localEvents;
  const fromBlock =
    bestBlock === null ? opts.startBlock : bestBlock + 1n > opts.startBlock ? bestBlock + 1n : opts.startBlock;
  return { fromBlock, events, checkpointBlock: bestBlock };
}

export type ChainSyncAdded = {
  txHash: string;
  amountUsdc: string;
  endpoint: string;
  from: string;
};

export type ChainSyncRunResult =
  | {
      ok: true;
      skipped: true;
      reason: "no new confirmed blocks";
      payTo: string;
      resumedFromBlock: string | null;
    }
  | {
      ok: true;
      payTo: string;
      resumedFromBlock: string | null;
      scanned: { fromBlock: string; toBlock: string };
      blocksScanned: string;
      caughtUp: boolean;
      maxBlocks: string;
      chunk: string;
      transfersSeen: number;
      added: ChainSyncAdded[];
    };

/**
 * One publish-ledger scan: resume from the newest checkpoint, walk a bounded
 * window in RPC-sized chunks, write the ledger (if it changed) before the
 * checkpoint so a failed cursor write retries the same window instead of
 * skipping payments.
 */
export async function runChainSync(opts: {
  rpc: Rpc;
  payTo: string;
  startBlock: bigint;
  chunk: bigint;
  maxBlocks: bigint;
  confirmations: bigint;
  rpcRangeLimit?: bigint;
  localCursorRaw: string | null;
  localLedgerRaw: string;
  resumes?: ResumeBundle[];
  writeCursor: (body: string) => void;
  writeLedger: (body: string) => void;
}): Promise<ChainSyncRunResult> {
  const resume = selectResumeState(opts);
  const head = BigInt(await opts.rpc<string>("eth_blockNumber", []));
  const confirmedTip = head - opts.confirmations;
  const maxBlocks = opts.maxBlocks > 0n ? opts.maxBlocks : DEFAULT_MAX_BLOCKS_PER_RUN;
  const window = planScanWindow({
    fromBlock: resume.fromBlock,
    confirmedTip,
    maxBlocks,
  });
  const resumedFromBlock = resume.checkpointBlock?.toString() ?? null;

  const writeLedgerIfChanged = (events: LedgerEvent[]) => {
    const next = serializeLedgerJsonl(events);
    const prev = serializeLedgerJsonl(parseLedgerJsonl(opts.localLedgerRaw));
    if (next !== prev) opts.writeLedger(next);
  };

  if (!window) {
    writeLedgerIfChanged(resume.events);
    // Nothing new to scan, but the adopted checkpoint may live only on the
    // automation branch. Write it onto this checkout so the commit records
    // it; otherwise the next run opens main's stale cursor and rescans.
    const localBlock = parseCursorRaw(opts.localCursorRaw, opts.payTo);
    if (resume.checkpointBlock !== null && (localBlock === null || resume.checkpointBlock > localBlock)) {
      opts.writeCursor(formatCursor(opts.payTo, resume.checkpointBlock));
    }
    return {
      ok: true,
      skipped: true,
      reason: "no new confirmed blocks",
      payTo: opts.payTo,
      resumedFromBlock,
    };
  }

  const chunk = chunkSize(opts.chunk, opts.rpcRangeLimit ?? RPC_GETLOGS_RANGE_LIMIT);
  const transfers = await fetchTransfersTo({
    rpc: opts.rpc,
    payTo: opts.payTo,
    fromBlock: window.fromBlock,
    toBlock: window.toBlock,
    chunk,
  });
  const { events, added } = reconcile(resume.events, transfers, opts.payTo);
  // Ledger first, checkpoint second. Reconcile is idempotent, so a run that
  // dies before the cursor write scans this window again. The reverse order
  // would skip the window and drop the payments.
  writeLedgerIfChanged(events);
  opts.writeCursor(formatCursor(opts.payTo, window.toBlock));

  return {
    ok: true,
    payTo: opts.payTo,
    resumedFromBlock,
    scanned: { fromBlock: window.fromBlock.toString(), toBlock: window.toBlock.toString() },
    blocksScanned: (window.toBlock - window.fromBlock + 1n).toString(),
    caughtUp: window.caughtUp,
    maxBlocks: maxBlocks.toString(),
    chunk: chunk.toString(),
    transfersSeen: transfers.length,
    added: added.map((a) => ({
      txHash: a.txHash ?? "",
      amountUsdc: a.amountUsdc,
      endpoint: a.endpoint,
      from: a.walletAddress ?? "",
    })),
  };
}

// ------------------------------------------------------------------ main

function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "GUARDRAILS.md"))) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function envBigint(name: string, fallback: bigint): bigint {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a non-negative integer`);
  return BigInt(raw);
}

function readMaybe(filePath: string | undefined): string | null {
  if (!filePath?.trim()) return null;
  const abs = path.resolve(filePath.trim());
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

function writeTextAtomic(filePath: string, body: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, filePath);
}

async function main(): Promise<void> {
  const root = repoRoot();
  const jsonlPath = path.resolve(process.env.LEDGER_JSONL_PATH ?? path.join(root, "data/ledger.jsonl"));
  const cursorPath = path.resolve(process.env.LEDGER_CHAIN_SYNC_CURSOR ?? path.join(root, "data/chain-sync.json"));
  const payTo = (process.env.LEDGER_PAY_TO_EVM ?? process.env.AUDIT_PAY_TO_EVM ?? DEFAULT_PAY_TO).replace(/\s+/g, "");
  if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) throw new Error("LEDGER_PAY_TO_EVM must be a 0x address");
  const rpcUrl = process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org";
  const rpc = jsonRpc(rpcUrl);

  const result = await runChainSync({
    rpc,
    payTo,
    startBlock: envBigint("LEDGER_CHAIN_SYNC_START_BLOCK", DEFAULT_START_BLOCK),
    chunk: envBigint("LEDGER_CHAIN_SYNC_CHUNK", DEFAULT_CHUNK),
    maxBlocks: envBigint("LEDGER_CHAIN_SYNC_MAX_BLOCKS", DEFAULT_MAX_BLOCKS_PER_RUN),
    confirmations: CONFIRMATIONS,
    rpcRangeLimit: envBigint("LEDGER_CHAIN_SYNC_RPC_LIMIT", RPC_GETLOGS_RANGE_LIMIT),
    localCursorRaw: readMaybe(cursorPath),
    localLedgerRaw: readMaybe(jsonlPath) ?? "",
    resumes: [
      {
        cursorRaw: readMaybe(process.env.LEDGER_CHAIN_SYNC_RESUME_CURSOR),
        ledgerRaw: readMaybe(process.env.LEDGER_CHAIN_SYNC_RESUME_LEDGER),
      },
    ],
    writeCursor: (body) => writeTextAtomic(cursorPath, body),
    writeLedger: (body) => writeTextAtomic(jsonlPath, body),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
