import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { AUDIT_PRICE_LABEL, NETWORK_BASE } from "@liquid-logic/shared";
import { buildSpendSummary } from "@/lib/spend-summary";
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

async function handleAudit(req: NextRequest): Promise<NextResponse> {
  let wallet = parseWallet(req);
  if (!wallet && req.method === "POST") {
    wallet = await parseWalletFromBody(req);
  }
  if (!wallet) {
    return NextResponse.json(
      {
        error: "Provide wallet address as ?wallet=0x… or JSON { \"wallet\": \"0x…\" }",
      },
      { status: 400 },
    );
  }

  const summary = buildSpendSummary(wallet);
  return NextResponse.json(summary);
}

/**
 * Lazy withX402 binding: createX402Server is async; we wrap once the server is ready.
 * Fallback route handlers invoke payment gating when CDP env is configured.
 */
async function paidHandler(req: NextRequest): Promise<NextResponse> {
  const payTo = (process.env.AUDIT_PAY_TO_EVM ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;
  try {
    const server = await getAuditX402Server();
    const wrapped = withX402(
      handleAudit,
      {
        accepts: {
          scheme: "exact",
          price: AUDIT_PRICE_LABEL,
          network: NETWORK_BASE,
          payTo: (server.payToEvmAddress as `0x${string}`) || payTo,
        },
        description: "Audit agent wallet spend summary (USDC / Base)",
        mimeType: "application/json",
      },
      server as never,
    );
    return wrapped(req);
  } catch (err) {
    // Without CDP credentials, still expose handler for local structure checks (402 docs).
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.ALLOW_UNPAID_AUDIT === "1") {
      return handleAudit(req);
    }
    return NextResponse.json(
      {
        error: "x402 audit endpoint requires CDP credentials",
        detail: message,
        price: AUDIT_PRICE_LABEL,
        network: NETWORK_BASE,
      },
      { status: 503 },
    );
  }
}

export const GET = paidHandler;
export const POST = paidHandler;
