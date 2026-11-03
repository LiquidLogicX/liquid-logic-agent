/**
 * Read-only live smoke test: calls the lock-status core directly against public
 * RPCs on all 11 chains. No x402, no payment, no signing.
 *   LOCK_TOKEN=0x… npm run check-lock-status-live -w @liquid-logic/audit
 * Defaults to $LLX V2.
 */
import { buildLockStatus } from "../lib/lock-status/core";

const token = (process.env.LOCK_TOKEN ?? "0x72885fBFA330d1a8fA95880A85b73d699943053B") as `0x${string}`;

(async () => {
  const t0 = Date.now();
  const r = await buildLockStatus({ token });
  console.log(JSON.stringify({ ...r, chains: r.chains.map((c) => ({ chain: c.chain, status: c.status, error: c.error, lockCount: c.lockCount })) }, null, 2));
  console.log(`elapsed ${Date.now() - t0} ms; ok ${r.chainsChecked.length}/10`);
  if (r.chainsChecked.length < 8) process.exitCode = 1;
})();
