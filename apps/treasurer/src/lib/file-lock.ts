/**
 * Cross-process lock for one ledger file.
 *
 * The in-process Base payment lock only serializes a single Node process.
 * The CLI (`ll-treasurer pay`) and the operator HTTP server can both be
 * running and both append to the same TREASURER_LEDGER_PATH. This lock
 * covers that case: `approveHold` and `executePayment` take it for the
 * whole check → reserve → sign → record critical section, so two processes
 * on the **same host** cannot both pay past the cap or both win a hold claim.
 *
 * Mechanism: an exclusive directory created with mkdir(2) beside the ledger
 * (`<ledger>.lock`). mkdir is atomic on a local POSIX filesystem. The owner
 * file records the pid; a dead pid is stolen so a crash does not wedge the
 * ledger forever. The lock is re-entrant for the async context that holds it.
 *
 * Constraint (not solved here): two hosts sharing one ledger — a second
 * machine, NFS, or a copied file — are not safe. mkdir locks are not a
 * distributed lock. Run only one treasurer writer host per ledger file.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";

const WAIT_MS = 180_000;
const POLL_MS = 25;

const holders = new AsyncLocalStorage<Set<string>>();

export function ledgerLockDir(ledgerPath: string): string {
  return `${path.resolve(ledgerPath)}.lock`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Drop a lock whose owner process is gone. Returns true if the dir was removed. */
export function stealDeadLedgerLock(dir: string): boolean {
  let pid = NaN;
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(dir, "owner"), "utf8")) as { pid?: number };
    pid = Number(owner.pid);
  } catch {
    /* missing or torn owner file — treat as abandoned */
  }
  if (Number.isInteger(pid) && pid > 0 && pidAlive(pid)) return false;
  const junk = `${dir}.stale-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    fs.renameSync(dir, junk);
  } catch {
    return false;
  }
  try {
    fs.rmSync(junk, { recursive: true, force: true });
  } catch {
    /* the rename won; leftover junk is not the live lock */
  }
  return true;
}

async function acquire(dir: string): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      fs.mkdirSync(dir);
      fs.writeFileSync(
        path.join(dir, "owner"),
        JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
        "utf8",
      );
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      if (stealDeadLedgerLock(dir)) continue;
      if (Date.now() > deadline) {
        throw new Error(
          `LEDGER_LOCK: timed out waiting for ${dir}. Another treasurer process may be paying, or a live pid still owns the lock.`,
        );
      }
      await sleep(POLL_MS);
    }
  }
}

function release(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* already gone */
  }
}

/**
 * Hold the ledger file lock for `fn`. Re-entrant on the same async call stack
 * (approve → pay) so a holder does not deadlock on itself.
 */
export async function withLedgerFileLock<T>(ledgerPath: string, fn: () => Promise<T>): Promise<T> {
  const dir = ledgerLockDir(ledgerPath);
  const current = holders.getStore();
  if (current?.has(dir)) return fn();
  await acquire(dir);
  const next = new Set(current);
  next.add(dir);
  try {
    return await holders.run(next, fn);
  } finally {
    release(dir);
  }
}
