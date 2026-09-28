# Arc x402 dry-run notes (no invented tx hashes)

Date: 2026-09-20 (PT)

## Verified live

- `GET https://gateway-api.circle.com/v1/x402/supported` → HTTP 200
- Arc kind present: `network=eip155:5042`, `scheme=exact`, `x402Version=2`,
  `extra.name=GatewayWalletBatched`, `verifyingContract=0x77777777dcc4d5a8b6e418fd04d8997ef11000ee`,
  USDC `0x3600000000000000000000000000000000000000` decimals 6
- Snapshot: `circle-supported-arc.json`

## Code dry-run

- `ENABLE_X402_ARC` unset/off → dual-rail wrapper delegates to CDP `withX402FromHTTPServer` unchanged
- Flag on → append Arc accept after Base; v1 untouched; Base accept object unchanged
- `npm run check-arc` covers flag parity, dual accepts, ledger network backfill, explorer branching, live kind

## Paid calls — blocked pending Miles

| Step | Need | Status |
|------|------|--------|
| Arc testnet paid call | Testnet payer + USDC + client for GatewayWalletBatched | **BLOCKED** — no Arc payer key/funds in this environment |
| Arc mainnet `$0.05` | Funded Arc USDC at payer; `ENABLE_X402_ARC=1` on deployed audit; payTo `0xe9bf…c2c2` | **BLOCKED** |
| Ledger artifact | Real tx hash written to `data/ledger.jsonl` with `network: eip155:5042` + Arc explorer URL | **BLOCKED** until paid settle |

Provide: Arc-capable payer private key or CDP/OKX wallet with Arc USDC, confirm payTo wallet control, set `ENABLE_X402_ARC=1` on Vercel audit project.
