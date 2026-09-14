import { CdpX402Client } from "@coinbase/cdp-sdk/x402";
import { wrapFetchWithPayment } from "@x402/fetch";
import {
  DEFAULT_TREASURER_POLICY,
  TREASURER_WALLET_ADDRESS,
  assertAllowlistedEndpoint,
  evaluateAllowance,
} from "@liquid-logic/shared";
import type { TreasurerConfig } from "./config.js";
import { LedgerStore } from "./ledger-store.js";
import { assertPaymentAsset } from "./usdc-guard.js";
import { isPaymentsFrozen } from "./freeze.js";
import {
  amountMeetsHoldThreshold,
  expireStaleHolds,
  findHeldEvent,
  getHoldResolution,
  recordHeld,
  sleep,
} from "./hold.js";

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
  const client = createX402PayClient(config);
  const { evmAddress } = await client.getAddresses();
  return evmAddress;
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
 * Execute an x402 payment (no hold gate). Caller must enforce freeze / allowlist /
 * allowance / hold resolution. Used by operator approve and by payEndpoint.
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
  const { config, ledger } = opts;
  assertPaymentAsset(config);

  if (isPaymentsFrozen(ledger)) {
    throw new Error(
      "FROZEN: outbound payments halted by operator freeze (POST /api/unfreeze to resume)",
    );
  }

  const endpoint = assertAllowlistedEndpoint(opts.url, config.allowlist);

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

  const client = createX402PayClient(config);
  const { evmAddress } = await client.getAddresses();
  const fetchWithPayment = wrapFetchWithPayment(globalThis.fetch, client as never);
  const payUrl = withWalletQuery(endpoint, evmAddress);

  let response: Response;
  try {
    response = await fetchWithPayment(payUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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

  const txHash = extractTxHash(response);
  const amountUsdc = opts.maxAmountHintUsdc ?? "unknown";
  const paymentMeta = {
    holdId: opts.holdId,
    approvedBy: opts.approvedBy,
  };
  // Prefer hint; if unknown, still record the attempt for ops visibility.
  if (amountUsdc !== "unknown") {
    ledger.recordPayment({
      endpoint,
      amountUsdc,
      network: config.network,
      txHash,
      walletAddress: evmAddress,
      reason: opts.reason,
      ...paymentMeta,
    });
  } else {
    ledger.recordPayment({
      endpoint,
      amountUsdc: "0",
      network: config.network,
      txHash,
      walletAddress: evmAddress,
      reason: opts.reason ?? "x402 payment (amount from settlement; see BaseScan)",
      ...paymentMeta,
    });
  }

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

/** Approve a pending hold: execute payment and append payment with holdId + approvedBy. */
export async function approveHold(opts: {
  config: TreasurerConfig;
  ledger: LedgerStore;
  holdId: string;
  approvedBy?: string;
}): Promise<PayResult> {
  const { config, ledger, holdId } = opts;
  expireStaleHolds(ledger, config.holdTtlSeconds);

  const resolution = getHoldResolution(ledger.readAll(), holdId);
  if (resolution === null) {
    throw new Error(`HOLD_NOT_FOUND: ${holdId}`);
  }
  if (resolution === "paid") {
    throw new Error(`HOLD_ALREADY_PAID: ${holdId}`);
  }
  if (resolution === "denied") {
    throw new Error(`HOLD_ALREADY_DENIED: ${holdId}`);
  }
  if (resolution === "expired") {
    throw new Error(`HOLD_ALREADY_EXPIRED: ${holdId}`);
  }

  const held = findHeldEvent(ledger.readAll(), holdId);
  if (!held) {
    throw new Error(`HOLD_NOT_FOUND: ${holdId}`);
  }

  return executePayment({
    config,
    ledger,
    url: held.endpoint,
    maxAmountHintUsdc: held.amountUsdc,
    reason: held.reason ?? `Operator-approved hold ${holdId}`,
    holdId,
    approvedBy: opts.approvedBy ?? "operator",
  });
}
