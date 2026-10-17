/**
 * Strict hand-written validation for /api/leak-check input (no deps, linear time).
 * Error messages are built ONLY from our own field paths and fixed text. They never
 * contain any submitted value or key, so a 400 cannot echo input.
 */
export const MAX_BODY_BYTES = 32 * 1024;
export const VISIBILITIES = ["private", "named", "workspace", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const AUDIENCES = ["private", "named", "workspace", "public"] as const;
export type Audience = (typeof AUDIENCES)[number];

export type Connection = { provider: string; kind: string; displayName: string; visibility: Visibility; id?: string };
export type PolicyRule = { class: string; destination?: string; audience: Audience };
export type LeakCheckInput = {
  agent: { name: string; readsData: string[] };
  connections: Connection[];
  instructions: string[];
  policy: {
    present: boolean;
    defaultAction?: "allow" | "deny";
    rules?: PolicyRule[];
    limits?: { maxBytesPerSend?: number; maxSendsPerDay?: number };
    approval?: { required: boolean; forAudiences?: Audience[] };
  } | null;
  tools: { name: string; canSend: boolean; egressGated?: boolean }[];
};

export type ValidationResult = { ok: true; value: LeakCheckInput } | { ok: false; code: string; error: string };

const LIM = { name: 80, label: 64, text: 500, conns: 50, instr: 50, rules: 100, tools: 50, reads: 20 };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const fail = (code: string, error: string): { ok: false; code: string; error: string } => ({ ok: false, code, error });

function onlyKeys(o: Obj, allowed: readonly string[], path: string): string | null {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) return `${path}: contains a field that is not part of the schema`;
  return null;
}
function str(v: unknown, max: number): v is string {
  return typeof v === "string" && v.length >= 1 && v.length <= max;
}

export function validateLeakCheckInput(raw: unknown): ValidationResult {
  const bad = (m: string) => fail("BAD_INPUT", m);
  if (!isObj(raw)) return bad("Body must be a JSON object.");
  let e = onlyKeys(raw, ["agent", "connections", "instructions", "policy", "tools"], "input");
  if (e) return bad(e);

  const a = raw.agent;
  if (!isObj(a)) return bad("agent: required object { name, readsData }.");
  e = onlyKeys(a, ["name", "readsData"], "agent");
  if (e) return bad(e);
  if (!str(a.name, LIM.name)) return bad(`agent.name: required string, 1-${LIM.name} chars.`);
  if (!Array.isArray(a.readsData) || a.readsData.length > LIM.reads) return bad(`agent.readsData: required array of at most ${LIM.reads} data-class labels.`);
  for (const c of a.readsData) if (!str(c, LIM.label)) return bad(`agent.readsData: each entry must be a label string, 1-${LIM.label} chars.`);

  const connsRaw = raw.connections ?? [];
  if (!Array.isArray(connsRaw) || connsRaw.length > LIM.conns) return bad(`connections: array of at most ${LIM.conns}.`);
  const connections: Connection[] = [];
  for (let i = 0; i < connsRaw.length; i++) {
    const c = connsRaw[i];
    const p = `connections[${i}]`;
    if (!isObj(c)) return bad(`${p}: must be an object.`);
    e = onlyKeys(c, ["provider", "kind", "displayName", "visibility", "id"], p);
    if (e) return bad(e);
    if (!str(c.provider, LIM.label) || !str(c.kind, LIM.label) || !str(c.displayName, LIM.label)) return bad(`${p}: provider, kind and displayName are required strings, 1-${LIM.label} chars.`);
    if (!VISIBILITIES.includes(c.visibility as Visibility)) return bad(`${p}.visibility: must be one of ${VISIBILITIES.join(", ")}.`);
    if (c.id !== undefined && !str(c.id, 128)) return bad(`${p}.id: optional canonical id string, 1-128 chars.`);
    connections.push({ provider: c.provider, kind: c.kind, displayName: c.displayName, visibility: c.visibility as Visibility, ...(c.id !== undefined && { id: c.id as string }) });
  }

  const instrRaw = raw.instructions ?? [];
  if (!Array.isArray(instrRaw) || instrRaw.length > LIM.instr) return bad(`instructions: array of at most ${LIM.instr} strings.`);
  for (const t of instrRaw) if (!str(t, LIM.text)) return bad(`instructions: each entry must be a string, 1-${LIM.text} chars.`);

  let policy: LeakCheckInput["policy"] = null;
  if (raw.policy !== undefined && raw.policy !== null) {
    const pol = raw.policy;
    if (!isObj(pol)) return bad("policy: must be an object or null.");
    e = onlyKeys(pol, ["present", "defaultAction", "rules", "limits", "approval"], "policy");
    if (e) return bad(e);
    if (typeof pol.present !== "boolean") return bad("policy.present: required boolean.");
    if (pol.defaultAction !== undefined && pol.defaultAction !== "allow" && pol.defaultAction !== "deny") return bad('policy.defaultAction: must be "allow" or "deny".');
    const rulesRaw = pol.rules ?? [];
    if (!Array.isArray(rulesRaw) || rulesRaw.length > LIM.rules) return bad(`policy.rules: array of at most ${LIM.rules}.`);
    const rules: PolicyRule[] = [];
    for (let i = 0; i < rulesRaw.length; i++) {
      const r = rulesRaw[i];
      const p = `policy.rules[${i}]`;
      if (!isObj(r)) return bad(`${p}: must be an object.`);
      e = onlyKeys(r, ["class", "destination", "audience"], p);
      if (e) return bad(e);
      if (!str(r.class, LIM.label)) return bad(`${p}.class: required data-class label (or "*").`);
      if (r.destination !== undefined && !str(r.destination, LIM.label)) return bad(`${p}.destination: optional string, 1-${LIM.label} chars.`);
      if (!AUDIENCES.includes(r.audience as Audience)) return bad(`${p}.audience: must be one of ${AUDIENCES.join(", ")}.`);
      rules.push({ class: r.class, audience: r.audience as Audience, ...(r.destination !== undefined && { destination: r.destination as string }) });
    }
    let limits: NonNullable<LeakCheckInput["policy"]>["limits"];
    if (pol.limits !== undefined) {
      if (!isObj(pol.limits)) return bad("policy.limits: must be an object.");
      e = onlyKeys(pol.limits, ["maxBytesPerSend", "maxSendsPerDay"], "policy.limits");
      if (e) return bad(e);
      for (const k of ["maxBytesPerSend", "maxSendsPerDay"] as const) {
        const v = pol.limits[k];
        if (v !== undefined && !(typeof v === "number" && Number.isFinite(v) && v >= 0)) return bad(`policy.limits.${k}: must be a non-negative number.`);
      }
      limits = pol.limits as { maxBytesPerSend?: number; maxSendsPerDay?: number };
    }
    let approval: NonNullable<LeakCheckInput["policy"]>["approval"];
    if (pol.approval !== undefined) {
      if (!isObj(pol.approval)) return bad("policy.approval: must be an object.");
      e = onlyKeys(pol.approval, ["required", "forAudiences"], "policy.approval");
      if (e) return bad(e);
      if (typeof pol.approval.required !== "boolean") return bad("policy.approval.required: boolean.");
      const fa = pol.approval.forAudiences;
      if (fa !== undefined && (!Array.isArray(fa) || fa.length > 4 || fa.some((x) => !AUDIENCES.includes(x as Audience)))) return bad(`policy.approval.forAudiences: array of ${AUDIENCES.join(", ")}.`);
      approval = { required: pol.approval.required, ...(fa !== undefined && { forAudiences: fa as Audience[] }) };
    }
    policy = {
      present: pol.present,
      ...(pol.defaultAction !== undefined && { defaultAction: pol.defaultAction as "allow" | "deny" }),
      rules,
      ...(limits && { limits }),
      ...(approval && { approval }),
    };
  }

  const toolsRaw = raw.tools ?? [];
  if (!Array.isArray(toolsRaw) || toolsRaw.length > LIM.tools) return bad(`tools: array of at most ${LIM.tools}.`);
  const tools: LeakCheckInput["tools"] = [];
  for (let i = 0; i < toolsRaw.length; i++) {
    const t = toolsRaw[i];
    const p = `tools[${i}]`;
    if (!isObj(t)) return bad(`${p}: must be an object.`);
    e = onlyKeys(t, ["name", "canSend", "egressGated"], p);
    if (e) return bad(e);
    if (!str(t.name, LIM.label)) return bad(`${p}.name: required string, 1-${LIM.label} chars.`);
    if (typeof t.canSend !== "boolean") return bad(`${p}.canSend: required boolean.`);
    if (t.egressGated !== undefined && typeof t.egressGated !== "boolean") return bad(`${p}.egressGated: boolean.`);
    tools.push({ name: t.name, canSend: t.canSend, ...(t.egressGated !== undefined && { egressGated: t.egressGated }) });
  }

  return { ok: true, value: { agent: { name: a.name, readsData: a.readsData as string[] }, connections, instructions: instrRaw as string[], policy, tools } };
}
