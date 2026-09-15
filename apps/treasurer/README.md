# Treasurer (`apps/treasurer`)

Node.js TypeScript service that pays **USDC on Base** to allowlisted **x402** endpoints via CDP Agentic wallet (`CdpX402Client` + `wrapFetchWithPayment`).

## Networks

| Mode | How | Chain |
|------|-----|-------|
| **Production (default)** | Omit `CDP_X402_ENVIRONMENT` | Base mainnet `eip155:8453` |
| Development | `CDP_X402_ENVIRONMENT=development` | Base Sepolia `eip155:84532` |

## Guardrails (enforced in code)

- USDC only — hard fail on swap/buy non-USDC
- Endpoint allowlist (`TREASURER_ALLOWLIST`)
- Max per payment + cumulative daily cap (UTC calendar day from the ledger)
- Append-only JSONL ledger
- Operator freeze (all outbound)
- Hold threshold (`HOLD_ABOVE_USDC`) with mandatory TTL auto-deny
- Same evaluator as public `/api/allowance`: `@liquid-logic/shared` `evaluateAllowance` + `public/policy.json`

## CLI

```bash
# from repo root (after npm install && npm run build -w @liquid-logic/shared)
export CDP_API_KEY_ID=... CDP_API_KEY_SECRET=... CDP_WALLET_SECRET=...
export TREASURER_ALLOWLIST=https://audit.liquidlogicx.com/api/audit,https://x402uselessfacts.vercel.app/api/useless-fact
npm run treasurer -- print-wallet-address
npm run treasurer -- set-allowance --max 1.00 --daily 10.00
npm run treasurer -- top-up 5.00 --tx 0x...
npm run treasurer -- pay https://x402.vercel.app/protected --amount 0.01
npm run treasurer -- record-payment --endpoint https://audit.liquidlogicx.com/api/audit --amount 0.05 --tx 0x...
npm run treasurer -- sync-ledger
npm run treasurer -- revoke
```

`sync-ledger` **unions** the disk JSONL with GitHub `data/ledger.jsonl` (never replaces history).

**Launch reset:** set `LEDGER_LAUNCH_RESET=1` once after a day-one genesis truncate so sync **replaces** the Render disk from GitHub and refuses to push local phantoms. Prefer also running `node apps/treasurer/scripts/write-launch-genesis.mjs` as a Render one-off against `TREASURER_LEDGER_PATH=/app/data/ledger.jsonl`, then unset `LEDGER_LAUNCH_RESET`.

**Payment rows:** `executePayment` / `recordPayment` never append `type=payment` without a non-empty `0x…64` txHash and HTTP 2xx; failures append `payment_failed` instead.

## Operator freeze (takeover step 2)

Halts **all** outbound treasurer payments (any amount). Service keeps running (ledger sync, health, holds). Auth is principal-only bearer — **not** x402.

Freeze state is derived from the append-only ledger: last `frozen` without a later `unfrozen` ⇒ frozen (honored across restarts). `pay()` checks this before sending.

## Hold threshold (takeover step 3)

When `HOLD_ABOVE_USDC` is set, payments with `--amount` at/above that value do **not** pay immediately. The treasurer writes a `held` ledger row (`holdId`, endpoint, amount) and waits for:

| Action | Route | Ledger |
|--------|-------|--------|
| Approve | `POST /api/hold/:id/approve` | executes payment; appends `payment` with `approvedBy` + `holdId` |
| Deny | `POST /api/hold/:id/deny` | appends `denied` |
| Expire | automatic after `HOLD_TTL_SECONDS` (default **3600**) | appends `expired` |

Unset `HOLD_ABOVE_USDC` ⇒ holds disabled (pay as today). TTL auto-deny is **mandatory** — unanswered holds never wait forever. Sweep runs every ~30s in the worker and on operator list/approve/deny.

## Operator HTTP (public HTTPS)

Auth: `Authorization: Bearer $LLX_OPERATOR_TOKEN` (fail closed). **Not** on the x402 rail.

**Architecture (path A):** treasurer is a Render **web** service so a phone can hit HTTPS approve/deny. Background workers have no public URL; hold approve must run on this process (CDP wallet + ledger disk). Path B (Vercel proxy) was rejected for v1 because approve must execute payment with treasurer secrets.

```bash
# Token from env only — never commit or paste the value into logs/PRs.
export TREASURER_URL="${TREASURER_PUBLIC_URL:-http://127.0.0.1:${PORT:-10000}}"

curl -sS "$TREASURER_URL/healthz"

curl -sS "$TREASURER_URL/api/holds" \
  -H "Authorization: Bearer $LLX_OPERATOR_TOKEN"

curl -sS -X POST "$TREASURER_URL/api/hold/\$HOLD_ID/approve" \
  -H "Authorization: Bearer $LLX_OPERATOR_TOKEN"

curl -sS -X POST "$TREASURER_URL/api/hold/\$HOLD_ID/deny" \
  -H "Authorization: Bearer $LLX_OPERATOR_TOKEN"

curl -sS -X POST "$TREASURER_URL/api/freeze" \
  -H "Authorization: Bearer $LLX_OPERATOR_TOKEN"

curl -sS -X POST "$TREASURER_URL/api/unfreeze" \
  -H "Authorization: Bearer $LLX_OPERATOR_TOKEN"
```

Missing or wrong token → `401` / `403`.

## Deploy (Render)

- Blueprint: `apps/treasurer/render.yaml` (`type: web`, `healthCheckPath: /healthz`)
- Account: `hello@liquidlogicx.com`
- Plan: **Starter**
- Build context: monorepo root (Docker)
- Env: `LLX_OPERATOR_TOKEN`, optional `HOLD_ABOVE_USDC`, `HOLD_TTL_SECONDS=3600`
- Do not deploy until CDP secrets are set (see root `BLOCKERS.md`)
