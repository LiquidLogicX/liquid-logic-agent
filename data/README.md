# Runtime ledger

`ledger.jsonl` is append-only operating spend (USDC / x402).

Do not commit secrets. Sample/local lines are fine to wipe before push.
The GitHub Action / publisher reads this file and writes `public/ledger/` + `drafts/social/`.

## Launch genesis (day-one reset)

The committed file is intentionally a **launch truncate**, not a silent edit of
history. Keep only:

1. `wallet_address` for `0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D`
2. `top_up` 5.00 USDC with BaseScan-backed tx `0x86725a…6310`
3. Optional `note` with `message: LAUNCH_GENESIS_RESET` so treasurer sync auto-replaces a longer Render disk from GitHub (no phantom push)

### Preventing phantom resurrection (Render disk)

Treasurer `sync-ledger` **union-merges** disk ↔ GitHub. An old Render disk will
push pre-launch payment/held/denied phantoms back into GitHub after merge.

**Required after merging genesis (prefer this):**

1. Run a Render **one-off job** on `liquid-logic-treasurer-web`:
   ```bash
   TREASURER_LEDGER_PATH=/app/data/ledger.jsonl \
     node apps/treasurer/scripts/write-launch-genesis.mjs
   ```
   (or `npm run cli -w @liquid-logic/treasurer --` equivalent after deploy)
2. Confirm `/app/data/ledger.jsonl` is exactly two genesis lines.
3. Optionally set `LEDGER_LAUNCH_RESET=1` for one sync cycle so sync replaces
   disk from GitHub and **does not** push local extras; then unset it.

Do **not** resume normal union sync with a dirty disk.

## Chain-sync: payments received by payTo (x402 revenue)

`npm run chain-sync-ledger` (also the first step of the Publish ledger workflow)
reads every Base USDC `Transfer` to the x402 payTo
`0x147991A1c25e78f6D9225d2dBA61eD93A6158c7b` over JSON-RPC and appends a
`payment` row for any tx hash not already in this file (existing rows are never
edited). Rows carry `walletAddress` = payer, `payTo`, and an endpoint inferred
from the price (`0.05` → `/api/audit`, `0.001` → `/api/allowance`, `0.02` →
`/api/prove`). `data/chain-sync.json` is the scan cursor (only committed with a
real ledger change).

Why: before this, only LLX's own outgoing payments reached this file (treasurer
disk sync + `paid-*-call` scripts). Payments other agents made to our endpoints
were never recorded, and the genesis reset dropped the Sep 13–14 self-tests, so
`latest.json` showed 1 payment while payTo had 9 on Base.

The treasurer daily cap only counts rows whose `walletAddress` is the treasurer
(or is missing), so other agents' payments never eat into it.

Env: `BASE_RPC_URL` (default `https://mainnet.base.org`, 2,000-block getLogs cap),
`LEDGER_CHAIN_SYNC_CHUNK`, `LEDGER_CHAIN_SYNC_START_BLOCK` (set to the launch
block to leave pre-launch history out), `LEDGER_PAY_TO_EVM`.
