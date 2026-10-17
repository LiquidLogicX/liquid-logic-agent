/**
 * Deterministic leak-check rules (v1). Pure functions: no I/O, no clock, no randomness,
 * no LLM, no network. Same input gives the same output, in a stable order.
 */
import type { Audience, LeakCheckInput } from "./schema";

export const LEAK_CHECK_VERSION = "leak-check/1";
export const LEAK_CHECK_LIMITS = "Static review of what you submitted. Not a guarantee, certification or audit.";

export type Severity = "high" | "medium" | "low";
export type Finding = { id: string; severity: Severity; evidence: string[]; why: string; fix: string };
export type LeakCheckReport = {
  score: null;
  findings: Finding[];
  checksRun: number;
  checksPassed: number;
  limits: string;
  version: string;
};

/** Finding ids in check order. The 9 checks; check 4 can raise either of two ids. */
export const CHECK_ORDER = [
  "AMBIGUOUS_DESTINATION",
  "NAME_BASED_INSTRUCTION",
  "MIXED_DOMAINS",
  "NO_POLICY", // or DEFAULT_ALLOW
  "NO_AUDIENCE_RULES",
  "BROAD_AUDIENCE",
  "UNGATED_SEND_TOOL",
  "NO_LIMITS",
  "NO_APPROVAL_PATH",
] as const;
const CHECK_OF: Record<string, number> = { DEFAULT_ALLOW: 3 };
CHECK_ORDER.forEach((id, i) => (CHECK_OF[id] = i));

const SENSITIVE_HEADS = new Set(["finance", "health", "legal", "hr", "pii", "personal", "customer", "credentials", "secrets"]);
const PERSONAL_HEADS = new Set(["personal", "health", "pii"]);
const HIGH_AUDIENCES: readonly Audience[] = ["workspace", "public"];

const head = (cls: string) => cls.trim().toLowerCase().split(/[.:/]/)[0];
export const isSensitiveClass = (cls: string) => cls.trim() === "*" || SENSITIVE_HEADS.has(head(cls));
export const isPersonalClass = (cls: string) => {
  const l = cls.trim().toLowerCase();
  return PERSONAL_HEADS.has(head(l)) || l.split(/[.:/]/).includes("personal");
};

/** Lowercase, drop a leading #/@, turn every non-alphanumeric run into one "-". */
export function normName(s: string): string {
  return s.toLowerCase().replace(/^[#@]+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const squash = (s: string) => normName(s).replace(/-/g, "");

export function runLeakCheck(input: LeakCheckInput): LeakCheckReport {
  const out: Finding[] = [];
  const { agent, connections, instructions, policy, tools } = input;
  const senders = tools.map((t, i) => ({ t, i })).filter((x) => x.t.canSend);
  const sensitiveReads = agent.readsData.map((c, i) => ({ c, i })).filter((x) => isSensitiveClass(x.c));
  const rules = policy?.rules ?? [];

  // 1. AMBIGUOUS_DESTINATION: same or near-same display name on two or more connections.
  const groups = new Map<string, number[]>();
  connections.forEach((c, i) => {
    const k = squash(c.displayName);
    if (k) groups.set(k, [...(groups.get(k) ?? []), i]);
  });
  const ambiguousNames = new Set<string>();
  for (const [k, idx] of groups) {
    if (idx.length < 2) continue;
    ambiguousNames.add(k);
    const name = normName(connections[idx[0]].displayName);
    const mentions = instructions.map((t, i) => ({ t, i })).filter((x) => squash(x.t).includes(k)).map((x) => `instructions[${x.i}]`);
    out.push({
      id: "AMBIGUOUS_DESTINATION",
      severity: "high",
      evidence: [...idx.map((i) => `connections[${i}]`), ...mentions],
      why: `Display name '${name}' matches ${idx.length} destinations${mentions.length ? "; an instruction refers to it by name" : ""}. An agent that resolves by name can pick the wrong one.`,
      fix: "Resolve every destination to a canonical id and deny the send when a name matches more than one.",
    });
  }

  // 2. NAME_BASED_INSTRUCTION: an instruction targets a destination by display name and carries no canonical id.
  const idsOf = connections.map((c) => (c.id ? c.id.toLowerCase() : null));
  const nameHits: string[] = [];
  instructions.forEach((t, i) => {
    const padded = `-${normName(t)}-`;
    const lower = t.toLowerCase();
    const byName = connections.some((c, ci) => {
      const n = normName(c.displayName);
      return n.length >= 3 && padded.includes(`-${n}-`) && !(idsOf[ci] && lower.includes(idsOf[ci]!));
    });
    if (byName) nameHits.push(`instructions[${i}]`);
  });
  if (nameHits.length) {
    out.push({
      id: "NAME_BASED_INSTRUCTION",
      severity: "medium",
      evidence: nameHits,
      why: "An instruction names a destination by display name instead of a canonical id.",
      fix: "Store instructions against destination ids, not names, and resolve ids before any send.",
    });
  }

  // 3. MIXED_DOMAINS: a personal-class reader that can reach workspace/public destinations.
  const personal = agent.readsData.map((c, i) => ({ c, i })).filter((x) => isPersonalClass(x.c));
  const workConns = connections.map((c, i) => ({ c, i })).filter((x) => HIGH_AUDIENCES.includes(x.c.visibility as Audience));
  if (personal.length && workConns.length) {
    out.push({
      id: "MIXED_DOMAINS",
      severity: "high",
      evidence: [...personal.map((x) => `agent.readsData[${x.i}]`), ...workConns.map((x) => `connections[${x.i}]`)],
      why: "The agent reads personal-class data and is connected to destinations visible to a workspace or the public.",
      fix: "Separate personal and work agents or connections, or add class-to-audience rules that deny personal data to work destinations.",
    });
  }

  // 4. NO_POLICY / DEFAULT_ALLOW
  if (!policy || !policy.present) {
    out.push({
      id: "NO_POLICY",
      severity: "high",
      evidence: ["policy"],
      why: "No egress policy is present, so nothing outside the model decides what may be sent where.",
      fix: "Add a default-deny policy enforced outside the agent, with explicit class-to-destination rules.",
    });
  } else if (policy.defaultAction !== "deny") {
    out.push({
      id: "DEFAULT_ALLOW",
      severity: "high",
      evidence: ["policy.defaultAction"],
      why: "The policy default is allow (or unset), so anything not listed is permitted.",
      fix: "Set the default action to deny and allow only listed class-to-destination pairs.",
    });
  }

  // 5. NO_AUDIENCE_RULES
  if (senders.length && rules.length === 0) {
    out.push({
      id: "NO_AUDIENCE_RULES",
      severity: "high",
      evidence: senders.map((x) => `tools[${x.i}]`),
      why: "The agent has send-capable tools but no rules mapping data classes to allowed audiences.",
      fix: "Define which data classes may go to which audience, and deny everything else.",
    });
  }

  // 6. BROAD_AUDIENCE
  const broad = rules.map((r, i) => ({ r, i })).filter((x) => HIGH_AUDIENCES.includes(x.r.audience) && isSensitiveClass(x.r.class));
  if (broad.length) {
    out.push({
      id: "BROAD_AUDIENCE",
      severity: "high",
      evidence: broad.map((x) => `policy.rules[${x.i}]`),
      why: "A rule allows a sensitive data class (or every class) to a workspace-wide or public audience.",
      fix: "Narrow the audience to named recipients, or require approval for workspace and public sends of sensitive data.",
    });
  }

  // 7. UNGATED_SEND_TOOL
  const ungated = senders.filter((x) => x.t.egressGated !== true);
  if (ungated.length) {
    out.push({
      id: "UNGATED_SEND_TOOL",
      severity: "high",
      evidence: ungated.map((x) => `tools[${x.i}]`),
      why: "A send-capable tool is not marked as sitting behind an egress gate, so the agent can call it directly.",
      fix: "Route every send through a gate that checks the policy before the message leaves.",
    });
  }

  // 8. NO_LIMITS
  const lim = policy?.limits;
  const hasLimit = !!lim && ((lim.maxBytesPerSend ?? 0) > 0 || (lim.maxSendsPerDay ?? 0) > 0);
  if (senders.length && !hasLimit) {
    out.push({
      id: "NO_LIMITS",
      severity: "medium",
      evidence: ["policy.limits"],
      why: "No byte or daily send limits are set, so one mistake can leak a lot at once.",
      fix: "Set a maximum bytes per send and a maximum sends per day.",
    });
  }

  // 9. NO_APPROVAL_PATH
  const ap = policy?.approval;
  const approvalCoversHigh = !!ap?.required && (!ap.forAudiences || HIGH_AUDIENCES.every((a) => ap.forAudiences!.includes(a)));
  if (senders.length && sensitiveReads.length && !approvalCoversHigh) {
    out.push({
      id: "NO_APPROVAL_PATH",
      severity: "medium",
      evidence: ["policy.approval"],
      why: "Sensitive data can be sent but no human approval is required for workspace or public audiences.",
      fix: "Require explicit human approval for workspace and public sends of sensitive classes.",
    });
  }

  // Stable order: check order, then the order produced above (already evidence order).
  const findings = out
    .map((f, n) => ({ f, n }))
    .sort((a, b) => CHECK_OF[a.f.id] - CHECK_OF[b.f.id] || a.n - b.n)
    .map((x) => x.f);
  const failed = new Set(findings.map((f) => CHECK_OF[f.id]));
  return {
    score: null,
    findings,
    checksRun: CHECK_ORDER.length,
    checksPassed: CHECK_ORDER.length - failed.size,
    limits: LEAK_CHECK_LIMITS,
    version: LEAK_CHECK_VERSION,
  };
}
