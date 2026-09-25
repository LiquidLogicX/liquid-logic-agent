/**
 * /api/prove route logic (runs AFTER x402 verify, BEFORE settle).
 *
 * The @x402/next wrapper only settles when this handler returns < 400, so every
 * rejection below (400 / 403 / 503) means the caller is NOT charged:
 *   400  bad hash, memo, tx not on Base / reverted / no Base USDC Transfer, too few confirmations
 *   403  paying wallet is neither `from` nor `to` of the USDC Transfer
 *   503  recorder down, Arc write failed, recorder gas low, Base RPC down, missing config
 * 200 with status "recorded" (new Arc write) or "existing" (already recorded, no write).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { atomicToUsdc } from "@liquid-logic/shared";
import {
  BASE_USDC,
  ERC20_TRANSFER_TOPIC,
  MEMO_MAX_CHARS,
  MIN_BASE_CONFIRMATIONS,
  PROVE_ARC_CHAIN,
  PROVE_SOURCE_CHAIN,
  SETTLEMENT_PROOFS_ARC,
  verifyUrlFor,
} from "./config";
import { type BaseReader, BaseRpcError, type RpcLog } from "./base-rpc";
import {
  type RecorderClient,
  type RecorderProof,
  RecorderRejected,
  RecorderUnavailable,
} from "./recorder-client";
import { payerFromHeaders } from "./payer";

export type ProveDeps = {
  base: BaseReader;
  /** null when RECORDER_API_KEY is not configured → 503, never settles. */
  recorder: RecorderClient | null;
  minGasWei: bigint;
  warn?: (msg: string, data?: Record<string, unknown>) => void;
  info?: (msg: string, data?: Record<string, unknown>) => void;
};

export type ProveResponse = {
  proofId: number | null;
  status: "recorded" | "existing";
  source: {
    chain: string;
    txHash: string;
    from: string;
    to: string;
    amountUsdc: string;
    timestamp: string;
  };
  arc: { chain: string; contract: string; txHash: string | null };
  verifyUrl: string;
  recordedAt: string;
  refId: string;
  memo: string;
};

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
/** Plain text: printable ASCII only (no control chars, no newlines). */
const MEMO_RE = /^[\x20-\x7E]*$/;

function fail(status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, code, ...extra }, { status });
}

async function readInput(req: NextRequest): Promise<{ txHash?: unknown; memo?: unknown }> {
  const url = new URL(req.url);
  const fromQuery = {
    txHash: url.searchParams.get("txHash") ?? undefined,
    memo: url.searchParams.get("memo") ?? undefined,
  };
  if (req.method !== "POST") return fromQuery;
  try {
    const body = (await req.json()) as { txHash?: unknown; memo?: unknown };
    return {
      txHash: body?.txHash ?? fromQuery.txHash,
      memo: body?.memo ?? fromQuery.memo,
    };
  } catch {
    return fromQuery;
  }
}

type UsdcTransfer = { from: string; to: string; value: bigint };

function topicToAddress(topic: string): string {
  return getAddress(`0x${topic.slice(-40)}`);
}

export function baseUsdcTransfers(logs: RpcLog[]): UsdcTransfer[] {
  const out: UsdcTransfer[] = [];
  for (const log of logs) {
    if (log.address?.toLowerCase() !== BASE_USDC.toLowerCase()) continue;
    if (log.topics?.[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;
    if (log.topics.length !== 3) continue;
    try {
      out.push({
        from: topicToAddress(log.topics[1]!),
        to: topicToAddress(log.topics[2]!),
        value: BigInt(log.data),
      });
    } catch {
      /* malformed log — skip */
    }
  }
  return out;
}

function iso(unixSeconds: number | bigint): string {
  return new Date(Number(unixSeconds) * 1000).toISOString();
}

function buildResponse(args: {
  status: "recorded" | "existing";
  proofId: number | null;
  proofTxHash: string | null;
  proof: RecorderProof;
  transfer: UsdcTransfer;
  txHash: string;
  blockTimestamp: bigint;
}): ProveResponse {
  return {
    proofId: args.proofId,
    status: args.status,
    source: {
      chain: PROVE_SOURCE_CHAIN,
      txHash: args.txHash,
      from: args.transfer.from,
      to: args.transfer.to,
      amountUsdc: atomicToUsdc(args.transfer.value),
      timestamp: iso(args.blockTimestamp),
    },
    arc: {
      chain: PROVE_ARC_CHAIN,
      contract: SETTLEMENT_PROOFS_ARC,
      txHash: args.proofTxHash,
    },
    verifyUrl: verifyUrlFor(args.proof.refId),
    recordedAt: iso(args.proof.recordedAt),
    refId: args.proof.refId,
    memo: args.proof.memo,
  };
}

export async function handleProve(req: NextRequest, deps: ProveDeps): Promise<NextResponse> {
  const warn = deps.warn ?? ((m, d) => console.warn(JSON.stringify({ msg: m, ...d })));
  const info = deps.info ?? ((m, d) => console.log(JSON.stringify({ msg: m, ...d })));

  // ---- input ----
  const input = await readInput(req);
  const txHash = typeof input.txHash === "string" ? input.txHash.trim() : "";
  if (!TX_HASH_RE.test(txHash)) {
    return fail(400, "INVALID_TX_HASH", "txHash must be a 0x-prefixed 32-byte Base transaction hash");
  }
  let memo = "";
  if (input.memo !== undefined && input.memo !== null) {
    if (typeof input.memo !== "string") {
      return fail(400, "INVALID_MEMO", "memo must be a string");
    }
    memo = input.memo;
    if (memo.length > MEMO_MAX_CHARS) {
      return fail(400, "INVALID_MEMO", `memo must be at most ${MEMO_MAX_CHARS} characters`);
    }
    if (!MEMO_RE.test(memo)) {
      return fail(400, "INVALID_MEMO", "memo must be plain printable ASCII text (no control characters)");
    }
  }

  const payer = payerFromHeaders(req.headers);
  if (!payer) {
    return fail(402, "PAYMENT_REQUIRED", "x402 payment required");
  }
  if (!deps.recorder) {
    return fail(503, "RECORDER_NOT_CONFIGURED", "Proof recorder is not configured; not charged, retry later");
  }

  // ---- Base lookup (rule 2) ----
  let receipt;
  try {
    receipt = await deps.base.getReceipt(txHash);
  } catch (err) {
    if (err instanceof BaseRpcError) {
      return fail(503, "BASE_RPC_UNAVAILABLE", "Base RPC unavailable; not charged, retry later");
    }
    throw err;
  }
  if (!receipt) {
    return fail(
      400,
      "TX_NOT_FOUND_ON_BASE",
      "Transaction not found on Base mainnet (eip155:8453): wrong chain, unknown, or still pending",
    );
  }
  if (receipt.status !== "0x1") {
    return fail(400, "TX_FAILED", "Base transaction reverted");
  }
  const transfers = baseUsdcTransfers(receipt.logs ?? []);
  if (transfers.length === 0) {
    return fail(
      400,
      "NOT_BASE_USDC_TRANSFER",
      `Transaction has no Transfer event from Base USDC (${BASE_USDC})`,
    );
  }

  // ---- party check (rule 1) ----
  const payerLc = payer.toLowerCase();
  const transfer = transfers.find(
    (t) => t.from.toLowerCase() === payerLc || t.to.toLowerCase() === payerLc,
  );
  if (!transfer) {
    return fail(
      403,
      "NOT_A_PARTY",
      "The paying wallet is neither the sender nor the recipient of this USDC transfer; not charged",
      { payer: getAddress(payer) },
    );
  }

  let head: bigint;
  let blockTimestamp: bigint;
  try {
    head = await deps.base.getBlockNumber();
    blockTimestamp = await deps.base.getBlockTimestamp(receipt.blockNumber);
  } catch (err) {
    if (err instanceof BaseRpcError) {
      return fail(503, "BASE_RPC_UNAVAILABLE", "Base RPC unavailable; not charged, retry later");
    }
    throw err;
  }
  const confirmations = head - BigInt(receipt.blockNumber) + 1n;
  if (confirmations < BigInt(MIN_BASE_CONFIRMATIONS)) {
    return fail(
      400,
      "TX_NOT_CONFIRMED",
      `Base transaction has ${confirmations} confirmation(s); need ${MIN_BASE_CONFIRMATIONS}. Not charged, retry shortly.`,
      { retryAfterSeconds: Number(BigInt(MIN_BASE_CONFIRMATIONS) - confirmations) * 2 + 2 },
    );
  }

  const recordKey = {
    txHash,
    payee: transfer.to,
    amountUSDC: transfer.value.toString(),
  };

  try {
    // ---- idempotency (rule 3): existing proof → no Arc write ----
    const existing = await deps.recorder.lookup(recordKey);
    if (existing.found) {
      return NextResponse.json(
        buildResponse({
          status: "existing",
          proofId: existing.proofId,
          proofTxHash: existing.proofTxHash,
          proof: existing.proof,
          transfer,
          txHash,
          blockTimestamp,
        }),
      );
    }

    // ---- low gas guard: 503 instead of failing mid-write ----
    const health = await deps.recorder.health();
    const bal =
      typeof health.recorderArcBalanceWei === "string" && /^\d+$/.test(health.recorderArcBalanceWei)
        ? BigInt(health.recorderArcBalanceWei)
        : null;
    if (bal === null) {
      return fail(503, "RECORDER_UNAVAILABLE", "Recorder gas balance unknown; not charged, retry later");
    }
    if (health.lowGas === true || bal < deps.minGasWei) {
      warn("prove: recorder Arc gas balance low — refusing write", {
        balanceWei: bal.toString(),
        minWei: deps.minGasWei.toString(),
      });
      return fail(503, "LOW_GAS_BALANCE", "Proof recorder is low on Arc gas; not charged, retry later");
    }

    // ---- work: Arc write via recorder (rule 4: failure → 503, no settle) ----
    const written = await deps.recorder.record({ ...recordKey, memo });
    const body = buildResponse({
      status: written.idempotent ? "existing" : "recorded",
      proofId: written.proofId,
      proofTxHash: written.proofTxHash,
      proof: written.proof,
      transfer,
      txHash,
      blockTimestamp,
    });
    info("prove: proof ok", {
      status: body.status,
      proofId: body.proofId,
      refId: body.refId,
      arcTx: body.arc.txHash,
      payer: getAddress(payer),
    });
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof RecorderRejected) {
      return fail(400, err.code ?? "RECORDER_REJECTED", err.message);
    }
    if (err instanceof RecorderUnavailable) {
      if (err.code === "LOW_GAS_BALANCE") warn("prove: recorder refused write (low gas)", {});
      return fail(503, err.code, `Proof not recorded; not charged, retry later. ${err.message}`);
    }
    const message = err instanceof Error ? err.message : String(err);
    return fail(503, "PROVE_FAILED", `Proof not recorded; not charged, retry later. ${message}`);
  }
}
