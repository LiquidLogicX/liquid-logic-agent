import { NextRequest, NextResponse } from "next/server";
import { withX402FromHTTPServer } from "@x402/next";
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
        error: 'Provide wallet address as ?wallet=0x… or JSON { "wallet": "0x…" }',
      },
      { status: 400 },
    );
  }

  const summary = buildSpendSummary(wallet);
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
