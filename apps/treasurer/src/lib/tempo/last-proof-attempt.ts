/**
 * In-memory record of the most recent call from the treasurer to
 * arc-settlement-recorder's Tempo proof endpoint. Lets Miles debug Demo Pay
 * proof failures when Render logs are unavailable. Never stores the API key.
 */
export type LastProofAttempt = {
  /** ISO timestamp of the attempt. */
  at: string;
  /** Payment tx hash that was sent to the recorder (null if never reached the call). */
  paymentTxHash: string | null;
  /** HTTP status from the recorder, or null if no response (timeout / network). */
  status: number | null;
  /** First ~300 chars of the response body (or network error text). Never the API key. */
  bodyPreview: string | null;
  /** Short display string for /healthz and the Demo Pay card (body.error or message). */
  error: string | null;
  /** True when the recorder returned 2xx with a proof tx hash. */
  ok: boolean;
};

/** Slim view for GET /healthz (no auth). */
export type LastProofAttemptHealth = {
  status: number | null;
  at: string;
  error: string | null;
};

const BODY_PREVIEW_MAX = 300;

let last: LastProofAttempt | null = null;

export function previewBody(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length <= BODY_PREVIEW_MAX ? t : `${t.slice(0, BODY_PREVIEW_MAX)}…`;
}

export function recordLastProofAttempt(attempt: LastProofAttempt): LastProofAttempt {
  last = attempt;
  return attempt;
}

export function getLastProofAttempt(): LastProofAttempt | null {
  return last;
}

export function lastProofAttemptForHealth(): LastProofAttemptHealth | null {
  if (!last) return null;
  return { status: last.status, at: last.at, error: last.error };
}

/** Test-only: clear between cases. */
export function resetLastProofAttempt(): void {
  last = null;
}
