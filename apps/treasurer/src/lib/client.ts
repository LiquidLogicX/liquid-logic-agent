import { CdpX402Client } from "@coinbase/cdp-sdk/x402";
import { wrapFetchWithPayment } from "@x402/fetch";
import {
  DEFAULT_TREASURER_POLICY,
  TREASURER_WALLET_ADDRESS,
  assertAllowlistedEndpoint,
  evaluateAllowance,
  atomicToUsdc,
  usdcToAtomic,
} from "@liquid-logic/shared";
import {
  committedTodayAtomic,
  quoteGuardedFetch,
  release,
  reserve,
  withBasePaymentLock,
  type PriceQuote,
} from "./base-pay.js";
import type { TreasurerConfig } from "./config.js";
import { LedgerStore } from "./ledger-store.js";
import { assertPaymentAsset } from "./usdc-guard.js";
import { isPaymentsFrozen } from "./freeze.js";
import {
  claimHoldForApproval,
  releaseHoldApproval,
  amountMeetsHoldThreshold,
  expireStaleHolds,
  findHeldEvent,
  getHoldResolution,
  recordHeld,
  sleep,
} from "./hold.js";
import { checkPaymentSettlement } from "./payment-settlement.js";

/** Ensure audit-style endpoints receive ?wallet= for required queryParams. */
function withWalletQuery(endpoint: string, walletAddress: string): string {
  const u = new URL(endpoint);
  if (!u.searchParams.get("wallet")) {
    u.searchParams.set("wallet", walletAddress);
  }
  return u.toString();
}


export function createX402PayClient(config: TreasurerConfig): CdpX402Client {
  assertPaymentAsset(config);

  // Base mainnet: omit environment. Development (Base Sepolia): pass "development".
  const clientConfig: ConstructorParameters<typeof CdpX402Client>[0] = {
    walletConfig: {
      type: "eoa",
      accountName: config.walletAccountName,
    },
    spendControls: {
      maxAmountPerPayment: {
        atomic: config.maxPerPaymentAtomic,
        asset: config.usdcAddress,
      },
      maxCumulativeSpend: {
        atomic: config.dailyCapAtomic,
        asset: config.usdcAddress,
      },
      maxCumulativeSpendWindow: "24h",
      allowedNetworks: [config.network],
      onApproachingLimit: (spent, limit) => {
        const pct = (Number(spent.atomic) / Number(limit.atomic)) * 100;
        console.warn(
          `[treasurer] Approaching daily USDC spend limit: ${pct.toFixed(0)}% of cap used`,
        );
      },
    },
  };

  if (config.environment === "development") {
    // Docs: "development" uses Base testnet; omit for Base mainnet.
    (clientConfig as { environment?: string }).environment = "development";
  }

  return new CdpX402Client(clientConfig);
}

export async function getWalletAddress(
  config: TreasurerConfig,
): Promise<string> {
  return transport.getAddress(config);
}

function extractTxHash(response: Response): string | undefined {
  const headers = [
    "payment-response",
    "x-payment-response",
    "x-x402-tx-hash",
    "x-transaction-hash",
  ];
  for (const h of headers) {
    const v = response.headers.get(h);
    if (!v) continue;
    if (/^0x[a-fA-F0-9]{64}$/.test(v)) return v;
    // JSON or base64url(JSON) — CDP/x402 sellers often use payment-response
    const candidates = [v];
    try {
      const pad = "=".repeat((4 - (v.length % 4)) % 4);
      candidates.push(Buffer.from(v + pad, "base64url").toString("utf8"));
    } catch {
      /* ignore */
    }
    for (const c of candidates) {
      try {
        const parsed = JSON.parse(c) as {
          txHash?: string;
          transactionHash?: string;
          transaction?: string;
        };
        if (parsed.transaction && /^0x[a-fA-F0-9]{64}$/.test(parsed.transaction)) {
          return parsed.transaction;
        }
        if (parsed.txHash) return parsed.txHash;
        if (parsed.transactionHash) return parsed.transactionHash;
      } catch {
        /* try next */
      }
    }
  }
  return undefined;
}

export type PayResult = {
  status: number;
  body: string;
  txHash?: string;
  walletAddress: string;
  holdId?: string;
  held?: boolean;
};

/**
 * How the Base rail reaches x402. Production: one cached CdpX402Client per
 * process (so CDP's 24h maxCumulativeSpend actually accumulates) wrapped by
 * @x402/fetch. Tests swap in a mocked facilitator via setBasePaymentTransportForTests.
 */
export type BasePaymentTransport = {
  getAddress(config: TreasurerConfig): Promise<string>;
  /** `fetchImpl` is the quote-guarded fetch; the transport must route the unpaid request through it. */
  payFetch(config: TreasurerConfig, url: string, fetchImpl: typeof fetch): Promise<Response>;
};

let cachedClient: { key: string; client: CdpX402Client } | null = null;
function sharedClient(config: TreasurerConfig): CdpX402Client {
  const key = `${config.walletAccountName}|${config.network}|${config.maxPerPaymentAtomic}|${config.dailyCapAtomic}`;
  if (!cachedClient || cachedClient.key !== key) {
    cachedClient = { key, client: createX402PayClient(config) };
  }
  return cachedClient.client;
}

const cdpTransport: BasePaymentTransport = {
  async getAddress(config) {
    return (await sharedClient(config).getAddresses()).evmAddress;
  },
  payFetch(config, url, fetchImpl) {
    return wrapFetchWithPayment(fetchImpl, sharedClient(config) as never)(url);
  },
};

let transport: BasePaymentTransport = cdpTransport;
let innerFetch: typeof fetch = (...a) => globalThis.fetch(...a);
/** Test hook: mock facilitator. Pass null to restore the CDP transport. */
export function setBasePaymentTransportForTests(
  t: BasePaymentTransport | null,
  fetchImpl?: typeof fetch,
): void {
  transport = t ?? cdpTransport;
  innerFetch = fetchImpl ?? ((...a) => globalThis.fetch(...a));
}

/**
 * Execute an x402 payment (no hold gate). Runs under the process-wide Base
 * payment lock. Order inside the lock:
 *   freeze/allowlist → 402 quote (refuse if unknown) → per-payment max →
 *   daily cap incl. open reservations → `reserved` row → sign + settle →
 *   payment row with the quoted (actual) amount, or `reservation_released`.
 */
export async function executePayment(opts: {
  config: TreasurerConfig;
  ledger: LedgerStore;
  url: string;
  reason?: string;
  maxAmountHintUsdc?: string;
  holdId?: string;
  approvedBy?: string;
}): Promise<PayResult> {
  return withBasePaymentLock(() => executePaymentLocked(opts));
}

async function executePaymentLocked(opts: {
  config: TreasurerConfig;
  ledger: LedgerStore;
  url: string;
  reason?: string;
  maxAmountHintUsdc?: string;
  holdId?: string;
  approvedBy?: string;
}): Promise<PayResult> {
  const { config, ledger } = opts;
  assertPaymentAsset(config);

  if (isPaymentsFrozen(ledger)) {
    throw new Error(
      "FROZEN: outbound payments halted by operator freeze (POST /api/unfreeze to resume)",
    );
  }

  const endpoint = assertAllowlistedEndpoint(opts.url, config.allowlist);

  let hintAtomic: bigint | null = null;
  if (opts.maxAmountHintUsdc != null && opts.maxAmountHintUsdc !== "") {
    try {
      hintAtomic = usdcToAtomic(opts.maxAmountHintUsdc);
    } catch {
      throw new Error(`GUARDRAIL: invalid amount ${opts.maxAmountHintUsdc}`);
    }
    if (hintAtomic <= 0n) throw new Error("GUARDRAIL: amount must be greater than 0");
  }

  const preview = evaluateAllowance({
    policy: {
      ...DEFAULT_TREASURER_POLICY,
      allowlist: config.allowlist,
      maxPerPaymentUsdc: config.maxPerPaymentUsdc,
      dailyCapUsdc: config.dailyCapUsdc,
    },
    events: ledger.readAll(),
    walletAddress: TREASURER_WALLET_ADDRESS,
    endpoint,
    amountUsdc: opts.maxAmountHintUsdc,
  });
  if (!preview.allowed) {
    throw new Error(`GUARDRAIL: ${preview.reason}`);
  }

  const evmAddress = await transport.getAddress(config);
  const payUrl = withWalletQuery(endpoint, evmAddress);

  let quote: PriceQuote | null = null;
  let reservationId: string | null = null;
  const guarded = quoteGuardedFetch(
    innerFetch,
    { network: config.network, asset: config.usdcAddress },
    (q) => {
      // Runs on the unpaid 402, before the x402 client creates a payment payload.
      if (!q) {
        throw new Error("GUARDRAIL: PRICE_UNKNOWN — 402 has no parseable USDC price on this network; refusing to pay");
      }
      if (q.atomic <= 0n) throw new Error("GUARDRAIL: quoted price must be greater than 0");
      if (hintAtomic != null && q.atomic > hintAtomic) {
        throw new Error(
          `GUARDRAIL: quoted ${atomicToUsdc(q.atomic)} USDC exceeds the stated amount ${atomicToUsdc(hintAtomic)} USDC`,
        );
      }
      if (q.atomic > config.maxPerPaymentAtomic) {
        throw new Error(
          `GUARDRAIL: quoted ${atomicToUsdc(q.atomic)} USDC exceeds maxPerPaymentUsdc ${config.maxPerPaymentUsdc}`,
        );
      }
      if (!opts.holdId && config.holdAboveUsdc && q.atomic >= usdcToAtomic(config.holdAboveUsdc)) {
        throw new Error(
          `GUARDRAIL: quoted ${atomicToUsdc(q.atomic)} USDC is at/above HOLD_ABOVE_USDC=${config.holdAboveUsdc}; request a hold with the amount`,
        );
      }
      const committed = committedTodayAtomic(ledger.readAll());
      if (committed + q.atomic > config.dailyCapAtomic) {
        throw new Error(
          `GUARDRAIL: daily cap ${config.dailyCapUsdc} USDC — ${atomicToUsdc(committed)} committed today (UTC), ${atomicToUsdc(q.atomic)} more would exceed it`,
        );
      }
      quote = q;
      reservationId = reserve(ledger, {
        endpoint,
        atomic: q.atomic,
        network: config.network,
        holdId: opts.holdId,
      });
    },
  );

  let response: Response;
  try {
    response = await transport.payFetch(config, payUrl, guarded);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (reservationId) release(ledger, reservationId, message);
    ledger.append({
      type: "payment_failed",
      timestamp: new Date().toISOString(),
      endpoint,
      error: message,
      walletAddress: evmAddress,
      reason: opts.reason,
    });
    throw err;
  }

  const q = quote as PriceQuote | null;
  if (!q || !reservationId) {
    // Endpoint answered without a 402 (or the client skipped it): nothing was
    // quoted, so we never reserved and must not record an amount.
    const body = await response.text();
    ledger.append({
      type: "payment_failed",
      timestamp: new Date().toISOString(),
      endpoint,
      error: `HTTP ${response.status} without an x402 quote — no payment recorded`,
      walletAddress: evmAddress,
      reason: opts.reason,
    });
    return { status: response.status, body, walletAddress: evmAddress, holdId: opts.holdId };
  }

  const extracted = extractTxHash(response);
  const settlement = checkPaymentSettlement({
    status: response.status,
    txHash: extracted,
  });
  const amountUsdc = atomicToUsdc(q.atomic);

  // NEVER append type=payment without a real txHash + HTTP 2xx.
  if (!settlement.settled || !settlement.txHash) {
    const error =
      settlement.error ??
      `HTTP ${response.status}; missing txHash — refusing payment ledger row`;
    release(ledger, reservationId, error);
    ledger.append({
      type: "payment_failed",
      timestamp: new Date().toISOString(),
      endpoint,
      amountUsdc,
      error,
      walletAddress: evmAddress,
      reason: opts.reason,
    });
    const body = await response.text();
    return {
      status: response.status,
      body,
      txHash: settlement.txHash,
      walletAddress: evmAddress,
      holdId: opts.holdId,
    };
  }

  const txHash = settlement.txHash;
  const recorded = ledger.recordPayment({
    endpoint,
    amountUsdc,
    network: config.network,
    txHash,
    walletAddress: evmAddress,
    reason: opts.reason ?? "x402 service payment",
    holdId: opts.holdId,
    approvedBy: opts.approvedBy,
    reservationId,
  });
  if (!recorded) release(ledger, reservationId, `duplicate txHash ${txHash}`);

  const body = await response.text();
  return {
    status: response.status,
    body,
    txHash,
    walletAddress: evmAddress,
    holdId: opts.holdId,
  };
}

/**
 * Pay an allowlisted endpoint, respecting freeze + hold threshold.
 * At/above HOLD_ABOVE_USDC: write `held`, wait for operator approve/deny/expire (TTL).
 */
export async function payEndpoint(opts: {
  config: TreasurerConfig;
  ledger: LedgerStore;
  url: string;
  reason?: string;
  maxAmountHintUsdc?: string;
  /** When true, skip hold threshold (operator approve path uses executePayment). */
  skipHoldCheck?: boolean;
  holdId?: string;
  approvedBy?: string;
  /** Poll interval while waiting on a hold (ms). */
  holdPollMs?: number;
}): Promise<PayResult> {
  const { config, ledger } = opts;

  if (isPaymentsFrozen(ledger)) {
    throw new Error(
      "FROZEN: outbound payments halted by operator freeze (POST /api/unfreeze to resume)",
    );
  }

  expireStaleHolds(ledger, config.holdTtlSeconds);

  const endpoint = assertAllowlistedEndpoint(opts.url, config.allowlist);
  const amount = opts.maxAmountHintUsdc;

  if (
    !opts.skipHoldCheck &&
    config.holdAboveUsdc &&
    amount &&
    amountMeetsHoldThreshold(amount, config.holdAboveUsdc)
  ) {
    const held = recordHeld(ledger, {
      endpoint,
      amountUsdc: amount,
      network: config.network,
      reason:
        opts.reason ??
        `Hold: ${amount} USDC ≥ HOLD_ABOVE_USDC=${config.holdAboveUsdc}`,
    });
    console.log(
      `[treasurer] HELD ${held.holdId} endpoint=${endpoint} amount=${amount} USDC ` +
        `(TTL ${config.holdTtlSeconds}s) — approve/deny via operator HTTP`,
    );

    const deadline =
      Date.parse(held.timestamp) + config.holdTtlSeconds * 1000 + 2_000;
    const pollMs = opts.holdPollMs ?? 2_000;

    while (Date.now() < deadline) {
      expireStaleHolds(ledger, config.holdTtlSeconds);
      const resolution = getHoldResolution(ledger.readAll(), held.holdId);
      if (resolution === "paid") {
        const events = ledger.readAll();
        const payment = [...events]
          .reverse()
          .find((e) => e.type === "payment" && e.holdId === held.holdId);
        return {
          status: 200,
          body: JSON.stringify({
            ok: true,
            held: false,
            holdId: held.holdId,
            approved: true,
            payment,
          }),
          txHash:
            payment && "txHash" in payment
              ? (payment.txHash as string | undefined)
              : undefined,
          walletAddress:
            (payment && "walletAddress" in payment
              ? (payment.walletAddress as string | undefined)
              : undefined) ?? "",
          holdId: held.holdId,
        };
      }
      if (resolution === "denied") {
        throw new Error(`HOLD_DENIED: hold ${held.holdId} denied by operator`);
      }
      if (resolution === "expired") {
        throw new Error(
          `HOLD_EXPIRED: hold ${held.holdId} auto-denied after TTL ${config.holdTtlSeconds}s`,
        );
      }
      await sleep(pollMs);
    }

    // Final expiry sweep if the loop timed out without a writer race.
    expireStaleHolds(ledger, config.holdTtlSeconds);
    const finalRes = getHoldResolution(ledger.readAll(), held.holdId);
    if (finalRes === "paid") {
      return {
        status: 200,
        body: JSON.stringify({ ok: true, holdId: held.holdId, approved: true }),
        walletAddress: "",
        holdId: held.holdId,
      };
    }
    if (finalRes === "denied") {
      throw new Error(`HOLD_DENIED: hold ${held.holdId} denied by operator`);
    }
    throw new Error(
      `HOLD_EXPIRED: hold ${held.holdId} auto-denied after TTL ${config.holdTtlSeconds}s`,
    );
  }

  return executePayment({
    config,
    ledger,
    url: endpoint,
    reason: opts.reason,
    maxAmountHintUsdc: amount,
    holdId: opts.holdId,
    approvedBy: opts.approvedBy,
  });
}

/**
 * Operator-initiated hold: write `held` on the live ledger (same disk as approve/deny).
 * Does not pay and does not block — operator must approve, deny, or wait for TTL expiry.
 */
export function requestHold(opts: {
  config: TreasurerConfig;
  ledger: LedgerStore;
  url: string;
  amountUsdc: string;
  reason?: string;
}): { holdId: string; endpoint: string; amountUsdc: string; expiresAt: string } {
  const { config, ledger } = opts;
  if (isPaymentsFrozen(ledger)) {
    throw new Error(
      "FROZEN: outbound payments halted by operator freeze (POST /api/unfreeze to resume)",
    );
  }
  if (!config.holdAboveUsdc) {
    throw new Error(
      "HOLD_DISABLED: set HOLD_ABOVE_USDC to enable holds (or use CLI pay for immediate spend)",
    );
  }
  const amount = opts.amountUsdc.trim();
  if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
    throw new Error("HOLD_BAD_AMOUNT: amountUsdc must be a positive USDC string");
  }
  if (!amountMeetsHoldThreshold(amount, config.holdAboveUsdc)) {
    throw new Error(
      `HOLD_BELOW_THRESHOLD: ${amount} USDC < HOLD_ABOVE_USDC=${config.holdAboveUsdc}`,
    );
  }
  expireStaleHolds(ledger, config.holdTtlSeconds);
  const endpoint = assertAllowlistedEndpoint(opts.url, config.allowlist);
  const held = recordHeld(ledger, {
    endpoint,
    amountUsdc: amount,
    network: config.network,
    reason:
      opts.reason ??
      `Hold request: ${amount} USDC ≥ HOLD_ABOVE_USDC=${config.holdAboveUsdc}`,
  });
  const expiresAt = new Date(
    Date.parse(held.timestamp) + config.holdTtlSeconds * 1000,
  ).toISOString();
  console.log(
    `[treasurer] HELD ${held.holdId} endpoint=${endpoint} amount=${amount} USDC ` +
      `(TTL ${config.holdTtlSeconds}s) — approve/deny via operator HTTP`,
  );
  return {
    holdId: held.holdId,
    endpoint,
    amountUsdc: amount,
    expiresAt,
  };
}

/**
 * Approve a pending hold. The pending → approving transition is atomic
 * (claimHoldForApproval), so of N concurrent approvers exactly one pays; the
 * rest get HOLD_NOT_PENDING. A failed payment returns the hold to pending.
 */
export async function approveHold(opts: {
  config: TreasurerConfig;
  ledger: LedgerStore;
  holdId: string;
  approvedBy?: string;
}): Promise<PayResult> {
  const { config, ledger, holdId } = opts;
  expireStaleHolds(ledger, config.holdTtlSeconds);

  const held = findHeldEvent(ledger.readAll(), holdId);
  if (!held) {
    throw new Error(`HOLD_NOT_FOUND: ${holdId}`);
  }
  const approvedBy = opts.approvedBy ?? "operator";
  const claim = claimHoldForApproval(ledger, holdId, approvedBy);
  if (!claim.ok) {
    const r = claim.resolution;
    if (r === "paid") throw new Error(`HOLD_ALREADY_PAID: ${holdId}`);
    if (r === "denied") throw new Error(`HOLD_ALREADY_DENIED: ${holdId}`);
    if (r === "expired") throw new Error(`HOLD_ALREADY_EXPIRED: ${holdId}`);
    if (r === "approving") throw new Error(`HOLD_NOT_PENDING: ${holdId} is already being approved`);
    throw new Error(`HOLD_NOT_FOUND: ${holdId}`);
  }

  try {
    const result = await executePayment({
      config,
      ledger,
      url: held.endpoint,
      maxAmountHintUsdc: held.amountUsdc,
      reason: held.reason ?? `Operator-approved hold ${holdId}`,
      holdId,
      approvedBy,
    });
    if (!(result.status >= 200 && result.status < 300 && result.txHash)) {
      releaseHoldApproval(ledger, holdId, `settlement incomplete (HTTP ${result.status})`);
    }
    return result;
  } catch (err) {
    releaseHoldApproval(ledger, holdId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
