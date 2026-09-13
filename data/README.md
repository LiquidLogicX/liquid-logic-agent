# Runtime ledger

`ledger.jsonl` is append-only operating spend (USDC / x402).

Do not commit secrets. Sample/local lines are fine to wipe before push.
The GitHub Action / publisher reads this file and writes `public/ledger/` + `drafts/social/`.
