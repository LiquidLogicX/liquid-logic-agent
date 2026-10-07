import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
} from "../lib/about";

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

test("about page has no address, entity number, phone or contract address", () => {
  assert.doesNotMatch(pageCode, /0x[0-9a-fA-F]{40}/);
  assert.doesNotMatch(pageCode, /LLX_CONTRACT|TREASURER_WALLET/);
  assert.doesNotMatch(pageCode, /entity number|Secretary of State|filing/i);
  assert.doesNotMatch(pageCode, /\btel:|\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}[-.]\d{3}[-.]\d{4}\b/);
  assert.doesNotMatch(pageCode, /\b\d+\s+\w+\s+(?:St|Street|Ave|Avenue|Blvd|Rd|Road|Suite)\b/);
});

test("header nav and footer link the About page", () => {
  assert.match(read("components", "SiteHeader.tsx"), /\{ href: "\/about", label: "About" \}/);
  const foot = read("components", "SiteFooter.tsx");
  assert.match(foot, /<a href="\/about">About<\/a>/);
  assert.match(foot, /Nothing on this site is financial advice\./);
});
