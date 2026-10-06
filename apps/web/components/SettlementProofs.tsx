import {
  PROOFS_ARC_LABEL,
  PROOFS_LIVE_LINE,
  PROOFS_TEMPO_LABEL,
  PROOFS_TEMPO_MAINNET_URL,
  PROOFS_VERIFIER_URL,
} from "@/lib/proofs";

/** Settlement proof verifier links, shown with LLX Pay. */
export function SettlementProofs() {
  return (
    <div className="proofs-cta" id="settlement-proofs">
      <p className="proofs-line">{PROOFS_LIVE_LINE}</p>
      <div className="proofs-buttons">
        <a
          className="btn primary"
          href={PROOFS_TEMPO_MAINNET_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {PROOFS_TEMPO_LABEL}
        </a>
        <a
          className="btn secondary"
          href={PROOFS_VERIFIER_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {PROOFS_ARC_LABEL}
        </a>
      </div>
    </div>
  );
}
