import { timingSafeEqual } from "node:crypto";

export type OperatorAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; error: string };

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    // Constant-time-ish length mismatch: compare ba to itself then fail.
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/**
 * Principal-only bearer auth for operator freeze/unfreeze.
 * Fail closed: missing configured token or missing/wrong Authorization → 401/403.
 * Never logs the token value.
 */
export function requireOperatorBearer(
  authorizationHeader: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): OperatorAuthResult {
  const expected = (env.LLX_OPERATOR_TOKEN ?? "").trim();
  if (!expected) {
    return {
      ok: false,
      status: 401,
      error: "Operator token not configured",
    };
  }

  const raw = (authorizationHeader ?? "").trim();
  if (!raw) {
    return { ok: false, status: 401, error: "Missing Authorization bearer token" };
  }

  const match = /^Bearer\s+(.+)$/i.exec(raw);
  if (!match) {
    return { ok: false, status: 401, error: "Expected Authorization: Bearer <token>" };
  }

  const presented = match[1]!.trim();
  if (!presented || !safeEqual(presented, expected)) {
    return { ok: false, status: 403, error: "Invalid operator token" };
  }

  return { ok: true };
}
