/**
 * LLX Pay "Request access" submissions.
 *
 * Storage: Upstash Redis REST (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN,
 * or the Vercel KV names KV_REST_API_URL + KV_REST_API_TOKEN). Each submission is
 * LPUSHed as JSON onto the list `llxpay:access_requests`.
 * Notification: Resend (RESEND_API_KEY + ACCESS_REQUEST_FROM, a sender on a
 * Resend-verified domain), sent to ACCESS_REQUEST_NOTIFY_TO
 * (default hello@liquidlogicx.com).
 *
 * Fails safe: if neither sink is configured or both fail, the caller gets a
 * friendly 503 that points to hello@liquidlogicx.com. No secrets in the repo.
 */

export const CONTACT_EMAIL = "hello@liquidlogicx.com";
export const REQUESTS_LIST_KEY = "llxpay:access_requests";
export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_SECONDS = 600;

export const MSG_OK =
  "Thanks. We'll be in touch at your work email about early access.";
export const MSG_UNAVAILABLE = `We couldn't take your request right now. Please email ${CONTACT_EMAIL} and we'll get back to you.`;
export const MSG_RATE_LIMITED = "Too many requests. Please try again in a few minutes.";

export type AccessRequest = { company: string; email: string };

export type ValidationResult =
  | { ok: true; value: AccessRequest; honeypot: boolean }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
// Control characters (incl. CR/LF) are never valid in either field.
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

export function validateAccessRequest(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Please enter your company name and work email." };
  }
  const raw = input as Record<string, unknown>;
  // Honeypot: real users never see or fill this field.
  const honeypot = typeof raw.website === "string" && raw.website.trim() !== "";
  const company = typeof raw.company === "string" ? raw.company.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim() : "";

  if (!company || company.length > 120 || CONTROL_RE.test(company)) {
    return { ok: false, error: "Please enter your company name (up to 120 characters)." };
  }
  if (!email || email.length > 254 || CONTROL_RE.test(email) || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Please enter a valid work email." };
  }
  return { ok: true, value: { company, email: email.toLowerCase() }, honeypot };
}

export type Env = Record<string, string | undefined>;

export type Config = {
  redis: { url: string; token: string } | null;
  resend: { apiKey: string; from: string; to: string } | null;
};

export function readConfig(env: Env): Config {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "").trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "").trim();
  const apiKey = (env.RESEND_API_KEY || "").trim();
  const from = (env.ACCESS_REQUEST_FROM || "").trim();
  const to = (env.ACCESS_REQUEST_NOTIFY_TO || CONTACT_EMAIL).trim();
  return {
    redis: url.startsWith("https://") && token ? { url: url.replace(/\/+$/, ""), token } : null,
    resend: apiKey && from ? { apiKey, from, to } : null,
  };
}

type Fetch = typeof fetch;

async function redisPipeline(
  cfg: NonNullable<Config["redis"]>,
  commands: (string | number)[][],
  fetchImpl: Fetch,
): Promise<unknown[]> {
  const res = await fetchImpl(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`redis HTTP ${res.status}`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  for (const r of out) if (r && r.error) throw new Error("redis command error");
  return out.map((r) => r.result);
}

// Best-effort per-instance fallback when Redis is not configured.
const memoryHits = new Map<string, { count: number; resetAt: number }>();

export async function checkRateLimit(
  clientKey: string,
  cfg: Config,
  fetchImpl: Fetch = fetch,
  now: number = Date.now(),
): Promise<boolean> {
  const windowId = Math.floor(now / 1000 / RATE_LIMIT_WINDOW_SECONDS);
  const key = `llxpay:rl:${clientKey}:${windowId}`;
  if (cfg.redis) {
    try {
      const [count] = await redisPipeline(
        cfg.redis,
        [
          ["INCR", key],
          ["EXPIRE", key, RATE_LIMIT_WINDOW_SECONDS],
        ],
        fetchImpl,
      );
      return Number(count) <= RATE_LIMIT_MAX;
    } catch {
      // fall through to memory limiter
    }
  }
  const hit = memoryHits.get(key);
  if (!hit || hit.resetAt <= now) {
    memoryHits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_SECONDS * 1000 });
    if (memoryHits.size > 5000) memoryHits.clear();
    return true;
  }
  hit.count += 1;
  return hit.count <= RATE_LIMIT_MAX;
}

export async function storeRequest(
  req: AccessRequest,
  cfg: Config,
  meta: { userAgent?: string },
  fetchImpl: Fetch = fetch,
): Promise<boolean> {
  if (!cfg.redis) return false;
  try {
    const record = {
      company: req.company,
      email: req.email,
      submittedAt: new Date().toISOString(),
      userAgent: (meta.userAgent || "").slice(0, 200),
      source: "liquidlogicx.com#llx-pay",
    };
    await redisPipeline(cfg.redis, [["LPUSH", REQUESTS_LIST_KEY, JSON.stringify(record)]], fetchImpl);
    return true;
  } catch {
    return false;
  }
}

export async function notifyRequest(
  req: AccessRequest,
  cfg: Config,
  fetchImpl: Fetch = fetch,
): Promise<boolean> {
  if (!cfg.resend) return false;
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.resend.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: cfg.resend.from,
        to: [cfg.resend.to],
        reply_to: req.email,
        subject: `LLX Pay access request: ${req.company}`,
        text: `New LLX Pay early access request from liquidlogicx.com\n\nCompany: ${req.company}\nWork email: ${req.email}\nSubmitted: ${new Date().toISOString()}\n`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type HandleResult = { status: number; body: { ok: boolean; message: string } };

/** Core handler, independent of Next so it can be unit tested. */
export async function handleAccessRequest(
  input: unknown,
  ctx: { env: Env; clientKey: string; userAgent?: string; fetchImpl?: Fetch; now?: number },
): Promise<HandleResult> {
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const cfg = readConfig(ctx.env);
  const v = validateAccessRequest(input);
  if (!v.ok) return { status: 400, body: { ok: false, message: v.error } };
  // Honeypot hit: pretend success, store nothing.
  if (v.honeypot) return { status: 200, body: { ok: true, message: MSG_OK } };
  if (!(await checkRateLimit(ctx.clientKey, cfg, fetchImpl, ctx.now))) {
    return { status: 429, body: { ok: false, message: MSG_RATE_LIMITED } };
  }
  if (!cfg.redis && !cfg.resend) {
    return { status: 503, body: { ok: false, message: MSG_UNAVAILABLE } };
  }
  const [stored, notified] = await Promise.all([
    storeRequest(v.value, cfg, { userAgent: ctx.userAgent }, fetchImpl),
    notifyRequest(v.value, cfg, fetchImpl),
  ]);
  if (!stored && !notified) {
    return { status: 503, body: { ok: false, message: MSG_UNAVAILABLE } };
  }
  if (!stored || !notified) {
    console.error(`[request-access] partial delivery stored=${stored} notified=${notified}`);
  }
  return { status: 200, body: { ok: true, message: MSG_OK } };
}
