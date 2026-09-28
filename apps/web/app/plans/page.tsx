import type { Metadata } from "next";
import { ResearchGrid } from "@/components/ResearchGrid";

export const metadata: Metadata = {
  title: "Roadmap",
  description:
    "What's live, what's deployed, and what's next for Liquid Logic X.",
  openGraph: {
    title: "Roadmap — Liquid Logic X",
    description:
      "What's live, what's deployed, and what's next for Liquid Logic X.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Liquid Logic X" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Roadmap — Liquid Logic X",
    description:
      "What's live, what's deployed, and what's next for Liquid Logic X.",
    images: ["/og.png"],
  },
};

export default function PlansPage() {
  return (
    <main className="page">
      <h1>Roadmap</h1>
      <p className="page-lede">
        What&apos;s live, what&apos;s deployed, and what&apos;s next. This page
        keeps the /plans URL; content is Roadmap.
      </p>
      <section className="block" style={{ borderBottom: 0, paddingTop: 0 }}>
        <div className="sec-head" style={{ gridTemplateColumns: "1fr" }}>
          <ResearchGrid />
        </div>
      </section>
    </main>
  );
}
