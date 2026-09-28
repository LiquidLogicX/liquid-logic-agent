# Audit (`apps/audit`)

Vercel / Next.js App Router service exposing **x402-paid** endpoints on Base
(`eip155:8453`) via Coinbase CDP (`createX402Server`):

| Route | Price | When to call |
|-------|-------|----------------|
| `GET/POST /api/audit` | `$0.05` USDC | Full spend summary (where USDC went) |
| `GET/POST /api/allowance` | `$0.001` USDC | **Before spending** — can this wallet pay that endpoint, and what’s left under the daily cap? |
| `GET/POST /api/prove` | `$0.02` USDC | Settlement receipt: Base USDC tx hash in, proof on Arc + public verify link out |

## Input / output

**Audit**

- Input: `?wallet=0x…` or JSON `{ "wallet": "0x…" }`
- Output: structured spend summary from the public ledger (where USDC went)

**Allowance pre-flight**

- Input: `?wallet=0x…` and optional `?endpoint=https://…`
- Output: `{ allowed, reason, remainingUsdc, capUsdc, spentUsdc, … }` from published treasurer policy + public ledger (UTC calendar day). Same allowlist / max-per-payment / daily-cap rules as `apps/treasurer` pay().
- Omit `endpoint` for wallet-level remaining + allowlist summary.

**Prove**

- Input: `?txHash=0x…&memo=…` or JSON `{ "txHash": "0x…", "memo": "…" }` (memo optional, ≤64 printable ASCII)
- Output: `{ proofId, status: "recorded"|"existing", source{…}, arc{chain, contract, txHash}, verifyUrl, recordedAt, refId, memo }`
- Only charged on 200. 400 (bad/non-USDC/wrong-chain tx), 403 (payer not from/to), 503 (recorder/Arc/gas) are free:
  the x402 wrapper verifies first, runs the handler, and only settles when it returns < 400.
- Records via `arc-settlement-recorder` (`POST /v1/proofs`, `GET /v1/proofs/lookup`, `GET /health`) server-to-server; never signs on Arc.
- Base only (not the Arc dual rail, which settles before the handler).
- Tests: `npm run check-prove -w @liquid-logic/audit` (mocked facilitator, Base RPC, recorder). Live checks: `docs/prove-runbook.md`.

## Env

See root `.env.example`: `CDP_*`, `AUDIT_PAY_TO_EVM`, optional `LEDGER_PUBLIC_DIR`.

`/api/prove`: `RECORDER_API_KEY` (required), optional `RECORDER_URL` (default `https://arc-settlement-recorder.onrender.com`, must be https), `BASE_RPC_URL` (default `https://mainnet.base.org`), `RECORDER_MIN_GAS_WEI` (default 0.05 native USDC, 18-dec).

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


## Arc x402 rail (optional)

Set `ENABLE_X402_ARC=1` to advertise a second v2 accept for USDC on Arc (`eip155:5042`) via Circle Gateway (`GatewayWalletBatched`). Default **off** — Base CDP path and 402 shape stay unchanged. Arc payTo defaults to `0xe9bf3457f1e59ffa507141e64e8eb259f966c2c2` (`ARC_PAY_TO_EVM`). See `acceptance/DRY_RUN_ARC.md`.
