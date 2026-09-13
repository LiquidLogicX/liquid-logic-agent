# Audit (`apps/audit`)

Vercel / Next.js App Router service exposing an **x402-paid** endpoint:

- `GET|POST /api/audit`
- **Price:** `$0.05` USDC
- **Network:** Base `eip155:8453`
- **Facilitator:** Coinbase CDP (`createX402Server`)

## Input / output

- Input: `?wallet=0x…` or JSON `{ "wallet": "0x…" }`
- Output: structured spend summary from the public ledger (where USDC went)

## Env

See root `.env.example`: `CDP_*`, `AUDIT_PAY_TO_EVM`, optional `LEDGER_PUBLIC_DIR`.

## Paid client call

```bash
export CDP_API_KEY_ID=... CDP_API_KEY_SECRET=... CDP_WALLET_SECRET=...
export AUDIT_URL=https://audit.liquidlogicx.com
export WALLET_TO_AUDIT=0xYourAgentWallet
npm run paid-call -w @liquid-logic/audit
```

Artifacts land in `acceptance/`.
