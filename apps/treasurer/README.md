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


## Operator freeze (takeover step 2)

Halts **all** outbound treasurer payments (any amount). Service keeps running (ledger sync, health). Auth is principal-only bearer — **not** x402.

Freeze state is derived from the append-only ledger: last `frozen` without a later `unfrozen` ⇒ frozen (honored across restarts). `pay()` checks this before sending.

```bash
# Token from env only — never commit or paste the value into logs/PRs.
# On the Render instance (SSH / Shell). Background workers have no public URL.
export TREASURER_URL=http://127.0.0.1:${PORT:-10000}

curl -sS -X POST "$TREASURER_URL/api/freeze" \
  -H "Authorization: Bearer $LLX_OPERATOR_TOKEN"

curl -sS -X POST "$TREASURER_URL/api/unfreeze" \
  -H "Authorization: Bearer $LLX_OPERATOR_TOKEN"

curl -sS "$TREASURER_URL/healthz"
```

Missing or wrong token → `401` / `403` (fail closed). Ledger events: `{ "type": "frozen", "timestamp": "..." }` and `{ "type": "unfrozen", "timestamp": "..." }`.

## Deploy (Render)

- Blueprint: `apps/treasurer/render.yaml`
- Account: `hello@liquidlogicx.com`
- Plan: **Starter**
- Build context: monorepo root (Docker)
- Do not deploy until CDP secrets are set (see root `BLOCKERS.md`)
