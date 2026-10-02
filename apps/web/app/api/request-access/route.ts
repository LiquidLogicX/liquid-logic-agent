import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { handleAccessRequest, MSG_UNAVAILABLE } from "@/lib/requestAccess";

export const dynamic = "force-dynamic";

function clientKey(req: NextRequest): string {
  const ip =
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown";
  // Store only a hash of the IP, used for rate limiting.
  return createHash("sha256").update(`llxpay:${ip}`).digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
  const len = Number(req.headers.get("content-length") || "0");
  if (len > 4096) {
    return NextResponse.json({ ok: false, message: "Request too large." }, { status: 413 });
  }
  let input: unknown = null;
  try {
    input = await req.json();
  } catch {
    input = null;
  }
  try {
    const result = await handleAccessRequest(input, {
      env: process.env,
      clientKey: clientKey(req),
      userAgent: req.headers.get("user-agent") || undefined,
    });
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ ok: false, message: MSG_UNAVAILABLE }, { status: 503 });
  }
}
