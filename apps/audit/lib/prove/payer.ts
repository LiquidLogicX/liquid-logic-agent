/**
 * Who is paying for this /api/prove call? Read from the x402 payment header the
 * facilitator already verified (verify runs before the handler; settle after).
 *   v2: PAYMENT-SIGNATURE  base64(JSON PaymentPayload)
 *   v1: X-PAYMENT          base64(JSON)
 * exact/eip3009 → payload.authorization.from; exact/permit2 → payload.permit2Authorization.from
 */
function decodeB64Json(raw: string): any | null {
  const candidates = [raw];
  try {
    candidates.push(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    /* ignore */
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* next */
    }
  }
  return null;
}

export function payerFromHeaders(headers: Headers): string | null {
  const raw =
    headers.get("payment-signature") ?? headers.get("x-payment") ?? null;
  if (!raw) return null;
  const p = decodeB64Json(raw.trim());
  const inner = p?.payload ?? {};
  const from =
    inner?.authorization?.from ??
    inner?.permit2Authorization?.from ??
    inner?.permit2?.from ??
    null;
  return typeof from === "string" && /^0x[a-fA-F0-9]{40}$/.test(from) ? from : null;
}
