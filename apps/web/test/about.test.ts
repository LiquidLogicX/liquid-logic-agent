import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  ABOUT_LEDE,
  ABOUT_PRODUCTS,
  ABOUT_TITLE,
  COMPANY_LINE,
  CONTACT_EMAIL,
  CONTACT_TELEGRAM,
  CONTACT_X,
  FOUNDER_LINKEDIN,
  TOKEN_HEADING,
  TOKEN_LABEL,
  TOKEN_NOTE,
} from "../lib/about";
import { LLX_CONTRACT, LLX_VIRTUALS } from "../lib/site";

const read = (...parts: string[]) =>
  readFileSync(join(__dirname, "..", ...parts), "utf8");

const BANNED = [
  /\bprice (?:goes|go|will|target)/i,
  /\breturns?\b/i,
  /\byield\b/i,
  /\bbuy ?backs?\b/i,
  /\bprofit/i,
  /\bpump/i,
  /\bmoon\b/i,
  /\bgrows?\b/i,
  /pay\.liquidlogicx\.com/i,
];

const pageSrc = read("app", "about", "page.tsx") + read("lib", "about.ts");
/** Page source with comment lines stripped (the rules comment names what is banned). */
const pageCode = pageSrc.replace(/^\s*(?:\/\*\*|\*).*$/gm, "");
const allCopy = [
  ABOUT_TITLE,
  ABOUT_LEDE,
  COMPANY_LINE,
  TOKEN_HEADING,
  TOKEN_LABEL,
  TOKEN_NOTE,
  ...ABOUT_PRODUCTS.flatMap((p) => [p.name, p.detail, p.href ?? ""]),
].join("\n");

test("about copy uses the Liquid Logic X brand", () => {
  assert.equal(ABOUT_TITLE, "About Liquid Logic X");
  assert.match(ABOUT_LEDE, /^Liquid Logic X builds payment infrastructure/);
  assert.equal(COMPANY_LINE, "Liquid Logic X LLC · California, USA · Founded 2026");
});

test("about copy never promises price, returns, yield or profit", () => {
  for (const re of BANNED) assert.doesNotMatch(allCopy, re);
});

test("about page never links the LLX Pay production app", () => {
  assert.doesNotMatch(pageCode, /pay\.liquidlogicx\.com/i);
});

test("LLX Pay is in development, unlinked, and never called live", () => {
  const pay = ABOUT_PRODUCTS.find((p) => p.name === "LLX Pay");
  assert.ok(pay);
  assert.equal(pay.href, undefined);
  assert.match(pay.detail, /In development\./);
  assert.doesNotMatch(pay.detail, /\blive\b/i);
});

test("product links point at the proofs verifier and endpoint docs", () => {
  const byName = Object.fromEntries(ABOUT_PRODUCTS.map((p) => [p.name, p.href]));
  assert.equal(byName["Settlement Proofs"], "https://proofs.liquidlogicx.com");
  assert.equal(byName["Agent endpoints"], "/docs");
});

test("contact links", () => {
  assert.equal(CONTACT_EMAIL, "hello@liquidlogicx.com");
  assert.equal(CONTACT_X, "https://x.com/LiquidLogicX");
  assert.equal(CONTACT_TELEGRAM, "https://t.me/LiquidLogicXofficial");
  assert.match(FOUNDER_LINKEDIN, /^https:\/\/www\.linkedin\.com\/in\/miles-francisco-/);
  assert.match(pageSrc, /href=\{`mailto:\$\{CONTACT_EMAIL\}`\}/);
});

test("about page has no street address, entity number or phone", () => {
  assert.doesNotMatch(pageCode, /TREASURER_WALLET/);
  assert.doesNotMatch(pageCode, /entity number|Secretary of State|filing/i);
  assert.doesNotMatch(pageCode, /\btel:|\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}[-.]\d{3}[-.]\d{4}\b/);
  assert.doesNotMatch(pageCode, /\b\d+\s+\w+\s+(?:St|Street|Ave|Avenue|Blvd|Rd|Road|Suite)\b/);
});

test("official $LLX token section copy", () => {
  assert.equal(TOKEN_HEADING, "Official $LLX token");
  assert.equal(TOKEN_LABEL, "$LLX on Virtuals (Base)");
  assert.equal(
    TOKEN_NOTE,
    "This is the only official $LLX contract. Any other address is not ours.",
  );
  assert.equal(LLX_VIRTUALS, "https://app.virtuals.io/virtuals/141523");
  assert.equal(LLX_CONTRACT, "0xB9Dd507a5b352783b25e14c9b6E77D9f0067380f");
});

test("about page reads the contract from the shared LLX_CONTRACT config", () => {
  assert.match(
    pageSrc,
    /import \{ LLX_CONTRACT, LLX_VIRTUALS \} from "@\/lib\/site";/,
  );
  assert.match(pageSrc, /\{LLX_CONTRACT\}/);
  assert.match(pageSrc, /href=\{LLX_VIRTUALS\}/);
  // never hard-code an address on the page
  assert.doesNotMatch(pageCode, /0x[0-9a-fA-F]{40}/);
  // homepage token section reads the same value
  const llx = read("components", "LlxSection.tsx");
  assert.match(llx, /LLX_CONTRACT,[\s\S]*\} from "@\/lib\/site";/);
  assert.doesNotMatch(llx, /0x[0-9a-fA-F]{40}/);
});

test("the $LLX contract literal lives only in lib/site.ts", () => {
  const root = join(__dirname, "..");
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === "test") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(?:ts|tsx|js|jsx|json|md)$/.test(name)) {
        if (readFileSync(full, "utf8").toLowerCase().includes(LLX_CONTRACT.toLowerCase())) {
          hits.push(full.slice(root.length + 1));
        }
      }
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(join(root, dir));
  assert.deepEqual(hits, [join("lib", "site.ts")]);
});

test("token section is plain info: no price, market cap, chart, buy or investment copy", () => {
  assert.doesNotMatch(pageCode, /\bprice\b|market ?cap|\bchart\b|\bbuy(?:ing)?\b|\binvest|\bswap\b|\btrade\b/i);
  assert.doesNotMatch(pageCode, /LLX_BASESCAN|dexscreener|geckoterminal|coingecko|uniswap/i);
});

test("header nav and footer link the About page", () => {
  assert.match(read("components", "SiteHeader.tsx"), /\{ href: "\/about", label: "About" \}/);
  const foot = read("components", "SiteFooter.tsx");
  assert.match(foot, /<a href="\/about">About<\/a>/);
  assert.match(foot, /Nothing on this site is financial advice\./);
});
