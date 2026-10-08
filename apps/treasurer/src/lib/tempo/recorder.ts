/**
 * Client for arc-settlement-recorder's Tempo rail (`POST /v1/tempo/proofs`).
 * The recorder re-verifies the TIP-20 Transfer on Tempo (token allowlisted,
 * to == payee, exact 6-dec amount) before it writes the proof, so the treasurer
 * never asserts a payment the chain doesn't show.
 */
import type { Address, Hex } from "viem";

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
  ) {
    super(message);
  }
}

type Fetch = typeof globalThis.fetch;

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
        throw new RecorderError("RECORDER_API_KEY is not set on the treasurer", 503, "UNCONFIGURED");
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
        throw new RecorderError(
          `Recorder unreachable: ${err instanceof Error ? err.message : String(err)}`,
          502,
          "UNREACHABLE",
          true,
        );
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        idempotent?: boolean;
        proofTxHash?: string | null;
        proof?: { refId?: string };
        registry?: { txHash?: string | null; explorerUrl?: string };
        verifyUrl?: string;
      };
      if (!res.ok) {
        // TX_NOT_CONFIRMED can race a just-mined tx; 5xx/429 are transient.
        const retryable = res.status >= 500 || res.status === 429 || body.code === "TX_NOT_CONFIRMED";
        throw new RecorderError(
          body.error ?? `Recorder HTTP ${res.status}`,
          res.status,
          body.code,
          retryable,
        );
      }
      const proofTxHash = body.proofTxHash ?? body.registry?.txHash ?? null;
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
