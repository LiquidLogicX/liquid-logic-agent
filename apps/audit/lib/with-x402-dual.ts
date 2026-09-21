/**
 * Dual-rail x402 wrapper: Base (CDP) + optional Arc (Circle Gateway).
 *
 * Flag off (default): delegates to withX402FromHTTPServer unchanged —
 * Base path / accepts / wire format stay byte-identical to production.
 *
 * Flag on: 402 v2 accepts = [Base, Arc]; Arc payments settle via Circle;
 * Base payments still settle via CDP. v1 bodies stay Base-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { withX402FromHTTPServer } from "@x402/next";
import type { X402Server } from "@coinbase/cdp-sdk/x402";
import {
  appendArcAcceptToPaymentRequired,
  buildArcPaymentRequirements,
  decodePaymentHeader,
  decodePaymentRequiredHeader,
  encodePaymentRequiredHeader,
  getCircleGatewayClient,
  isArcPaymentPayload,
  isX402ArcEnabled,
  type ArcPaymentRequirements,
} from "./arc-x402";

export type DualRailPrice = {
  /** Human label e.g. "$0.05" — unused for Arc amount (atomic from amountUsdc). */
  label: string;
  amountUsdc: string;
};

function paymentHeaderFrom(req: NextRequest): string | null {
  return (
    req.headers.get("payment-signature") ??
    req.headers.get("PAYMENT-SIGNATURE") ??
    req.headers.get("x-payment") ??
    req.headers.get("X-PAYMENT")
  );
}

async function settleArcAndRun(
  req: NextRequest,
  routeHandler: (request: NextRequest) => Promise<NextResponse>,
  arcAccept: ArcPaymentRequirements,
): Promise<NextResponse> {
  const raw = paymentHeaderFrom(req);
  const payload = decodePaymentHeader(raw);
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid Arc payment payload" },
      { status: 402 },
    );
  }

  const client = getCircleGatewayClient();
  // Circle docs: settle() directly in production (verify is read-only).
  const settleResult = await client.settle(payload as never, arcAccept as never);
  if (!settleResult.success) {
    return NextResponse.json(
      {
        error: "Arc payment settlement failed",
        reason: settleResult.errorReason ?? "settle_failed",
      },
      { status: 402 },
    );
  }

  const payer = settleResult.payer ?? "";
  const settleHeader = Buffer.from(
    JSON.stringify({
      success: true,
      transaction: settleResult.transaction,
      network: arcAccept.network,
      payer,
    }),
    "utf8",
  ).toString("base64");

  // Expose settlement on the request so /api/audit can union it into the summary
  // (same pattern as CDP before-handler payment-response).
  const headers = new Headers(req.headers);
  headers.set("payment-response", settleHeader);
  headers.set("PAYMENT-RESPONSE", settleHeader);
  const reqWithSettle = new NextRequest(req.url, { headers });

  const response = await routeHandler(reqWithSettle);
  response.headers.set("PAYMENT-RESPONSE", settleHeader);
  response.headers.set("payment-response", settleHeader);
  return response;
}

/**
 * When CDP returns 402, append Arc accept to v2 PAYMENT-REQUIRED (Base first).
 */
function injectArcInto402(
  res: NextResponse,
  arcAccept: ArcPaymentRequirements,
): NextResponse {
  if (res.status !== 402) return res;

  const raw =
    res.headers.get("PAYMENT-REQUIRED") ??
    res.headers.get("payment-required");
  if (!raw) return res;

  const body = decodePaymentRequiredHeader(raw);
  if (!body) return res;

  const augmented = appendArcAcceptToPaymentRequired(body, arcAccept);
  if (augmented === body) return res;

  const encoded = encodePaymentRequiredHeader(augmented);
  const headers = new Headers(res.headers);
  headers.set("PAYMENT-REQUIRED", encoded);
  headers.set("payment-required", encoded);
  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/**
 * Wrap a route handler with Base CDP + optional Arc Circle Gateway.
 * When ENABLE_X402_ARC is off, behavior matches withX402FromHTTPServer exactly.
 */
export function withX402DualRail(
  routeHandler: (request: NextRequest) => Promise<NextResponse>,
  httpServer: X402Server,
  price: DualRailPrice,
): (request: NextRequest) => Promise<NextResponse> {
  const cdpWrapped = withX402FromHTTPServer(routeHandler, httpServer);

  return async (request: NextRequest): Promise<NextResponse> => {
    if (!isX402ArcEnabled()) {
      return cdpWrapped(request);
    }

    const arcAccept = buildArcPaymentRequirements({
      amountUsdc: price.amountUsdc,
    });

    const rawPay = paymentHeaderFrom(request);
    const decoded = decodePaymentHeader(rawPay);
    if (decoded && isArcPaymentPayload(decoded)) {
      try {
        return await settleArcAndRun(request, routeHandler, arcAccept);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
          { error: "Arc payment processing error", detail: message },
          { status: 500 },
        );
      }
    }

    // Base (or no payment) — CDP path, then inject Arc into 402 v2 accepts.
    const res = await cdpWrapped(request);
    return injectArcInto402(res, arcAccept);
  };
}
