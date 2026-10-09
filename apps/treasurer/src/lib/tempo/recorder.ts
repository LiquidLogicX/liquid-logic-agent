/**
 * Client for arc-settlement-recorder's Tempo rail (`POST /v1/tempo/proofs`).
 * The recorder re-verifies the TIP-20 Transfer on Tempo (token allowlisted,
 * to == payee, exact 6-dec amount) before it writes the proof, so the treasurer
 * never asserts a payment the chain doesn't show.
 *
 * Every attempt (ok or fail) is written to the in-memory last-proof-attempt
 * store for Demo Pay debugging — never the API key.
 */
import type { Address, Hex } from "viem";
import {
  previewBody,
  recordLastProofAttempt,
  type LastProofAttempt,
} from "./last-proof-attempt.js";

export type RecorderProofResult = {
  proofTxHash: string | null;
  proofExplorerUrl: string | null;
  verifyUrl: string | null;
  refId: string | null;
  idempotent: boolean;
};

export interface TempoRecorder {
  recordProof(args: {
    txHash: Hex;
    payee: Address;
    amountAtomic: bigint;
    memo: string;
  }): Promise<RecorderProofResult>;
}

export class RecorderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly retryable = false,
    /** Snapshot of this attempt for the Demo Pay card / last-attempt route. */
    readonly attempt?: LastProofAttempt,
  ) {
    super(message);
  }
}

type Fetch = typeof globalThis.fetch;

function noteAttempt(partial: Omit<LastProofAttempt, "at"> & { at?: string }): LastProofAttempt {
  return recordLastProofAttempt({
    at: partial.at ?? new Date().toISOString(),
    paymentTxHash: partial.paymentTxHash,
    status: partial.status,
    bodyPreview: partial.bodyPreview,
    error: partial.error,
    ok: partial.ok,
  });
}

export function createHttpRecorder(opts: {
  url: string;
  apiKey: string | null;
  fetchImpl?: Fetch;
  timeoutMs?: number;
}): TempoRecorder {
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  return {
    async recordProof({ txHash, payee, amountAtomic, memo }) {
      if (!opts.apiKey) {
        const attempt = noteAttempt({
          paymentTxHash: txHash,
          status: 503,
          bodyPreview: null,
          error: "RECORDER_API_KEY is not set on the treasurer",
          ok: false,
        });
        throw new RecorderError(
          "RECORDER_API_KEY is not set on the treasurer",
          503,
          "UNCONFIGURED",
          false,
          attempt,
        );
      }
      let res: Response;
      try {
        res = await doFetch(`${opts.url}/v1/tempo/proofs`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${opts.apiKey}`,
          },
          body: JSON.stringify({
            txHash,
            payee,
            amountUSDC: amountAtomic.toString(),
            memo,
          }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const attempt = noteAttempt({
          paymentTxHash: txHash,
          status: null,
          bodyPreview: previewBody(msg),
          error: `Recorder unreachable: ${msg}`,
          ok: false,
        });
        throw new RecorderError(
          `Recorder unreachable: ${msg}`,
          502,
          "UNREACHABLE",
          true,
          attempt,
        );
      }

      const rawText = await res.text().catch(() => "");
      const bodyPreview = previewBody(rawText);
      let body: {
        error?: string;
        code?: string;
        idempotent?: boolean;
        proofTxHash?: string | null;
        proof?: { refId?: string };
        registry?: { txHash?: string | null; explorerUrl?: string };
        verifyUrl?: string;
      } = {};
      if (rawText.trim()) {
        try {
          body = JSON.parse(rawText) as typeof body;
        } catch {
          body = {};
        }
      }

      if (!res.ok) {
        // TX_NOT_CONFIRMED can race a just-mined tx; 5xx/429 are transient.
        const retryable = res.status >= 500 || res.status === 429 || body.code === "TX_NOT_CONFIRMED";
        const errorText =
          (typeof body.error === "string" && body.error.trim()) ||
          bodyPreview ||
          `Recorder HTTP ${res.status}`;
        const attempt = noteAttempt({
          paymentTxHash: txHash,
          status: res.status,
          bodyPreview,
          error: errorText,
          ok: false,
        });
        throw new RecorderError(errorText, res.status, body.code, retryable, attempt);
      }

      const proofTxHash = body.proofTxHash ?? body.registry?.txHash ?? null;
      if (!proofTxHash) {
        const errorText = "Recorder returned no proof transaction hash";
        const attempt = noteAttempt({
          paymentTxHash: txHash,
          status: res.status,
          bodyPreview,
          error: errorText,
          ok: false,
        });
        throw new RecorderError(errorText, 502, "NO_PROOF_TX", true, attempt);
      }

      noteAttempt({
        paymentTxHash: txHash,
        status: res.status,
        bodyPreview,
        error: null,
        ok: true,
      });

      return {
        proofTxHash,
        proofExplorerUrl: proofTxHash ? body.registry?.explorerUrl ?? null : null,
        verifyUrl: body.verifyUrl ?? null,
        refId: body.proof?.refId ?? null,
        idempotent: Boolean(body.idempotent),
      };
    },
  };
}
