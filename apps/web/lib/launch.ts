/**
 * Pure launch-switch helpers — same result on SSR and client when given the same `now`.
 * Cutoff: America/Los_Angeles 2026-09-16 12:40:00 (PDT = UTC-7).
 */
export const LLX_LAUNCH_ISO_PT = "2026-09-16T12:40:00-07:00";

export const LLX_LAUNCH_MS = Date.parse(LLX_LAUNCH_ISO_PT);

export function isLlxLive(now: Date | number = new Date()): boolean {
  const t = typeof now === "number" ? now : now.getTime();
  return t >= LLX_LAUNCH_MS;
}

/** Marketing line for Launch row / copy — never invents price or returns language. */
export function llxLaunchStatus(now: Date | number = new Date()): string {
  if (isLlxLive(now)) {
    return "$LLX is live on Virtuals (Base)";
  }
  return "launches on Virtuals (Base) on September 16, 2026 at 12:40 PM PT";
}
