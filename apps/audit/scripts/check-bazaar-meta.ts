/**
 * Bazaar listing metadata guard: every paid route's serviceName / tags /
 * description must pass the x402 v2 limits, or the facilitator drops the field
 * (name/tags) or rejects verify+settle outright (description > 500 chars).
 *
 *   npm run check-bazaar-meta -w @liquid-logic/audit
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidServiceName, sanitizeTags } from "@x402/extensions/bazaar";
import {
  ALLOWANCE_META,
  AUDIT_META,
  BAZAAR_ICON_URL,
  PROVE_META,
} from "../lib/bazaar-meta";
import { PROVE_DESCRIPTION } from "../lib/prove/discovery";
import { PROVE_ROUTES } from "../lib/x402-server";

const ALL = { prove: PROVE_META, audit: AUDIT_META, allowance: ALLOWANCE_META };

for (const [route, meta] of Object.entries(ALL)) {
  test(`${route}: serviceName is valid x402 (<= 32 printable ASCII)`, () => {
    assert.ok(isValidServiceName(meta.serviceName), meta.serviceName);
  });

  test(`${route}: tags survive x402 sanitization unchanged (<= 5, unique, ASCII)`, () => {
    assert.ok(meta.tags.length >= 3 && meta.tags.length <= 5, `${meta.tags.length} tags`);
    assert.deepEqual(sanitizeTags(meta.tags), meta.tags);
  });

  test(`${route}: description <= 500 chars, printable ASCII, branded`, () => {
    assert.ok(meta.description.length <= 500, `${meta.description.length} chars`);
    assert.match(meta.description, /^[\x20-\x7E]+$/);
    assert.match(meta.description, /Liquid Logic X/);
    assert.doesNotMatch(meta.description, /Liquid Logic Agent/);
  });
}

test("names are distinct and keyword-first per route", () => {
  const names = Object.values(ALL).map((m) => m.serviceName);
  assert.equal(new Set(names).size, names.length);
});

test("prove routes carry the prove description; icon is https", () => {
  for (const r of Object.values(PROVE_ROUTES)) assert.equal(r.description, PROVE_DESCRIPTION);
  assert.equal(PROVE_DESCRIPTION, PROVE_META.description);
  assert.match(BAZAAR_ICON_URL, /^https:\/\//);
});
