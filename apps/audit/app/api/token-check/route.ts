/**
 * GET/POST /api/token-check — $0.01 USDC on Base (same CDP facilitator + payTo as /api/audit).
 * Pre-trade safety check for a Base token: owner, upgradeable proxy, admin powers in code
 * (mint / blacklist / fees / pause / trading switch / max-tx), owner + burn balances,
 * DEX liquidity, pair age, 24h buys vs sells, X-Lock locks.
 *
 * Order: x402 verify → handler → settle. @x402/next only settles when the handler
 * returns < 400, so bad input, non-contracts (400) and RPC outages (503) are free.
 */
import { NextRequest, NextResponse } from "next/server";
import { withX402FromHTTPServer } from "@x402/next";
import { NETWORK_BASE, TOKEN_CHECK_PRICE_LABEL } from "@liquid-logic/shared";
import { getAuditX402Server } from "@/lib/x402-server";
import { handleTokenCheckInput } from "@/lib/token-check/handler";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function tokenCheckHandler(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  let input: { token?: unknown; chain?: unknown } = {
    token: url.searchParams.get("token") ?? url.searchParams.get("address") ?? undefined,
    chain: url.searchParams.get("chain") ?? undefined,
  };
  if (req.method === "POST") {
    try {
      const b = (await req.json()) as { token?: unknown; address?: unknown; chain?: unknown };
      input = { token: input.token ?? b.token ?? b.address, chain: input.chain ?? b.chain };
    } catch { /* fall through to 400 */ }
  }
  const { status, body } = await handleTokenCheckInput(input);
  return NextResponse.json(body, { status });
}

async function paidHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const server = await getAuditX402Server();
    return withX402FromHTTPServer(tokenCheckHandler, server)(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "x402 token-check endpoint requires CDP credentials", detail: message, price: TOKEN_CHECK_PRICE_LABEL, network: NETWORK_BASE },
      { status: 503 },
    );
  }
}

export const GET = paidHandler;
export const POST = paidHandler;
