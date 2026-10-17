/**
 * POST /api/leak-check — $0.02 USDC on Base (same CDP facilitator + payTo as the other audit endpoints).
 * Deterministic leak-risk review of a REDACTED agent setup. No LLM, no RPC, no storage, no outbound calls.
 *
 * Order: x402 verify → handler → settle. @x402/next only settles when the handler returns < 400,
 * so bad input (400), oversize (413), rate limit (429) and 503 are free.
 * POST only: a GET would put the submitted setup in the URL, and URLs end up in access logs.
 * Not wrapped with withX402DualRail (the Arc rail settles before the handler).
 */
import { NextRequest, NextResponse } from "next/server";
import { withX402FromHTTPServer } from "@x402/next";
import { LEAK_CHECK_PRICE_LABEL, NETWORK_BASE } from "@liquid-logic/shared";
import { getAuditX402Server } from "@/lib/x402-server";
import { handleLeakCheck } from "@/lib/leak-check/handler";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

async function leakCheckHandler(req: NextRequest): Promise<NextResponse> {
  return handleLeakCheck(req);
}

async function paidHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const server = await getAuditX402Server();
    return withX402FromHTTPServer(leakCheckHandler, server)(req);
  } catch (err) {
    // Message only (never the request). Errors here come from server setup, not from input.
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "x402 leak-check endpoint requires CDP credentials", detail: message, price: LEAK_CHECK_PRICE_LABEL, network: NETWORK_BASE },
      { status: 503 },
    );
  }
}

export const POST = paidHandler;
export const GET = paidHandler;
