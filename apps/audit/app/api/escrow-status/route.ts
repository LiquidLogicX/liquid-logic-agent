/**
 * GET/POST /api/escrow-status — $0.005 USDC on Base (same CDP facilitator + payTo as /api/lock-status).
 * What state is this X-Escrow in? Read-only onchain lookups by chain+id or by party address.
 *
 * Order: x402 verify → handler → settle. @x402/next only settles when the handler
 * returns < 400, so bad input (400) and "every RPC failed" (503) are free.
 * Not wrapped with withX402DualRail (the Arc rail settles before the handler).
 */
import { NextRequest, NextResponse } from "next/server";
import { withX402FromHTTPServer } from "@x402/next";
import { ESCROW_STATUS_PRICE_LABEL, NETWORK_BASE } from "@liquid-logic/shared";
import { getAuditX402Server } from "@/lib/x402-server";
import { handleEscrowStatusInput } from "@/lib/escrow-status/handler";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function escrowStatusHandler(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const sp = url.searchParams;
  let input: { chain?: unknown; id?: unknown; address?: unknown } = {
    chain: sp.get("chain") ?? undefined,
    id: sp.get("id") ?? sp.get("escrowId") ?? undefined,
    address: sp.get("address") ?? sp.get("party") ?? undefined,
  };
  if (req.method === "POST") {
    try {
      const b = (await req.json()) as { chain?: unknown; id?: unknown; escrowId?: unknown; address?: unknown; party?: unknown };
      input = { chain: input.chain ?? b.chain, id: input.id ?? b.id ?? b.escrowId, address: input.address ?? b.address ?? b.party };
    } catch { /* fall through to 400 */ }
  }
  const { status, body } = await handleEscrowStatusInput(input);
  return NextResponse.json(body, { status });
}

async function paidHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const server = await getAuditX402Server();
    return withX402FromHTTPServer(escrowStatusHandler, server)(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "x402 escrow-status endpoint requires CDP credentials", detail: message, price: ESCROW_STATUS_PRICE_LABEL, network: NETWORK_BASE },
      { status: 503 },
    );
  }
}

export const GET = paidHandler;
export const POST = paidHandler;
