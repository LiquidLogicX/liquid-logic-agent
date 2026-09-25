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
 * This reads every Base USDC Transfer *to* payTo via JSON-RPC eth_getLogs
 * (public RPC caps ranges at 2,000 blocks) and appends any tx hash that is not
 * already in the ledger. Existing rows are never modified. Only blocks with
 * ≥ CONFIRMATIONS are scanned; a cursor in data/chain-sync.json keeps runs short.
 *
 * Usage (repo root): npm run chain-sync-ledger
 * Env: BASE_RPC_URL, LEDGER_PAY_TO_EVM, LEDGER_JSONL_PATH, LEDGER_CHAIN_SYNC_CURSOR,
 *      LEDGER_CHAIN_SYNC_CHUNK (default 2000), LEDGER_CHAIN_SYNC_START_BLOCK
 *      (default DEFAULT_START_BLOCK = full payTo history, which includes the
 *      pre-launch Sep 13–14 treasurer self-tests the genesis reset had dropped)
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
import { withLabel } from "./labels.js";

/** x402 payTo for audit.liquidlogicx.com on Base (AUDIT_PAY_TO_EVM in Vercel). */
export const DEFAULT_PAY_TO = "0x147991A1c25e78f6D9225d2dBA61eD93A6158c7b";
/** Just before payTo's first USDC receipt (block 51266731, 2026-09-13). */
export const DEFAULT_START_BLOCK = 51_266_000n;
export const CONFIRMATIONS = 12n;
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
  // Same label rule the publisher applies (payer = treasurer → "self-test"), so
  // new rows carry it in data/ledger.jsonl too. Existing rows are never edited;
  // the publisher labels those at publish time.
  return withLabel({
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
  });
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
      if (attempt >= 4) throw new Error(`${method} failed: ${body.error?.message ?? res.status}`);
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  };
}

const hex = (n: bigint) => `0x${n.toString(16)}`;
const topicAddr = (t: string) => `0x${t.slice(-40)}`;
const addrTopic = (a: string) => `0x${a.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

export async function fetchTransfersTo(opts: {
  rpc: Rpc;
  payTo: string;
  fromBlock: bigint;
  toBlock: bigint;
  chunk: bigint;
}): Promise<ChainTransfer[]> {
  const out: ChainTransfer[] = [];
  const tsCache = new Map<string, number>();
  for (let from = opts.fromBlock; from <= opts.toBlock; from += opts.chunk) {
    const to = from + opts.chunk - 1n < opts.toBlock ? from + opts.chunk - 1n : opts.toBlock;
    const logs = await opts.rpc<
      Array<{ transactionHash: string; blockNumber: string; logIndex: string; topics: string[]; data: string; removed?: boolean }>
    >("eth_getLogs", [
      {
        address: USDC_BASE_MAINNET,
        fromBlock: hex(from),
        toBlock: hex(to),
        topics: [TRANSFER_TOPIC, null, addrTopic(opts.payTo)],
      },
    ]);
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
  }
  return out;
}

// ------------------------------------------------------------------ main

type Cursor = { payTo: string; lastScannedBlock: string };

function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "GUARDRAILS.md"))) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

async function main(): Promise<void> {
  const root = repoRoot();
  const jsonlPath = path.resolve(process.env.LEDGER_JSONL_PATH ?? path.join(root, "data/ledger.jsonl"));
  const cursorPath = path.resolve(process.env.LEDGER_CHAIN_SYNC_CURSOR ?? path.join(root, "data/chain-sync.json"));
  const payTo = (process.env.LEDGER_PAY_TO_EVM ?? process.env.AUDIT_PAY_TO_EVM ?? DEFAULT_PAY_TO).replace(/\s+/g, "");
  if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) throw new Error("LEDGER_PAY_TO_EVM must be a 0x address");
  const rpcUrl = process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org";
  const chunk = BigInt(process.env.LEDGER_CHAIN_SYNC_CHUNK ?? "2000");
  const rpc = jsonRpc(rpcUrl);

  const startBlock = BigInt(process.env.LEDGER_CHAIN_SYNC_START_BLOCK?.trim() || DEFAULT_START_BLOCK);
  let fromBlock = startBlock;
  if (fs.existsSync(cursorPath)) {
    const c = JSON.parse(fs.readFileSync(cursorPath, "utf8")) as Cursor;
    if (c.payTo?.toLowerCase() === payTo.toLowerCase()) {
      const next = BigInt(c.lastScannedBlock) + 1n;
      if (next > fromBlock) fromBlock = next;
    }
  }
  const head = BigInt(await rpc<string>("eth_blockNumber", []));
  const toBlock = head - CONFIRMATIONS;
  if (toBlock < fromBlock) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "no new confirmed blocks" }));
    return;
  }

  const transfers = await fetchTransfersTo({ rpc, payTo, fromBlock, toBlock, chunk });
  const raw = fs.existsSync(jsonlPath) ? fs.readFileSync(jsonlPath, "utf8") : "";
  const existing = parseLedgerJsonl(raw);
  const { events, added } = reconcile(existing, transfers, payTo);
  if (added.length) fs.writeFileSync(jsonlPath, serializeLedgerJsonl(events), "utf8");
  fs.writeFileSync(
    cursorPath,
    JSON.stringify({ payTo, lastScannedBlock: toBlock.toString() } satisfies Cursor, null, 2) + "\n",
    "utf8",
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        payTo,
        scanned: { fromBlock: fromBlock.toString(), toBlock: toBlock.toString() },
        transfersSeen: transfers.length,
        added: added.map((a) => ({ txHash: a.txHash, amountUsdc: a.amountUsdc, endpoint: a.endpoint, from: a.walletAddress })),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
