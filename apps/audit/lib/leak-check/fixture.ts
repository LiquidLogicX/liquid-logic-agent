/** Canonical example input for Bazaar discovery. Identical to scripts/fixtures/leak-check/lc-ambiguous.json (a test enforces it). */
import type { LeakCheckInput } from "./schema";

export const LEAK_CHECK_EXAMPLE_INPUT: LeakCheckInput = {
  agent: { name: "cfo-agent", readsData: ["finance.personal"] },
  connections: [
    { provider: "slack", kind: "channel", displayName: "exec-team", visibility: "workspace" },
    { provider: "chat", kind: "group", displayName: "exec-team", visibility: "named" },
  ],
  instructions: ["Update Exec team every Monday"],
  policy: { present: true, defaultAction: "allow", rules: [] },
  tools: [{ name: "send_message", canSend: true }],
};
