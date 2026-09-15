import { LedgerLive } from "@/components/LedgerLive";

/** Always render dynamically — never bake a stale build-time ledger snapshot. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LedgerPage() {
  return (
    <main className="page">
      <h1>Public ledger</h1>
      <p className="muted">
        Liquid Logic X operating spend in USDC on Base. Every settled payment
        links to BaseScan. Hold and freeze lifecycle events appear as their own
        types.
      </p>
      <p className="muted small ledger-reset-note">
        Ledger reset for launch on September 15, 2026. Earlier test payments are
        listed in the changelog.
      </p>
      <LedgerLive />
    </main>
  );
}
