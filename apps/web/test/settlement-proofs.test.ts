import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  PROOFS_ARC_LABEL,
  PROOFS_LIVE_LINE,
  PROOFS_TEMPO_LABEL,
  PROOFS_TEMPO_MAINNET_URL,
  PROOFS_VERIFIER_URL,
} from "../lib/proofs";

const read = (...parts: string[]) =>
  readFileSync(join(__dirname, "..", ...parts), "utf8");

test("Tempo mainnet button points at the verifier's tempo-mainnet tab", () => {
  assert.equal(PROOFS_TEMPO_LABEL, "Verify on Tempo mainnet");
  assert.equal(
    PROOFS_TEMPO_MAINNET_URL,
    "https://proofs.liquidlogicx.com/?network=tempo-mainnet",
  );
});

test("Arc button points at the verifier home", () => {
  assert.equal(PROOFS_ARC_LABEL, "View proofs on Arc");
  assert.equal(PROOFS_VERIFIER_URL, "https://proofs.liquidlogicx.com");
});

test("copy line says proofs are live on Arc + Tempo mainnet", () => {
  assert.equal(PROOFS_LIVE_LINE, "Settlement proofs live on Arc + Tempo mainnet.");
});

test("component renders both buttons and the copy line", () => {
  const src = read("components", "SettlementProofs.tsx");
  assert.match(src, /href=\{PROOFS_TEMPO_MAINNET_URL\}/);
  assert.match(src, /href=\{PROOFS_VERIFIER_URL\}/);
  assert.match(src, /\{PROOFS_LIVE_LINE\}/);
  assert.match(src, /\{PROOFS_TEMPO_LABEL\}/);
  assert.match(src, /\{PROOFS_ARC_LABEL\}/);
});

test("LLX Pay section shows the settlement proof buttons", () => {
  const src = read("components", "LlxPaySection.tsx");
  assert.match(src, /<SettlementProofs \/>/);
});

test("proof links never point at the LLX Pay production app", () => {
  const src = read("lib", "proofs.ts") + read("components", "SettlementProofs.tsx");
  assert.doesNotMatch(src.replace(/^\s*\*.*$/gm, ""), /pay\.liquidlogicx\.com/i);
  for (const url of [PROOFS_TEMPO_MAINNET_URL, PROOFS_VERIFIER_URL]) {
    assert.doesNotMatch(url, /pay\.liquidlogicx\.com/i);
  }
});

test("proof buttons keep a 44px tap target", () => {
  const css = read("app", "globals.css").replace(/\s+/g, " ");
  assert.match(css, /\.proofs-buttons \.btn \{[^}]*min-height: 44px;/);
});
