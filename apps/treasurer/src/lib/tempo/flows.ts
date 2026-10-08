/**
 * Demo Pay flow on the Tempo rail: policy check → payment on Tempo → proof on
 * Tempo (recorder) → receipt. Every step is written to the treasurer ledger as
 * it happens and mirrored to the LLX Bridge; nothing is ever faked — a step is
 * only "done" once the chain / recorder says so.
 *
 * State: flows persist to a small JSON file next to the ledger (Render disk),
 * holds live in the ledger exactly like Base holds (held → payment|denied|expired).
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { HeldEvent, LedgerEvent } from "@liquid-logic/shared";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import type { LedgerStore } from "../ledger-store.js";
import { expireStaleHolds, getHoldResolution, recordDenied } from "../hold.js";
import { formatUsd6, parseUsd6 } from "./amount.js";
import type { BridgeMirror } from "./bridge.js";
import { memoToBytes32, type TempoChain } from "./chain.js";
import type { TempoRailConfig } from "./config.js";
import { evaluateTempoPayment } from "./policy.js";
import { RecorderError, type TempoRecorder } from "./recorder.js";

export type StepKey = "policy" | "payment" | "proof" | "receipt";
export type StepStatus = "pending" | "running" | "done" | "held" | "failed";
export type FlowStatus = "running" | "held" | "done" | "failed" | "refused" | "denied" | "expired";

export const STEP_LABELS: Record<StepKey, string> = {
  policy: "Policy check",
  payment: "Payment sent on Tempo",
  proof: "Proof recorded on Tempo",
  receipt: "Receipt ready",
};

export type FlowStep = {
  key: StepKey;
  label: string;
  status: StepStatus;
  at: string | null;
  detail: string | null;
  txHash: string | null;
  url: string | null;
};

export type DemoPayFlow = {
  id: string;
  clientRequestId: string | null;
  requestedBy: string | null;
  createdAt: string;
  updatedAt: string;
  status: FlowStatus;
  chainId: number;
  network: string;
  networkLabel: string;
  payer: string;
  payee: string;
  payeeName: string;
  amountUsdc: string;
  amountAtomic: string;
  tokenSymbol: string;
  memo: string;
  holdId: string | null;
  approvedBy: string | null;
  payment: { txHash: string; explorerUrl: string } | null;
  proof: { txHash: string | null; explorerUrl: string | null; refId: string | null } | null;
  verifyUrl: string | null;
  error: { step: StepKey; code: string; message: string } | null;
  bridgeThreadId: string | null;
  steps: FlowStep[];
};

export class FlowStore {
  private flows = new Map<string, DemoPayFlow>();
  constructor(private readonly filePath: string | null, private readonly keep = 200) {
    if (filePath && fs.existsSync(filePath)) {
      try {
        const rows = JSON.parse(fs.readFileSync(filePath, "utf8")) as DemoPayFlow[];
        for (const f of rows) this.flows.set(f.id, f);
      } catch {
        /* corrupt file: start empty, ledger still has the history */
      }
    }
  }
  get(id: string): DemoPayFlow | undefined {
    return this.flows.get(id);
  }
  byHoldId(holdId: string): DemoPayFlow | undefined {
    return [...this.flows.values()].find((f) => f.holdId === holdId);
  }
  byClientRequestId(id: string): DemoPayFlow | undefined {
    return [...this.flows.values()].find((f) => f.clientRequestId === id);
  }
  all(): DemoPayFlow[] {
    return [...this.flows.values()];
  }
  save(flow: DemoPayFlow): void {
    flow.updatedAt = new Date().toISOString();
    this.flows.set(flow.id, flow);
    if (this.flows.size > this.keep) {
      const oldest = [...this.flows.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const f of oldest.slice(0, this.flows.size - this.keep)) this.flows.delete(f.id);
    }
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...this.flows.values()], null, 0), "utf8");
    fs.renameSync(tmp, this.filePath);
  }
}

export class TempoFlowError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

function shortHash(h: string): string {
  return h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h;
}
function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export type TempoRailDeps = {
  cfg: TempoRailConfig;
  ledger: LedgerStore;
  chain: TempoChain;
  recorder: TempoRecorder;
  bridge: BridgeMirror;
  store: FlowStore;
  holdTtlSeconds: number;
  /** Test hooks. */
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  recorderRetryDelaysMs?: number[];
};

export class TempoRail {
  private lock: Promise<unknown> = Promise.resolve();
  private chainChecked = false;
  private bridgeQueues = new Map<string, Promise<unknown>>();
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly d: TempoRailDeps) {
    this.now = d.now ?? (() => new Date());
    this.sleep = d.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get cfg(): TempoRailConfig {
    return this.d.cfg;
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  private iso(): string {
    return this.now().toISOString();
  }

  private payeeEndpoint(payee: string): string {
    return `${this.d.cfg.explorer}/address/${payee}`;
  }

  private step(flow: DemoPayFlow, key: StepKey): FlowStep {
    return flow.steps.find((s) => s.key === key)!;
  }

  private setStep(flow: DemoPayFlow, key: StepKey, patch: Partial<FlowStep>): void {
    const s = this.step(flow, key);
    Object.assign(s, patch);
    if (patch.status && patch.status !== "pending" && patch.status !== "running") s.at = this.iso();
    this.d.store.save(flow);
  }

  private note(flow: DemoPayFlow, message: string, extra: Record<string, unknown> = {}): void {
    this.d.ledger.append({
      type: "note",
      timestamp: this.iso(),
      message,
      walletAddress: this.d.cfg.payerAddress,
      flowId: flow.id,
      network: this.d.cfg.network,
      ...extra,
    } as unknown as LedgerEvent);
  }

  /** Queue bridge posts per flow so the live view shows steps in order. */
  private mirror(flow: DemoPayFlow, body: string, links: string[] = []): void {
    const prev = this.bridgeQueues.get(flow.id) ?? Promise.resolve();
    const next = prev.then(async () => {
      const id = await this.d.bridge.post({
        body: `**Demo Pay** · ${body}`,
        replyTo: flow.bridgeThreadId,
        links,
      });
      if (id && !flow.bridgeThreadId) {
        flow.bridgeThreadId = id;
        this.d.store.save(flow);
      }
    });
    this.bridgeQueues.set(flow.id, next.catch(() => undefined));
  }

  /** Wait for queued bridge posts (tests). */
  async flushMirror(flowId: string): Promise<void> {
    await this.bridgeQueues.get(flowId);
  }

  private fail(flow: DemoPayFlow, key: StepKey, code: string, message: string, status: FlowStatus = "failed"): DemoPayFlow {
    flow.status = status;
    flow.error = { step: key, code, message };
    this.setStep(flow, key, { status: "failed", detail: message });
    this.note(flow, `Demo Pay ${flow.id}: stopped at ${STEP_LABELS[key]} (${code}): ${message}`);
    this.mirror(flow, `stopped at ${STEP_LABELS[key]}: ${message}`);
    return flow;
  }

  /**
   * Start a flow. Resolves once the policy step is decided (allow → payment is
   * already running in the background; hold → waiting for approval; refuse →
   * done). `settled` resolves when the flow reaches a terminal or held state.
   */
  async start(input: {
    amountUsdc: string;
    memo?: string;
    payee?: string;
    clientRequestId?: string;
    requestedBy?: string;
  }): Promise<{ flow: DemoPayFlow; settled: Promise<DemoPayFlow> }> {
    const cfg = this.d.cfg;
    const clientRequestId = input.clientRequestId?.trim().slice(0, 80) || null;
    if (clientRequestId) {
      const existing = this.d.store.byClientRequestId(clientRequestId);
      if (existing) return { flow: existing, settled: Promise.resolve(existing) };
    }

    const payeeRaw = (input.payee ?? cfg.demoPayee).trim();
    if (!isAddress(payeeRaw, { strict: false })) {
      throw new TempoFlowError("payee must be a 0x address", 400, "BAD_PAYEE");
    }
    const payee = getAddress(payeeRaw);
    let amountAtomic: bigint;
    try {
      amountAtomic = parseUsd6(input.amountUsdc);
    } catch (err) {
      throw new TempoFlowError(err instanceof Error ? err.message : String(err), 400, "BAD_AMOUNT");
    }
    const memo = (input.memo ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
    const createdAt = this.iso();
    const flow: DemoPayFlow = {
      id: randomUUID(),
      clientRequestId,
      requestedBy: input.requestedBy?.slice(0, 120) ?? null,
      createdAt,
      updatedAt: createdAt,
      status: "running",
      chainId: cfg.chainId,
      network: cfg.network,
      networkLabel: cfg.networkLabel,
      payer: cfg.payerAddress,
      payee,
      payeeName: payee.toLowerCase() === cfg.demoPayee.toLowerCase() ? cfg.demoPayeeName : shortAddr(payee),
      amountUsdc: formatUsd6(amountAtomic),
      amountAtomic: amountAtomic.toString(),
      tokenSymbol: cfg.tokenSymbol,
      memo,
      holdId: null,
      approvedBy: null,
      payment: null,
      proof: null,
      verifyUrl: null,
      error: null,
      bridgeThreadId: null,
      steps: (Object.keys(STEP_LABELS) as StepKey[]).map((key) => ({
        key,
        label: STEP_LABELS[key],
        status: key === "policy" ? "running" : "pending",
        at: null,
        detail: null,
        txHash: null,
        url: null,
      })),
    };
    this.d.store.save(flow);

    const decided = await this.withLock(async () => {
      expireStaleHolds(this.d.ledger, this.d.holdTtlSeconds, this.now());
      const decision = evaluateTempoPayment({
        cfg,
        events: this.d.ledger.readAll(),
        payee,
        amountUsdc: flow.amountUsdc,
        now: this.now(),
      });
      if (decision.decision === "refuse") {
        this.fail(flow, "policy", decision.code, decision.reason, "refused");
        return "refused" as const;
      }
      if (decision.decision === "hold") {
        const held: HeldEvent = {
          type: "held",
          holdId: randomUUID(),
          timestamp: this.iso(),
          endpoint: this.payeeEndpoint(payee),
          amountUsdc: flow.amountUsdc,
          asset: "USDC",
          network: cfg.network,
          payTo: payee,
          tokenSymbol: cfg.tokenSymbol,
          walletAddress: cfg.payerAddress,
          reason: `Demo Pay ${flow.id}: ${decision.reason}`,
        };
        this.d.ledger.append(held);
        flow.holdId = held.holdId;
        flow.status = "held";
        this.setStep(flow, "policy", { status: "held", detail: decision.reason });
        this.mirror(flow, `1/4 Held for approval: ${flow.amountUsdc} ${cfg.tokenSymbol} to ${flow.payeeName} on ${cfg.networkLabel}. ${decision.reason}.`);
        return "held" as const;
      }
      this.setStep(flow, "policy", { status: "done", detail: decision.reason });
      this.note(flow, `Demo Pay ${flow.id}: policy check passed. ${decision.reason}`);
      this.mirror(flow, `1/4 Policy check passed: ${flow.amountUsdc} ${cfg.tokenSymbol} to ${flow.payeeName} (${shortAddr(payee)}) on ${cfg.networkLabel}.`);
      return "allow" as const;
    });

    if (decided !== "allow") return { flow, settled: Promise.resolve(flow) };
    const settled = this.continueAfterPolicy(flow).catch((err) => {
      console.error("[treasurer] tempo flow crashed:", err instanceof Error ? err.message : err);
      return flow;
    });
    return { flow, settled };
  }

  /** Approve a held Tempo payment (by flow id or hold id). Pays, proves, receipts. */
  async approve(idOrHoldId: string, approvedBy = "operator"): Promise<{ flow: DemoPayFlow; settled: Promise<DemoPayFlow> }> {
    const flow = this.d.store.get(idOrHoldId) ?? this.d.store.byHoldId(idOrHoldId);
    if (!flow || !flow.holdId) throw new TempoFlowError(`No held Tempo flow for ${idOrHoldId}`, 404, "NOT_FOUND");
    expireStaleHolds(this.d.ledger, this.d.holdTtlSeconds, this.now());
    this.syncHold(flow);
    const resolution = getHoldResolution(this.d.ledger.readAll(), flow.holdId);
    if (resolution !== "pending" || flow.status !== "held") {
      throw new TempoFlowError(`Hold is not pending (${resolution ?? flow.status})`, 409, "NOT_PENDING");
    }
    flow.approvedBy = approvedBy.slice(0, 120);
    flow.status = "running";
    this.setStep(flow, "policy", { status: "done", detail: `Approved by ${flow.approvedBy}` });
    this.note(flow, `Demo Pay ${flow.id}: hold ${flow.holdId} approved by ${flow.approvedBy}`, { holdId: flow.holdId });
    this.mirror(flow, `1/4 Approved: ${flow.amountUsdc} ${flow.tokenSymbol} hold approved by ${flow.approvedBy}.`);
    const settled = this.continueAfterPolicy(flow).catch(() => flow);
    return { flow, settled };
  }

  deny(idOrHoldId: string, deniedBy = "operator"): DemoPayFlow {
    const flow = this.d.store.get(idOrHoldId) ?? this.d.store.byHoldId(idOrHoldId);
    if (!flow || !flow.holdId) throw new TempoFlowError(`No held Tempo flow for ${idOrHoldId}`, 404, "NOT_FOUND");
    expireStaleHolds(this.d.ledger, this.d.holdTtlSeconds, this.now());
    this.syncHold(flow);
    if (flow.status !== "held") throw new TempoFlowError(`Hold is not pending (${flow.status})`, 409, "NOT_PENDING");
    recordDenied(this.d.ledger, { holdId: flow.holdId, reason: `Denied by ${deniedBy.slice(0, 120)}` });
    return this.fail(flow, "policy", "DENIED", `Denied by ${deniedBy.slice(0, 120)}`, "denied");
  }

  /** Reflect hold answers written elsewhere (operator HTTP deny, TTL expiry). */
  private syncHold(flow: DemoPayFlow): void {
    if (flow.status !== "held" || !flow.holdId) return;
    const r = getHoldResolution(this.d.ledger.readAll(), flow.holdId);
    if (r === "expired") this.fail(flow, "policy", "HOLD_EXPIRED", "Hold expired without an answer", "expired");
    else if (r === "denied") this.fail(flow, "policy", "DENIED", "Hold denied by the operator", "denied");
  }

  get(id: string): DemoPayFlow | undefined {
    const flow = this.d.store.get(id);
    if (flow?.status === "held") {
      expireStaleHolds(this.d.ledger, this.d.holdTtlSeconds, this.now());
      this.syncHold(flow);
    }
    return flow;
  }

  isTempoHold(holdId: string): boolean {
    return Boolean(this.d.store.byHoldId(holdId));
  }

  private async continueAfterPolicy(flow: DemoPayFlow): Promise<DemoPayFlow> {
    const paid = await this.withLock(() => this.pay(flow));
    if (!paid) return flow;
    await this.prove(flow);
    return flow;
  }

  /** Payment step. Runs under the lock so balance + cap checks and the send can't interleave. */
  private async pay(flow: DemoPayFlow): Promise<boolean> {
    const cfg = this.d.cfg;
    const payee = flow.payee as Address;
    const amount = BigInt(flow.amountAtomic);
    this.setStep(flow, "payment", { status: "running" });

    try {
      if (!this.chainChecked) {
        const id = await this.d.chain.getChainId();
        if (id !== cfg.chainId) {
          this.fail(flow, "payment", "CHAIN_MISMATCH", `TEMPO_RPC_URL is chain ${id}, expected ${cfg.chainId}`);
          return false;
        }
        this.chainChecked = true;
      }

      // Re-check policy right before sending (cap may have moved; approve path skips the hold).
      const recheck = evaluateTempoPayment({
        cfg,
        events: this.d.ledger.readAll(),
        payee,
        amountUsdc: flow.amountUsdc,
        now: this.now(),
        skipHold: true,
      });
      if (recheck.decision === "refuse") {
        this.fail(flow, "payment", recheck.code, recheck.reason);
        return false;
      }

      const balance = await this.d.chain.balanceOf(cfg.token, cfg.payerAddress);
      const sameFeeToken = cfg.feeToken.toLowerCase() === cfg.token.toLowerCase();
      const need = amount + (sameFeeToken ? cfg.feeReserveAtomic : 0n);
      if (balance < need) {
        this.fail(
          flow,
          "payment",
          "INSUFFICIENT_BALANCE",
          `Payer holds ${formatUsd6(balance)} ${cfg.tokenSymbol}; needs ${formatUsd6(need)} (amount + fee reserve)`,
        );
        return false;
      }
      if (!sameFeeToken) {
        const feeBal = await this.d.chain.balanceOf(cfg.feeToken, cfg.payerAddress);
        if (feeBal < cfg.feeReserveAtomic) {
          this.fail(flow, "payment", "INSUFFICIENT_FEE_BALANCE", `Payer fee-token balance ${formatUsd6(feeBal)} is below the reserve`);
          return false;
        }
      }
    } catch (err) {
      this.fail(flow, "payment", "RPC_ERROR", `Tempo RPC: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }

    let txHash: Hex;
    try {
      txHash = await this.d.chain.transferWithMemo({
        token: cfg.token,
        to: payee,
        amount,
        memo: memoToBytes32(flow.memo || `LLX Pay ${flow.id.slice(0, 8)}`),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0]! : String(err);
      this.d.ledger.append({
        type: "payment_failed",
        timestamp: this.iso(),
        endpoint: this.payeeEndpoint(payee),
        amountUsdc: flow.amountUsdc,
        error: message,
        walletAddress: cfg.payerAddress,
        reason: `Demo Pay ${flow.id}`,
      });
      this.fail(flow, "payment", "SEND_FAILED", message);
      return false;
    }

    const explorerUrl = `${cfg.explorer}/tx/${txHash}`;
    this.setStep(flow, "payment", { status: "running", txHash, url: explorerUrl, detail: "Waiting for Tempo confirmation" });

    let receipt;
    try {
      receipt = await this.d.chain.waitForReceipt(txHash);
    } catch (err) {
      this.fail(flow, "payment", "PAYMENT_UNCONFIRMED", `Submitted ${shortHash(txHash)} but no receipt yet: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
      return false;
    }
    if (receipt.status !== "success") {
      this.d.ledger.append({
        type: "payment_failed",
        timestamp: this.iso(),
        endpoint: this.payeeEndpoint(payee),
        amountUsdc: flow.amountUsdc,
        error: `Tempo tx ${txHash} reverted`,
        walletAddress: cfg.payerAddress,
        reason: `Demo Pay ${flow.id}`,
      });
      this.fail(flow, "payment", "PAYMENT_REVERTED", `Tempo transaction ${shortHash(txHash)} reverted`);
      return false;
    }

    this.d.ledger.recordPayment({
      endpoint: this.payeeEndpoint(payee),
      amountUsdc: flow.amountUsdc,
      network: cfg.network,
      txHash,
      walletAddress: cfg.payerAddress,
      payTo: payee,
      tokenSymbol: cfg.tokenSymbol,
      reason: `Demo Pay ${flow.id}${flow.memo ? `: ${flow.memo}` : ""}`,
      holdId: flow.holdId ?? undefined,
      approvedBy: flow.approvedBy ?? undefined,
      timestamp: this.iso(),
    });
    flow.payment = { txHash, explorerUrl };
    this.setStep(flow, "payment", {
      status: "done",
      detail: `${flow.amountUsdc} ${cfg.tokenSymbol} confirmed in block ${receipt.blockNumber}`,
    });
    this.mirror(flow, `2/4 Payment sent on Tempo: ${flow.amountUsdc} ${cfg.tokenSymbol}, tx ${shortHash(txHash)}.`, [explorerUrl]);
    return true;
  }

  private async prove(flow: DemoPayFlow): Promise<void> {
    const cfg = this.d.cfg;
    const txHash = flow.payment!.txHash as Hex;
    this.setStep(flow, "proof", { status: "running" });
    const delays = this.d.recorderRetryDelaysMs ?? [1_000, 2_000, 4_000, 8_000];
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const r = await this.d.recorder.recordProof({
          txHash,
          payee: flow.payee as Address,
          amountAtomic: BigInt(flow.amountAtomic),
          memo: flow.memo || `LLX Pay demo ${flow.id.slice(0, 8)}`,
        });
        if (!r.proofTxHash) {
          // Idempotent replays can lack the registry tx; never show a proof link we don't have.
          throw new RecorderError("Recorder returned no proof transaction hash", 502, "NO_PROOF_TX", attempt < delays.length);
        }
        flow.proof = { txHash: r.proofTxHash, explorerUrl: r.proofExplorerUrl ?? `${cfg.explorer}/tx/${r.proofTxHash}`, refId: r.refId };
        this.setStep(flow, "proof", {
          status: "done",
          txHash: r.proofTxHash,
          url: flow.proof.explorerUrl,
          detail: r.idempotent ? "Proof already on Tempo (idempotent)" : "Recorder verified the transfer and wrote the proof",
        });
        this.note(flow, `Demo Pay ${flow.id}: proof recorded on Tempo, tx ${r.proofTxHash}`, {
          txHash: r.proofTxHash,
          refId: r.refId,
          paymentTxHash: txHash,
        });
        this.mirror(flow, `3/4 Proof recorded on Tempo: tx ${shortHash(r.proofTxHash)}.`, [flow.proof.explorerUrl!]);

        const verifyUrl =
          r.verifyUrl ??
          (r.refId
            ? `${cfg.verifierUrl}/proofs/${r.refId}?network=${cfg.chainId === 4217 ? "tempo-mainnet" : "tempo"}`
            : null);
        if (!verifyUrl) {
          this.fail(flow, "receipt", "NO_VERIFY_URL", "Recorder returned no verify link");
          return;
        }
        flow.verifyUrl = verifyUrl;
        flow.status = "done";
        this.setStep(flow, "receipt", { status: "done", url: verifyUrl, detail: "Public verify link ready" });
        this.note(flow, `Demo Pay ${flow.id}: receipt ready ${verifyUrl}`);
        this.mirror(flow, `4/4 Receipt ready: ${flow.amountUsdc} ${cfg.tokenSymbol} to ${flow.payeeName}, verify link attached.`, [verifyUrl]);
        return;
      } catch (err) {
        lastErr = err;
        const retryable = err instanceof RecorderError ? err.retryable : true;
        if (!retryable || attempt === delays.length) break;
        await this.sleep(delays[attempt]!);
      }
    }
    const code = lastErr instanceof RecorderError ? lastErr.code ?? `HTTP_${lastErr.status}` : "RECORDER_ERROR";
    const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
    this.fail(flow, "proof", code, `Payment is on Tempo, but the proof was not recorded: ${message}`);
  }
}
