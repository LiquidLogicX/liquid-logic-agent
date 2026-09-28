# GitHub workflow templates

Copy `publish-ledger.yml` into `.github/workflows/` using a credential with the
`workflow` OAuth scope (the default `gh` login used for this scaffold did not
have it).

## 2026-09-24: ledger chain-sync + protected main

`publish-ledger.yml` here is the **proposed** replacement for
`.github/workflows/publish-ledger.yml` (the LiquidLogicX `gh` token has no
`workflow` scope, so the PR could not change the live file). It:

1. runs `npm run chain-sync-ledger` before publishing (payTo receipts from Base),
2. skips timestamp-only commits,
3. stops hiding push failures (`git push || true`): main is protected, so on
   rejection it pushes `automation/ledger-publish` and opens a PR (or fails red
   with a compare link if Actions may not open PRs).

Apply: `cp ops/github-workflows/publish-ledger.yml .github/workflows/` with a
credential that has the `workflow` scope (e.g. `gh auth refresh -s workflow`),
or paste it in the GitHub web editor.
