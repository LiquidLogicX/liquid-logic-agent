# Blockers for live acceptance

Scaffold is complete and pushed. The following are required before real Base payments and a paid audit call can pass acceptance.

## Missing credentials / access

| Item | Owner / where | Status |
|------|----------------|--------|
| `CDP_API_KEY_ID` | Coinbase CDP Portal | **BLOCKED** — not provisioned in this environment |
| `CDP_API_KEY_SECRET` | Coinbase CDP Portal | **BLOCKED** |
| `CDP_WALLET_SECRET` | Coinbase CDP Portal (wallet secret) | **BLOCKED** |
| Render login for `hello@liquidlogicx.com` | Render dashboard | **BLOCKED** — do not deploy without auth |
| Vercel team / project for LLX | Vercel Hobby + custom domains | **BLOCKED** — do not deploy without auth |
| Base mainnet USDC funding of treasurer wallet | Fund address from `print-wallet-address` | **BLOCKED** — wallet not created until CDP keys exist |
| `AUDIT_PAY_TO_EVM` receiver address | CDP receiver or known Base address | **BLOCKED** |

## Acceptance criteria (cannot run until blockers clear)

1. **Real Base pay**: `npm run treasurer -- pay <allowlisted-url>` settles USDC on Base mainnet; tx hash appears in JSONL and BaseScan.
2. **Paid audit call**: Client pays `$0.05` USDC via x402 to `POST/GET /api/audit` and receives a structured spend summary.
3. Artifacts: save request/response + BaseScan links under `apps/audit/acceptance/`.

## Deploy steps (when auth is available)

### Treasurer → Render (Docker, Starter)

1. Log in as `hello@liquidlogicx.com`.
2. Create Blueprint from `apps/treasurer/render.yaml` (or connect this repo).
3. Set env vars from `.env.example` (CDP + allowlist + caps). Use **Starter** instance.
4. After deploy: run one-off `print-wallet-address`, fund with Base USDC, then `set-allowance` / `top-up` as needed.

### Audit + Web → Vercel Hobby

1. Import `apps/audit` and `apps/web` as two Vercel projects (or monorepo roots).
2. Set env vars; attach domains `liquidlogicx.com` (web) and e.g. `audit.liquidlogicx.com` (audit).
3. Point DNS; confirm `/api/audit` returns `402` without payment and settles with payment.

### Ledger publisher

1. Ensure `data/ledger.jsonl` is available to the publisher (volume, S3, or CI artifact).
2. Enable `ops/github-workflows/publish-ledger.yml` or cron on Render.
3. Commit/publish `public/ledger/*` and leave `drafts/social/*` for humans (never auto-post).

## GitHub Actions workflow scope

The OAuth token used to push this scaffold lacks the `workflow` scope, so
`ops/github-workflows/publish-ledger.yml` was **not** installed under
`.github/workflows/`. To enable the ledger publisher Action:

1. Copy `ops/github-workflows/publish-ledger.yml` → `.github/workflows/publish-ledger.yml`
2. Push with a token that has the `workflow` scope (or use the GitHub UI to create the workflow)
3. Set repository secret `AGENT_WALLET_ADDRESS`
