/**
 * /api/leak-check request handling (x402 lives in route.ts; this runs only after payment is verified).
 *
 * PRIVACY: the submitted body is processed in memory only. It is never logged, stored, cached,
 * echoed, or sent anywhere. The only log line holds: timestamp, status, byte size, finding ids,
 * error code. JSON parse errors are NOT forwarded (they can quote the input).
 */
import { NextRequest, NextResponse } from "next/server";
import { containsSecretLike } from "./secrets";
import { MAX_BODY_BYTES, validateLeakCheckInput } from "./schema";
import { runLeakCheck } from "./rules";
import { createRateLimiter } from "./ratelimit";

export type LeakCheckDeps = {
  log?: (line: string) => void;
  /** returns false when the caller is over the limit */
  allow?: (key: string) => boolean;
  now?: () => Date;
};

const defaultAllow = createRateLimiter(30, 60_000);
const defaultLog = (line: string) => console.log(line);

function payerOf(req: NextRequest): string | null {
  try {
    const h = req.headers.get("payment-signature");
    if (!h) return null;
    const from = JSON.parse(Buffer.from(h, "base64").toString("utf8"))?.payload?.authorization?.from;
    return typeof from === "string" && /^0x[0-9a-fA-F]{40}$/.test(from) ? from.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Read the body up to the cap; returns null when it is larger. */
async function readCapped(req: NextRequest): Promise<{ text: string; bytes: number } | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  if (!req.body) return { text: "", bytes: 0 };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString("utf8"), bytes };
}

export async function handleLeakCheck(req: NextRequest, deps: LeakCheckDeps = {}): Promise<NextResponse> {
  const log = deps.log ?? defaultLog;
  const allow = deps.allow ?? defaultAllow;
  const ts = (deps.now?.() ?? new Date()).toISOString();
  const done = (status: number, body: unknown, bytes: number, extra: { code?: string; ids?: string[] } = {}) => {
    log(JSON.stringify({ event: "leak-check", ts, status, bytes, ...(extra.code && { code: extra.code }), ...(extra.ids && { findings: extra.ids }) }));
    return NextResponse.json(body, { status });
  };

  if (req.method !== "POST") {
    return done(405, { error: "POST a JSON body to /api/leak-check. Query strings are not accepted because URLs get logged.", code: "METHOD_NOT_ALLOWED" }, 0, { code: "METHOD_NOT_ALLOWED" });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const payer = payerOf(req);
  if (!allow(`ip:${ip}`) || (payer && !allow(`payer:${payer}`))) {
    return done(429, { error: "Too many requests. Not charged. Retry in a minute.", code: "RATE_LIMITED" }, 0, { code: "RATE_LIMITED" });
  }

  const body = await readCapped(req);
  if (!body) {
    return done(413, { error: `Body too large. Maximum ${MAX_BODY_BYTES} bytes. Not charged.`, code: "TOO_LARGE" }, MAX_BODY_BYTES + 1, { code: "TOO_LARGE" });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return done(400, { error: "Body must be valid JSON. Not charged.", code: "BAD_JSON" }, body.bytes, { code: "BAD_JSON" });
  }

  if (containsSecretLike(parsed)) {
    return done(
      400,
      { error: "Input looks like it contains a secret, key, token, long hex string or balance. Nothing was stored or echoed. Redact it and send structure and labels only. Not charged.", code: "SECRET_LIKE_INPUT" },
      body.bytes,
      { code: "SECRET_LIKE_INPUT" },
    );
  }

  const v = validateLeakCheckInput(parsed);
  if (!v.ok) return done(400, { error: `${v.error} Not charged.`, code: v.code }, body.bytes, { code: v.code });

  const report = runLeakCheck(v.value);
  return done(200, report, body.bytes, { ids: report.findings.map((f) => f.id) });
}
