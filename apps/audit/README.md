# Audit (`apps/audit`)

Vercel / Next.js App Router service exposing **x402-paid** endpoints on Base
(`eip155:8453`) via Coinbase CDP (`createX402Server`):

| Route | Price | When to call |
|-------|-------|----------------|
| `GET/POST /api/audit` | `$0.05` USDC | Full spend summary (where USDC went) |
| `GET/POST /api/allowance` | `$0.001` USDC | **Before spending** — can this wallet pay that endpoint, and what’s left under the daily cap? |

## Input / output

**Audit**

- Input: `?wallet=0x…` or JSON `{ "wallet": "0x…" }`
- Output: structured spend summary from the public ledger (where USDC went)

**Allowance pre-flight**

- Input: `?wallet=0x…` and optional `?endpoint=https://…`
- Output: `{ allowed, reason, remainingUsdc, capUsdc, spentUsdc, … }` from published treasurer policy + public ledger (UTC calendar day). Same allowlist / max-per-payment / daily-cap rules as `apps/treasurer` pay().
- Omit `endpoint` for wallet-level remaining + allowlist summary.

## Env

See root `.env.example`: `CDP_*`, `AUDIT_PAY_TO_EVM`, optional `LEDGER_PUBLIC_DIR`.

## Paid client call

```bash
export CDP_API_KEY_ID=... CDP_API_KEY_SECRET=... CDP_WALLET_SECRET=...
export AUDIT_URL=https://audit.liquidlogicx.com
export WALLET_TO_AUDIT=0xYourAgentWallet
npm run paid-call -w @liquid-logic/audit
```

Artifacts land in `acceptance/`. Settled payments append to repo-root `data/ledger.jsonl` (canonical treasurer sync path), not `apps/audit/data/`.

## Ledger source

`/api/audit` unions (1) local `public/ledger` + `data/ledger.jsonl`, (2) the live published ledger at `LEDGER_REMOTE_BASE_URL` (default `https://liquidlogicx.com`), and (3) the current settlement when the header is present. Events are keyed by tx hash so a sparse Render sync cannot wipe history twice.

Bazaar `output.example` for `/api/audit` is derived at module load from local ledger files (`public/ledger` + `data/ledger.jsonl`) via `buildAuditOutputExample()` — not hand-typed counts. For `/api/allowance` see `lib/allowance-output-example.ts`. Check with `npm run check-example` and `npm run check-allowance`.
