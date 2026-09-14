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

export async function payEndpoint(opts: {
  config: TreasurerConfig;
  ledger: LedgerStore;
  url: string;
  reason?: string;
  maxAmountHintUsdc?: string;
}): Promise<{ status: number; body: string; txHash?: string; walletAddress: string }> {
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

  let response: Response;
  try {
    response = await fetchWithPayment(endpoint);
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
  // Prefer hint; if unknown, still record the attempt for ops visibility.
  if (amountUsdc !== "unknown") {
    ledger.recordPayment({
      endpoint,
      amountUsdc,
      network: config.network,
      txHash,
      walletAddress: evmAddress,
      reason: opts.reason,
    });
  } else {
    ledger.recordPayment({
      endpoint,
      amountUsdc: "0",
      network: config.network,
      txHash,
      walletAddress: evmAddress,
      reason: opts.reason ?? "x402 payment (amount from settlement; see BaseScan)",
    });
  }

  const body = await response.text();
  return { status: response.status, body, txHash, walletAddress: evmAddress };
}
