/**
 * GET/POST /api/prove — $0.02 USDC on Base (same CDP facilitator + payTo as /api/audit).
 *
 * Order: x402 verify → handleProve (Base checks, recorder write) → settle.
 * @x402/next only settles when the handler returns < 400, so 400/403/503 are free.
 * Deliberately NOT wrapped with withX402DualRail: the Arc rail settles before the
 * handler runs, which would break "charge only on success".
 */
import { NextRequest, NextResponse } from "next/server";
import { withX402FromHTTPServer } from "@x402/next";
import { NETWORK_BASE, PROVE_PRICE_LABEL } from "@liquid-logic/shared";
import { getAuditX402Server } from "@/lib/x402-server";
import { createBaseReader } from "@/lib/prove/base-rpc";
import { loadProveEnv } from "@/lib/prove/config";
import { handleProve } from "@/lib/prove/handler";
import { createRecorderClient } from "@/lib/prove/recorder-client";

export const dynamic = "force-dynamic";
/** Recorder waits for the Arc receipt; give it headroom. */
export const maxDuration = 60;

async function proveHandler(req: NextRequest): Promise<NextResponse> {
  let env;
  try {
    env = loadProveEnv();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), code: "MISCONFIGURED" },
      { status: 503 },
    );
  }
  return handleProve(req, {
    base: createBaseReader(env.baseRpcUrl),
    recorder: env.recorderApiKey
      ? createRecorderClient({ baseUrl: env.recorderUrl, apiKey: env.recorderApiKey })
      : null,
    minGasWei: env.minGasWei,
  });
}

async function paidHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const server = await getAuditX402Server();
    return withX402FromHTTPServer(proveHandler, server)(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "x402 prove endpoint requires CDP credentials",
        detail: message,
        price: PROVE_PRICE_LABEL,
        network: NETWORK_BASE,
      },
      { status: 503 },
    );
  }
}

export const GET = paidHandler;
export const POST = paidHandler;
