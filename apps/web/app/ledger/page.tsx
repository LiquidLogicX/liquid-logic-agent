import type { Metadata } from "next";
import { LedgerLive } from "@/components/LedgerLive";
import { loadLedgerLatestFromPublic } from "@/lib/loadLedgerLatest";

/** Always render dynamically — never bake a stale build-time ledger snapshot. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Public ledger",
  description:
    "Liquid Logic X operating spend in USDC on Base (Arc when present). Settled payments link to the network explorer.",
  openGraph: {
    title: "Public ledger — Liquid Logic X",
    description:
      "Liquid Logic X operating spend in USDC on Base (Arc when present). Settled payments link to the network explorer.",
    images: [{ url: "/llx-avatar.png", width: 400, height: 400, alt: "Liquid Logic X" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Public ledger — Liquid Logic X",
    description:
      "Liquid Logic X operating spend in USDC on Base (Arc when present). Settled payments link to the network explorer.",
    images: ["/llx-avatar.png"],
  },
};

export default async function LedgerPage() {
  const initialLatest = await loadLedgerLatestFromPublic();

  return (
    <main className="page">
      <h1>Public ledger</h1>
      <p className="page-lede">
        Liquid Logic X operating spend in USDC on Base (and Arc when present).
        Settled payments link to BaseScan or the Arc explorer by network. Hold
        and freeze lifecycle events appear as their own types.
      </p>
      <LedgerLive variant="page" initialLatest={initialLatest} />
    </main>
  );
}
