/** Request parsing + response codes for /api/lock-status (no x402 here; see route.ts). */
import { buildLockStatus, type Reader } from "./core";
import { resolveChain, XLOCK_CHAINS, type XLockChain } from "./chains";

export type LockStatusDeps = { readerFor?: (c: XLockChain) => Reader; now?: Date };

const ADDR = /^0x[0-9a-fA-F]{40}$/;

export async function handleLockStatusInput(
  input: { token?: unknown; chain?: unknown },
  deps: LockStatusDeps = {},
): Promise<{ status: number; body: unknown }> {
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!ADDR.test(token)) {
    return { status: 400, body: { error: 'Provide token as ?token=0x… (optional &chain=base) or JSON { "token": "0x…", "chain": "base" }', code: "BAD_TOKEN" } };
  }
  let chains = XLOCK_CHAINS;
  if (typeof input.chain === "string" && input.chain.trim() && input.chain.trim().toLowerCase() !== "all") {
    const c = resolveChain(input.chain);
    if (!c) {
      return { status: 400, body: { error: `Unknown chain "${input.chain}". Use one of: ${XLOCK_CHAINS.map((x) => x.key).join(", ")}`, code: "BAD_CHAIN" } };
    }
    chains = [c];
  }
  const report = await buildLockStatus({ token: token as `0x${string}`, chains, readerFor: deps.readerFor, now: deps.now });
  // Every chain failed: answer is unknown, so 503 (x402 does not settle >= 400, caller is not charged).
  if (report.chainsChecked.length === 0) {
    return { status: 503, body: { ...report, error: "All chain RPC reads failed; not charged. Retry shortly.", code: "RPC_UNAVAILABLE" } };
  }
  return { status: 200, body: report };
}
