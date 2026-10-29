import { CopyButton } from "@/components/CopyButton";
import {
  LLX_BASESCAN,
  LLX_CONTRACT,
  LLX_V1_SNAPSHOT_BLOCK,
  LLX_V1_SNAPSHOT_TIME,
  LLX_VIRTUALS,
} from "@/lib/site";

/** Original $LLX (V1): a short card. V1 is being replaced by $LLX V2. */
export function LlxSection() {
  return (
    <div className="token-grid">
      <dl className="terms token-terms">
        <dt>Status</dt>
        <dd>Being replaced by $LLX V2</dd>
        <dt>Platform</dt>
        <dd>Virtuals, Base</dd>
        <dt>Snapshot</dt>
        <dd>
          Taken at Base block {LLX_V1_SNAPSHOT_BLOCK} ({LLX_V1_SNAPSHOT_TIME}).
          V1 bought after this block does not qualify for migration.
        </dd>
        <dt>V1 contract</dt>
        <dd>
          <div className="ca" style={{ justifyContent: "flex-end" }}>
            <a
              className="mono"
              href={LLX_BASESCAN}
              rel="noopener noreferrer"
              target="_blank"
            >
              {LLX_CONTRACT}
            </a>
            <CopyButton value={LLX_CONTRACT} />
          </div>
          <p className="ca-note">
            This is the original V1 contract, not the $LLX V2 token.
          </p>
        </dd>
        <dt>Links</dt>
        <dd>
          <a href={LLX_BASESCAN} rel="noopener noreferrer" target="_blank">
            BaseScan
          </a>
          {" · "}
          <a href={LLX_VIRTUALS} rel="noopener noreferrer" target="_blank">
            Virtuals
          </a>
        </dd>
      </dl>
    </div>
  );
}
