/**
 * Arc (eip155:5042) x402 accept — Circle Gateway rail.
 * Flag-gated via ENABLE_X402_ARC (default off = fully inert).
 * Does not alter the Base / CDP path.
 */
import {
  ARC_GATEWAY_WALLET,
  ARC_PAY_TO_DEFAULT,
  NETWORK_ARC,
  USDC_ARC_MAINNET,
  usdcToAtomic,
} from "@liquid-logic/shared";
import {
  BatchFacilitatorClient,
  GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS,
  isBatchPayment,
} from "@circle-fin/x402-batching/server";

export {
  BatchFacilitatorClient,
  GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS,
  isBatchPayment,
};

/** Env flag — off/unset = Arc rail fully inert. */
export function isX402ArcEnabled(): boolean {
  const v = (process.env.ENABLE_X402_ARC ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export const ARC_NETWORK = NETWORK_ARC;
export const ARC_USDC = USDC_ARC_MAINNET;
export const ARC_GATEWAY_VERIFYING_CONTRACT = ARC_GATEWAY_WALLET;

/** Live Circle supported kind shape (fetched 2026-09-20) — code against this. */
export const ARC_KIND_LIVE = {
  x402Version: 2 as const,
  scheme: "exact" as const,
  network: NETWORK_ARC,
  extra: {
    name: "GatewayWalletBatched" as const,
    version: "1" as const,
    verifyingContract: ARC_GATEWAY_WALLET.toLowerCase(),
    minValiditySeconds: 604800,
    assets: [
      {
        symbol: "USDC" as const,
        address: USDC_ARC_MAINNET.toLowerCase(),
        decimals: 6,
      },
    ],
  },
};

export type ArcPaymentRequirements = {
  scheme: "exact";
  network: typeof NETWORK_ARC;
  amount: string;
  asset: typeof USDC_ARC_MAINNET;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: {
    name: "GatewayWalletBatched";
    version: "1";
    verifyingContract: typeof ARC_GATEWAY_WALLET;
  };
};

export function resolveArcPayTo(): string {
  const raw = (process.env.ARC_PAY_TO_EVM ?? ARC_PAY_TO_DEFAULT).replace(
    /\s+/g,
    "",
  );
  if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    throw new Error(
      `ARC_PAY_TO_EVM must be a 42-char 0x address (got length ${raw.length})`,
    );
  }
  return raw;
}

/**
 * Build Arc v2 payment requirements matching Circle GatewayWalletBatched.
 * Amount is USDC atomic (6 decimals), e.g. "50000" for $0.05.
 */
export function buildArcPaymentRequirements(opts: {
  amountUsdc: string;
  payTo?: string;
  maxTimeoutSeconds?: number;
}): ArcPaymentRequirements {
  const amount = usdcToAtomic(opts.amountUsdc).toString();
  return {
    scheme: "exact",
    network: NETWORK_ARC,
    amount,
    asset: USDC_ARC_MAINNET,
    payTo: opts.payTo ?? resolveArcPayTo(),
    maxTimeoutSeconds:
      opts.maxTimeoutSeconds ?? GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: ARC_GATEWAY_WALLET,
    },
  };
}

let circleClient: BatchFacilitatorClient | null = null;

export function getCircleGatewayClient(): BatchFacilitatorClient {
  if (!circleClient) {
    circleClient = new BatchFacilitatorClient({
      url: "https://gateway-api.circle.com",
    });
  }
  return circleClient;
}

/** Confirm live Arc kind still matches what we code against. */
export async function fetchLiveArcKind(): Promise<{
  ok: boolean;
  kind: unknown;
  mismatch?: string;
}> {
  const client = getCircleGatewayClient();
  const supported = await client.getSupported();
  const kind = supported.kinds.find((k) => k.network === NETWORK_ARC);
  if (!kind) {
    return { ok: false, kind: null, mismatch: "Arc eip155:5042 missing from /supported" };
  }
  const extra = (kind.extra ?? {}) as Record<string, unknown>;
  if (kind.scheme !== "exact") {
    return { ok: false, kind, mismatch: `scheme=${kind.scheme}` };
  }
  if (kind.x402Version !== 2) {
    return { ok: false, kind, mismatch: `x402Version=${kind.x402Version}` };
  }
  if (extra.name !== "GatewayWalletBatched") {
    return { ok: false, kind, mismatch: `extra.name=${String(extra.name)}` };
  }
  const vc = String(extra.verifyingContract ?? "").toLowerCase();
  if (vc !== ARC_GATEWAY_WALLET.toLowerCase()) {
    return { ok: false, kind, mismatch: `verifyingContract=${vc}` };
  }
  const assets = extra.assets as Array<{ address?: string; decimals?: number }> | undefined;
  const usdc = assets?.[0];
  if (
    !usdc ||
    String(usdc.address ?? "").toLowerCase() !== USDC_ARC_MAINNET.toLowerCase() ||
    usdc.decimals !== 6
  ) {
    return { ok: false, kind, mismatch: "USDC asset mismatch" };
  }
  return { ok: true, kind };
}

export type DecodedPaymentPayload = {
  x402Version: number;
  accepted?: {
    scheme?: string;
    network?: string;
    asset?: string;
    amount?: string;
    payTo?: string;
    maxTimeoutSeconds?: number;
    extra?: Record<string, unknown>;
  };
  payload?: Record<string, unknown>;
  resource?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
};

export function decodePaymentHeader(
  raw: string | null | undefined,
): DecodedPaymentPayload | null {
  if (!raw) return null;
  const candidates = [raw];
  try {
    const pad = "=".repeat((4 - (raw.length % 4)) % 4);
    candidates.push(Buffer.from(raw + pad, "base64url").toString("utf8"));
  } catch {
    /* ignore */
  }
  try {
    candidates.push(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    /* ignore */
  }
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as DecodedPaymentPayload;
      if (parsed && typeof parsed === "object" && "x402Version" in parsed) {
        return parsed;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/** True when the client payment targets the Arc / GatewayWalletBatched rail. */
export function isArcPaymentPayload(
  payload: DecodedPaymentPayload | null,
): boolean {
  if (!payload?.accepted) return false;
  const accepted = payload.accepted;
  if (accepted.network === NETWORK_ARC || accepted.network === "eip155:5042") {
    return true;
  }
  try {
    return isBatchPayment(
      accepted as {
        scheme: string;
        network: string;
        asset: string;
        amount: string;
        payTo: string;
        maxTimeoutSeconds: number;
        extra?: Record<string, unknown>;
      },
    );
  } catch {
    return accepted.extra?.name === "GatewayWalletBatched";
  }
}

export function encodePaymentRequiredHeader(body: unknown): string {
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64");
}

export function decodePaymentRequiredHeader(
  raw: string,
): Record<string, unknown> | null {
  try {
    const pad = "=".repeat((4 - (raw.length % 4)) % 4);
    return JSON.parse(
      Buffer.from(raw + pad, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(
        Buffer.from(raw, "base64").toString("utf8"),
      ) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

/**
 * Append Arc accept to a v2 PAYMENT-REQUIRED body.
 * Base accept stays first and byte-identical. No-op for v1 / missing accepts.
 */
export function appendArcAcceptToPaymentRequired(
  paymentRequired: Record<string, unknown>,
  arcAccept: ArcPaymentRequirements,
): Record<string, unknown> {
  const version = paymentRequired.x402Version;
  if (version !== 2) {
    return paymentRequired;
  }
  const accepts = paymentRequired.accepts;
  if (!Array.isArray(accepts)) {
    return paymentRequired;
  }
  // Idempotent — do not double-append
  if (
    accepts.some(
      (a) =>
        a &&
        typeof a === "object" &&
        (a as { network?: string }).network === NETWORK_ARC,
    )
  ) {
    return paymentRequired;
  }
  return {
    ...paymentRequired,
    accepts: [...accepts, arcAccept],
  };
}

