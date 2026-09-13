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
- Max per payment + cumulative daily cap
- Append-only JSONL ledger

## CLI

```bash
# from repo root (after npm install && npm run build -w @liquid-logic/shared)
export CDP_API_KEY_ID=... CDP_API_KEY_SECRET=... CDP_WALLET_SECRET=...
export TREASURER_ALLOWLIST=https://x402.vercel.app/protected
npm run treasurer -- print-wallet-address
npm run treasurer -- set-allowance --max 1.00 --daily 10.00
npm run treasurer -- top-up 5.00 --tx 0x...
npm run treasurer -- pay https://x402.vercel.app/protected --amount 0.01
npm run treasurer -- revoke
```

## Deploy (Render)

- Blueprint: `apps/treasurer/render.yaml`
- Account: `hello@liquidlogicx.com`
- Plan: **Starter**
- Build context: monorepo root (Docker)
- Do not deploy until CDP secrets are set (see root `BLOCKERS.md`)
