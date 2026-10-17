/** Bazaar discovery for /api/leak-check (POST only: bodies are not logged, URLs are). */
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { LEAK_CHECK_EXAMPLE_INPUT } from "./fixture";
import { LEAK_CHECK_OUTPUT_EXAMPLE } from "./output-example";
import { LEAK_CHECK_META } from "../bazaar-meta";
import { AUDIENCES, VISIBILITIES } from "./schema";

export const LEAK_CHECK_DESCRIPTION = LEAK_CHECK_META.description;

const label = { type: "string", minLength: 1, maxLength: 64 };

export const LEAK_CHECK_INPUT_SCHEMA = {
  properties: {
    agent: {
      type: "object",
      description: "Structure and labels only. Never send keys, tokens, balances or customer data (rejected with a free 400).",
      properties: { name: { type: "string", maxLength: 80 }, readsData: { type: "array", maxItems: 20, items: label, description: "Data-class labels the agent reads, e.g. finance.personal" } },
      required: ["name", "readsData"],
    },
    connections: {
      type: "array", maxItems: 50,
      items: { type: "object", properties: { provider: label, kind: label, displayName: label, visibility: { type: "string", enum: [...VISIBILITIES] }, id: { type: "string", maxLength: 128, description: "Optional canonical destination id" } }, required: ["provider", "kind", "displayName", "visibility"] },
    },
    instructions: { type: "array", maxItems: 50, items: { type: "string", maxLength: 500 } },
    policy: {
      type: ["object", "null"],
      properties: {
        present: { type: "boolean" },
        defaultAction: { type: "string", enum: ["allow", "deny"] },
        rules: { type: "array", maxItems: 100, items: { type: "object", properties: { class: label, destination: label, audience: { type: "string", enum: [...AUDIENCES] } }, required: ["class", "audience"] } },
        limits: { type: "object", properties: { maxBytesPerSend: { type: "number", minimum: 0 }, maxSendsPerDay: { type: "number", minimum: 0 } } },
        approval: { type: "object", properties: { required: { type: "boolean" }, forAudiences: { type: "array", items: { type: "string", enum: [...AUDIENCES] } } }, required: ["required"] },
      },
      required: ["present"],
    },
    tools: { type: "array", maxItems: 50, items: { type: "object", properties: { name: label, canSend: { type: "boolean" }, egressGated: { type: "boolean" } }, required: ["name", "canSend"] } },
  },
  required: ["agent"],
};

export const LEAK_CHECK_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "null", description: "Always null in v1 (no numeric safe score)" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, severity: { type: "string", enum: ["high", "medium", "low"] }, evidence: { type: "array", items: { type: "string" }, description: "JSON pointers into your submitted input" }, why: { type: "string" }, fix: { type: "string" } },
      },
    },
    checksRun: { type: "integer" }, checksPassed: { type: "integer" }, limits: { type: "string" }, version: { type: "string" },
  },
  required: ["score", "findings", "checksRun", "checksPassed", "limits", "version"],
};

export const postLeakCheckDiscovery = declareDiscoveryExtension({
  bodyType: "json",
  input: LEAK_CHECK_EXAMPLE_INPUT,
  inputSchema: LEAK_CHECK_INPUT_SCHEMA,
  output: { example: LEAK_CHECK_OUTPUT_EXAMPLE, schema: LEAK_CHECK_OUTPUT_SCHEMA },
});
