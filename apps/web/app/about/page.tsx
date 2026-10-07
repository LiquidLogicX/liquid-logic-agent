import type { Metadata } from "next";
import {
  ABOUT_LEDE,
  ABOUT_PRODUCTS,
  ABOUT_TITLE,
  COMPANY_LINE,
  CONTACT_EMAIL,
  CONTACT_TELEGRAM,
  CONTACT_X,
  FOUNDER_LINKEDIN,
  FOUNDER_NAME,
  TOKEN_HEADING,
  TOKEN_LABEL,
  TOKEN_NOTE,
} from "@/lib/about";
import { LLX_CONTRACT, LLX_VIRTUALS } from "@/lib/site";

const DESCRIPTION =
  "Liquid Logic X builds payment infrastructure for businesses and AI agents, with a public, verifiable proof for every stablecoin payment.";

export const metadata: Metadata = {
  title: "About",
  description: DESCRIPTION,
  openGraph: {
    title: "About — Liquid Logic X",
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Liquid Logic X" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "About — Liquid Logic X",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

const isExternal = (href: string) => href.startsWith("http");

export default function AboutPage() {
  return (
    <main className="page about">
      <h1>{ABOUT_TITLE}</h1>
      <p className="page-lede">{ABOUT_LEDE}</p>

      <section className="docs-card" aria-labelledby="about-build">
        <h2 id="about-build">What we build</h2>
        <ul className="about-list">
          {ABOUT_PRODUCTS.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong> — {p.detail}
              {p.href ? (
                <>
                  {" "}
                  <a
                    href={p.href}
                    {...(isExternal(p.href)
                      ? { rel: "noopener noreferrer" }
                      : {})}
                  >
                    {p.linkLabel} →
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="docs-card" aria-labelledby="about-company">
        <h2 id="about-company">Company</h2>
        <p>{COMPANY_LINE}</p>
        <p>
          Founder &amp; CEO:{" "}
          <a href={FOUNDER_LINKEDIN} rel="noopener noreferrer">
            {FOUNDER_NAME}
          </a>
        </p>
      </section>

      <section className="docs-card" aria-labelledby="about-contact">
        <h2 id="about-contact">Contact</h2>
        <ul className="about-list">
          <li>
            Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </li>
          <li>
            X:{" "}
            <a href={CONTACT_X} rel="me noopener noreferrer">
              @LiquidLogicX
            </a>
          </li>
          <li>
            Telegram:{" "}
            <a href={CONTACT_TELEGRAM} rel="noopener noreferrer">
              t.me/LiquidLogicXofficial
            </a>
          </li>
          <li>
            LinkedIn:{" "}
            <a href={FOUNDER_LINKEDIN} rel="noopener noreferrer">
              {FOUNDER_NAME}
            </a>
          </li>
        </ul>
      </section>

      <section className="docs-card" aria-labelledby="about-token">
        <h2 id="about-token">{TOKEN_HEADING}</h2>
        <p>{TOKEN_LABEL}:</p>
        <p>
          <code className="about-ca">{LLX_CONTRACT}</code>
        </p>
        <p>
          Link:{" "}
          <a href={LLX_VIRTUALS} rel="noopener noreferrer">
            {LLX_VIRTUALS.replace(/^https:\/\//, "")}
          </a>
        </p>
        <p className="ca-note">{TOKEN_NOTE}</p>
      </section>
    </main>
  );
}
