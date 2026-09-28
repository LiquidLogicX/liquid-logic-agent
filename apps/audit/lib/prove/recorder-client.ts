/**
 * Server-to-server client for arc-settlement-recorder (LLX Render).
 * Reuses the recorder's existing POST /v1/proofs body/field names
 * ({ txHash, payee, amountUSDC, memo } — same shape as proof #1).
 * The recorder holds the Arc key; this app never signs on Arc.
 */
import { RECORDER_TIMEOUT_MS } from "./config";

export type RecorderProof = {
  refId: string;
  payee: string;
  amountUSDC: string;
  paidAt: number;
  srcTxHash: string;
  memo: string;
  recordedAt: number;
};

export type RecorderLookup =
  | { found: true; proofId: number | null; proofTxHash: string | null; proof: RecorderProof }
  | { found: false };

export type RecorderWrite = {
  idempotent: boolean;
  proofId: number | null;
  proofTxHash: string | null;
  proof: RecorderProof;
};

export type RecorderHealth = {
  ok: boolean;
  recorderArcBalanceWei?: string;
  minRecorderGasWei?: string;
  lowGas?: boolean;
  arcChainId?: number;
};

/** Recorder said the request itself is bad (e.g. Base verify mismatch) — caller error, 400. */
export class RecorderRejected extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}
/** Recorder down / 5xx / timeout / auth misconfig — retryable, 503. */
export class RecorderUnavailable extends Error {
  constructor(
    message: string,
    readonly code: string = "RECORDER_UNAVAILABLE",
  ) {
    super(message);
  }
}

export type RecorderClient = {
  health(): Promise<RecorderHealth>;
  lookup(q: { txHash: string; payee: string; amountUSDC: string }): Promise<RecorderLookup>;
  record(body: { txHash: string; payee: string; amountUSDC: string; memo: string }): Promise<RecorderWrite>;
};

export function createRecorderClient(opts: {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): RecorderClient {
  const f = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? RECORDER_TIMEOUT_MS;

  async function req(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await f(`${opts.baseUrl}${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${opts.apiKey}`,
          Accept: "application/json",
        },
        signal: ctrl.signal,
        cache: "no-store",
      });
      let body: any = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { status: res.status, body };
    } catch (err) {
      throw new RecorderUnavailable(
        `Recorder unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  function failFrom(status: number, body: any): never {
    const msg = typeof body?.error === "string" ? body.error : `Recorder HTTP ${status}`;
    const code = typeof body?.code === "string" ? body.code : undefined;
    if (status === 400) throw new RecorderRejected(msg, code);
    if (code === "LOW_GAS_BALANCE") throw new RecorderUnavailable(msg, "LOW_GAS_BALANCE");
    // 401 (key misconfig), 429, 5xx: not the caller's fault, retry later.
    throw new RecorderUnavailable(msg, code ?? "RECORDER_UNAVAILABLE");
  }

  return {
    async health() {
      const { status, body } = await req("/health");
      if (status !== 200 || !body?.ok) {
        throw new RecorderUnavailable(`Recorder health failed (HTTP ${status})`);
      }
      return body as RecorderHealth;
    },
    async lookup(q) {
      const qs = new URLSearchParams({ txHash: q.txHash, payee: q.payee, amountUSDC: q.amountUSDC });
      const { status, body } = await req(`/v1/proofs/lookup?${qs.toString()}`);
      if (status === 200 && body?.found && body.proof) {
        return {
          found: true,
          proofId: typeof body.proofId === "number" ? body.proofId : null,
          proofTxHash: typeof body.proofTxHash === "string" ? body.proofTxHash : null,
          proof: body.proof as RecorderProof,
        };
      }
      // 404 = not recorded (or an older recorder without the lookup route — POST is
      // still idempotent on refId, so no double write either way).
      if (status === 404) return { found: false };
      failFrom(status, body);
    },
    async record(payload) {
      const { status, body } = await req("/v1/proofs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if ((status === 200 || status === 201) && body?.proof) {
        return {
          idempotent: Boolean(body.idempotent),
          proofId: typeof body.proofId === "number" ? body.proofId : null,
          proofTxHash: typeof body.proofTxHash === "string" ? body.proofTxHash : null,
          proof: body.proof as RecorderProof,
        };
      }
      failFrom(status, body);
    },
  };
}
