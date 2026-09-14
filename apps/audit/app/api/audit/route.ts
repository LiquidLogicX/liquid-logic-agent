import { NextRequest, NextResponse } from "next/server";
import { withX402FromHTTPServer } from "@x402/next";
import { AUDIT_PRICE_USDC, basescanTxUrl, type PaymentEvent } from "@liquid-logic/shared";
import {
  buildSpendSummary,
  loadLedgerEvents,
} from "@/lib/spend-summary";
import { getAuditX402Server } from "@/lib/x402-server";

function parseWallet(req: NextRequest): string | null {
  const url = new URL(req.url);
  const q = url.searchParams.get("wallet") ?? url.searchParams.get("address");
  if (q && /^0x[a-fA-F0-9]{40}$/.test(q)) return q;
  return null;
}

async function parseWalletFromBody(req: NextRequest): Promise<string | null> {
  try {
    const body = (await req.json()) as { wallet?: string; address?: string };
    const w = body.wallet ?? body.address;
    if (w && /^0x[a-fA-F0-9]{40}$/.test(w)) return w;
  } catch {
    /* no body */
  }
  return null;
}

function decodePaymentResponse(raw: string): {
  payer?: string;
  transaction?: string;
  txHash?: string;
  transactionHash?: string;
} | null {
  const candidates = [raw];
  try {
    const pad = "=".repeat((4 - (raw.length % 4)) % 4);
    candidates.push(Buffer.from(raw + pad, "base64url").toString("utf8"));
  } catch {
    /* ignore */
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c) as {
        payer?: string;
        transaction?: string;
        txHash?: string;
        transactionHash?: string;
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

/** If this request settled a payment from the audited wallet, include it. */
function settlementFromRequest(
  req: NextRequest,
  wallet: string,
): PaymentEvent | null {
  const raw =
    req.headers.get("payment-response") ??
    req.headers.get("x-payment-response");
  if (!raw) return null;
  const parsed = decodePaymentResponse(raw);
  if (!parsed) return null;
  const tx =
    parsed.transaction ?? parsed.txHash ?? parsed.transactionHash ?? "";
  if (!/^0x[a-fA-F0-9]{64}$/.test(tx)) return null;
  const payer = parsed.payer;
  if (payer && payer.toLowerCase() !== wallet.toLowerCase()) return null;
  const url = new URL(req.url);
  return {
    type: "payment",
    timestamp: new Date().toISOString(),
    endpoint: `${url.origin}${url.pathname}`,
    amountUsdc: AUDIT_PRICE_USDC,
    asset: "USDC",
    network: "eip155:8453",
    txHash: tx,
    basescanUrl: basescanTxUrl(tx),
    walletAddress: wallet,
    reason: "paid audit call",
  };
}

async function handleAudit(req: NextRequest): Promise<NextResponse> {
  let wallet = parseWallet(req);
  if (!wallet && req.method === "POST") {
    wallet = await parseWalletFromBody(req);
  }
  if (!wallet) {
    return NextResponse.json(
      {
        error: 'Provide wallet address as ?wallet=0x… or JSON { "wallet": "0x…" }',
      },
      { status: 400 },
    );
  }

  const extra = settlementFromRequest(req, wallet);
  const events = await loadLedgerEvents(extra ? [extra] : []);
  const summary = buildSpendSummary(wallet, events);
  return NextResponse.json(summary);
}

/**
 * CDP createX402Server returns an x402HTTPResourceServer — use
 * withX402FromHTTPServer (not withX402, which expects x402ResourceServer).
 */
async function paidHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const server = await getAuditX402Server();
    const wrapped = withX402FromHTTPServer(handleAudit, server);
    return wrapped(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.ALLOW_UNPAID_AUDIT === "1") {
      return handleAudit(req);
    }
    return NextResponse.json(
      {
        error: "x402 audit endpoint requires CDP credentials",
        detail: message,
        price: "$0.05",
        network: "eip155:8453",
      },
      { status: 503 },
    );
  }
}

export const GET = paidHandler;
export const POST = paidHandler;
