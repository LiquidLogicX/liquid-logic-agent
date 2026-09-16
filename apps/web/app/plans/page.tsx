import type { Metadata } from "next";
import { ResearchGrid } from "@/components/ResearchGrid";

export const metadata: Metadata = {
  title: "Research",
  description:
    "What is live on Base, what is built on Sepolia, and the intended direction for confidential spend caps.",
  openGraph: {
    title: "Research — Liquid Logic X",
    description:
      "What is live on Base, what is built on Sepolia, and the intended direction for confidential spend caps.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Liquid Logic X" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Research — Liquid Logic X",
    description:
      "What is live on Base, what is built on Sepolia, and the intended direction for confidential spend caps.",
    images: ["/og.png"],
  },
};

export default function PlansPage() {
  return (
    <main className="page">
      <h1>Research</h1>
      <p className="page-lede">
        Ordered by how real it is. Only the first item is part of the live
        product. This page keeps the /plans URL; content is Research.
      </p>
      <section className="block" style={{ borderBottom: 0, paddingTop: 0 }}>
        <div className="sec-head" style={{ gridTemplateColumns: "1fr" }}>
          <ResearchGrid />
        </div>
      </section>
    </main>
  );
}
