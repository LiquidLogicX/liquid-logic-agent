/**
 * GET/POST /api/lock-status — $0.005 USDC on Base (same CDP facilitator + payTo as /api/audit).
 * Is this token locked in X-Lock? Read-only onchain lookups across all 11 X-Lock chains.
 *
 * Order: x402 verify → handler → settle. @x402/next only settles when the handler
 * returns < 400, so bad input (400) and "every RPC failed" (503) are free.
 * Not wrapped with withX402DualRail (the Arc rail settles before the handler).
 */
import { NextRequest, NextResponse } from "next/server";
import { withX402FromHTTPServer } from "@x402/next";
import { LOCK_STATUS_PRICE_LABEL, NETWORK_BASE } from "@liquid-logic/shared";
import { getAuditX402Server } from "@/lib/x402-server";
import { handleLockStatusInput } from "@/lib/lock-status/handler";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function lockStatusHandler(req: NextRequest): Promise<NextResponse> {
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
  const { status, body } = await handleLockStatusInput(input);
  return NextResponse.json(body, { status });
}

async function paidHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const server = await getAuditX402Server();
    return withX402FromHTTPServer(lockStatusHandler, server)(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "x402 lock-status endpoint requires CDP credentials", detail: message, price: LOCK_STATUS_PRICE_LABEL, network: NETWORK_BASE },
      { status: 503 },
    );
  }
}

export const GET = paidHandler;
export const POST = paidHandler;
