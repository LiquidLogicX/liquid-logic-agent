# Runtime ledger

`ledger.jsonl` is append-only operating spend (USDC / x402).

Do not commit secrets. Sample/local lines are fine to wipe before push.
The GitHub Action / publisher reads this file and writes `public/ledger/` + `drafts/social/`.

## Launch genesis (day-one reset)

The committed file is intentionally a **launch truncate**, not a silent edit of
history. Keep only:

1. `wallet_address` for `0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D`
2. `top_up` 5.00 USDC with BaseScan-backed tx `0x86725a…6310`

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
