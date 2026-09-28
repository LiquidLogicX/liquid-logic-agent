import { NextRequest, NextResponse } from "next/server";
import {
  ALLOWANCE_PRICE_LABEL,
  ALLOWANCE_PRICE_USDC,
  NETWORK_BASE,
} from "@liquid-logic/shared";
import { buildAllowance } from "@/lib/allowance";
import { getAuditX402Server } from "@/lib/x402-server";
import { withX402DualRail } from "@/lib/with-x402-dual";

function parseWallet(req: NextRequest): string | null {
  const url = new URL(req.url);
  const q = url.searchParams.get("wallet") ?? url.searchParams.get("address");
  if (q && /^0x[a-fA-F0-9]{40}$/.test(q)) return q;
  return null;
}

function parseEndpoint(req: NextRequest): string | null {
  const url = new URL(req.url);
  const q = url.searchParams.get("endpoint") ?? url.searchParams.get("url");
  return q && q.trim() ? q.trim() : null;
}

function parseAmount(req: NextRequest): string | null {
  const url = new URL(req.url);
  const q = url.searchParams.get("amount") ?? url.searchParams.get("amountUsdc");
  return q && q.trim() ? q.trim() : null;
}

async function parseBody(req: NextRequest): Promise<{
  wallet: string | null;
  endpoint: string | null;
  amountUsdc: string | null;
}> {
  try {
    const body = (await req.json()) as {
      wallet?: string;
      address?: string;
      endpoint?: string;
      url?: string;
      amount?: string;
      amountUsdc?: string;
    };
    const w = body.wallet ?? body.address;
    return {
      wallet: w && /^0x[a-fA-F0-9]{40}$/.test(w) ? w : null,
      endpoint: (body.endpoint ?? body.url ?? "").trim() || null,
      amountUsdc: (body.amountUsdc ?? body.amount ?? "").trim() || null,
    };
  } catch {
    return { wallet: null, endpoint: null, amountUsdc: null };
  }
}

async function handleAllowance(req: NextRequest): Promise<NextResponse> {
  let wallet = parseWallet(req);
  let endpoint = parseEndpoint(req);
  let amountUsdc = parseAmount(req);
  if (req.method === "POST") {
    const body = await parseBody(req);
    wallet = wallet ?? body.wallet;
    endpoint = endpoint ?? body.endpoint;
    amountUsdc = amountUsdc ?? body.amountUsdc;
  }
  if (!wallet) {
    return NextResponse.json(
      {
        error:
          'Provide wallet as ?wallet=0x… (optional ?endpoint=https://… ) or JSON { "wallet": "0x…", "endpoint": "https://…" }',
      },
      { status: 400 },
    );
  }

  const report = await buildAllowance({
    walletAddress: wallet,
    endpoint,
    amountUsdc,
  });
  return NextResponse.json(report);
}

async function paidHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const server = await getAuditX402Server();
    const wrapped = withX402DualRail(handleAllowance, server, {
      label: ALLOWANCE_PRICE_LABEL,
      amountUsdc: ALLOWANCE_PRICE_USDC,
    });
    return wrapped(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.ALLOW_UNPAID_AUDIT === "1") {
      return handleAllowance(req);
    }
    return NextResponse.json(
      {
        error: "x402 allowance endpoint requires CDP credentials",
        detail: message,
        price: ALLOWANCE_PRICE_LABEL,
        network: NETWORK_BASE,
      },
      { status: 503 },
    );
  }
}

export const GET = paidHandler;
export const POST = paidHandler;
