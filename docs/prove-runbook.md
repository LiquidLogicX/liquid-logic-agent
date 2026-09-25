# /api/prove — live runbook (checks 2, 3, 4, 8)

Checks 1, 5, 6, 7 are automated and free (`npm run check-prove -w @liquid-logic/audit`).
These four need one real run. Total cost: **2 × $0.02 USDC** plus a little Arc gas on the recorder.

## Before you start (one time)

1. Merge + deploy the recorder PR (settlement-proofs-arc) **first**. Check:
   `https://arc-settlement-recorder.onrender.com/health` → shows `"lowGas": false`.
2. In Vercel (audit project) set `RECORDER_API_KEY` = same value as the recorder's `RECORDER_API_KEY` on Render.
   Optional: `RECORDER_URL` (default is the Render URL), `BASE_RPC_URL`.
3. Merge + deploy the `/api/prove` PR.
4. Quick smoke test (free): open `https://audit.liquidlogicx.com/api/prove` → HTTP 402.

## Check 2 — paid call returns 200, new proofId, Arc tx

Run this on a machine that has the repo and the treasurer CDP keys (a laptop or the Render Shell):

```bash
export AUDIT_URL=https://audit.liquidlogicx.com
export CDP_API_KEY_ID=… CDP_API_KEY_SECRET=… CDP_WALLET_SECRET=…
export PROVE_TX_HASH=0x5ae8ef780242dfd2f03a9f52a58fcec71a45e6aae6eb4b3a96107698c92411ea
export PROVE_MEMO="runbook check 2"
npm run paid-prove -w @liquid-logic/audit
```

(`0x5ae8…11ea` is a real 0.05 USDC payment from the treasurer 0xEA24… to payTo 0x1479…. It has no proof yet, so the treasurer counts as a party.)

Pass if you get **HTTP 200**, `"status":"recorded"`, `proofId` = 2 (or higher), and `arc.txHash` is set.
Tap `https://explorer.arc.io/tx/<arc.txHash>` → Success.

## Check 3 — verifyUrl shows Found

Open the `verifyUrl` from check 2 (`https://proofs.liquidlogicx.com/proofs?q=0x…`).
Pass if the page loads and shows **Found** with the 0.05 USDC amount and your memo.

## Check 4 — same txHash again returns existing, no new Arc write

Run the same command again (same `PROVE_TX_HASH`).
Pass if you get HTTP 200, `"status":"existing"`, the **same** `proofId` and `arc.txHash` as check 2,
and the registry count on `https://proofs.liquidlogicx.com/proofs` has not gone up.
(This call still costs $0.02, because it returns a proof.)

## Check 8 — payment is in the ledger and on the public page

Needs the ledger fix PR (chain-sync) merged, and its proposed workflow copied into `.github/workflows/`.

1. Each run prints `settlement tx: 0x…`. Write both down.
2. GitHub → **Actions → Publish ledger → Run workflow**. It pulls every Base USDC payment to payTo into
   `data/ledger.jsonl` (endpoint `…/api/prove`, amount `0.02`). `main` is protected, so the run opens a PR
   called **"chore(ledger): publish ledger (automated)"**, or shows a compare link if Actions can't open PRs. Merge it.
3. Pass if both settlement tx hashes are in `data/ledger.jsonl` on main and in
   `https://liquidlogicx.com/ledger/latest.json` (`recentPayments`), after the site redeploys.

## If something fails

- **503 LOW_GAS_BALANCE**: top up the recorder wallet on Arc (address is in `/health`). You were not charged.
- **503 RECORDER_***: check the recorder on Render and `RECORDER_API_KEY` in Vercel. You were not charged.
- **400 TX_NOT_CONFIRMED**: wait about 30s and retry. You were not charged.
