import type { Metadata } from "next";
import { ChangelogList } from "@/components/ChangelogList";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What shipped at Liquid Logic X, dated and linked to a pull request or transaction.",
  openGraph: {
    title: "Changelog — Liquid Logic X",
    description: "What shipped at Liquid Logic X, dated and linked to a pull request or transaction.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Liquid Logic X" }],
  },
};

export default function ChangelogPage() {
  return (
    <>
      <section className="block" id="changelog">
        <div className="wrap sec-head">
          <div>
            <h2>Changelog</h2>
            <p className="intro">
              What shipped, dated and linked to a pull request or transaction.
            </p>
          </div>
          <ChangelogList />
        </div>
      </section>
    </>
  );
}
