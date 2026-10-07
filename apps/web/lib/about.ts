/**
 * About page copy and links.
 * Rules: no street address, entity number, phone number or token/contract
 * address on this page. LLX Pay is in development — never link or call it live.
 */
import { PROOFS_VERIFIER_URL } from "./proofs";

export const ABOUT_TITLE = "About Liquid Logic X";

export const ABOUT_LEDE =
  "Liquid Logic X builds payment infrastructure for businesses and AI agents. Every stablecoin payment gets a permanent, public proof anyone can verify — no wallet, no login, no trust required.";

export type AboutProduct = {
  name: string;
  detail: string;
  href?: string;
  linkLabel?: string;
};

export const ABOUT_PRODUCTS: readonly AboutProduct[] = [
  {
    name: "Settlement Proofs",
    detail:
      "Verifiable receipts for USDC and stablecoin payments, live on Base, Arc and Tempo.",
    href: PROOFS_VERIFIER_URL,
    linkLabel: "View proofs",
  },
  {
    name: "Agent endpoints",
    detail:
      "Pay-per-call audit, proof and allowance checks over x402, live on Coinbase's Agentic Market.",
    href: "/docs",
    linkLabel: "Endpoint docs",
  },
  {
    name: "LLX Pay",
    detail:
      "Business stablecoin payments with approvals and receipts. In development.",
  },
];

export const COMPANY_LINE = "Liquid Logic X LLC · California, USA · Founded 2026";

export const FOUNDER_NAME = "Miles Francisco";

export const FOUNDER_LINKEDIN =
  "https://www.linkedin.com/in/miles-francisco-53b311138";

export const CONTACT_EMAIL = "hello@liquidlogicx.com";

export const CONTACT_X = "https://x.com/LiquidLogicX";

export const CONTACT_TELEGRAM = "https://t.me/LiquidLogicXofficial";
