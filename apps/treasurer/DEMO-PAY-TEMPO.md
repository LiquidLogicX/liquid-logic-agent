# Demo Pay: Tempo rail on the treasurer

A second rail next to Base, **off by default** (`TREASURER_TEMPO_ENABLED`). It pays
**USDC.e on Tempo mainnet** (chain 4217) from the dedicated **LLX Tempo payer**
wallet to an allowlisted payee, then asks `arc-settlement-recorder` to verify the
transfer on Tempo and write the proof on Tempo. LLX Pay's Pay card drives it.

The Base rail (CDP wallet, x402 allowlist, `TREASURER_*` caps, `HOLD_ABOVE_USDC`)
is unchanged and reads none of the variables below. Base x402 endpoints are untouched.

## Flow

1. **Policy check** — same rules as Base, applied to the Tempo payer:
   freeze → refuse; payee on `TREASURER_TEMPO_ALLOWLIST` (addresses, fail closed);
   amount ≤ `TREASURER_TEMPO_MAX_PER_PAYMENT_USDC`; today's (UTC) Tempo spend +
   amount ≤ `TREASURER_TEMPO_DAILY_CAP_USDC`; amount **at/above**
   `TREASURER_TEMPO_HOLD_ABOVE_USDC` → `held` (approve / deny / TTL expiry, same
   ledger rows and `HOLD_TTL_SECONDS` as Base).
   Defaults: 1.00 pays straight through, 3.00 is held, over 5.00 is refused.
2. **Payment sent on Tempo** — `transferWithMemo` on USDC.e (6 decimals), sent as a
   Tempo transaction with the fee token set explicitly (USDC.e by default, like the
   recorder's `TEMPO_FEE_TOKEN`). Policy and balance (amount + fee reserve) are
   re-checked under a lock right before sending. A `payment` ledger row is written
   only after a successful receipt.
3. **Proof recorded on Tempo** — `POST $RECORDER_URL/v1/tempo/proofs`. The recorder
   re-verifies the TIP-20 Transfer (token allowlisted, to = payee, exact amount)
   before writing. Transient errors are retried; a hard error stops the flow (the
   payment stays real and visible, no proof is invented).
4. **Receipt ready** — the recorder's `verifyUrl` (proofs.liquidlogicx.com,
   `?network=tempo-mainnet`).

Every step is appended to the ledger (`note` / `held` / `payment` rows with
`network: eip155:4217`) and mirrored to the LLX Bridge (topic `demo-pay`) when
`LLX_BRIDGE_TOKEN` is set.

## HTTP (Bearer `TREASURER_SERVICE_TOKEN`)

| Route | |
| --- | --- |
| `GET /api/tempo/config` | public, secret-free rail config for the Pay card |
| `POST /api/tempo/flows` | `{ amountUsdc, memo?, clientRequestId?, requestedBy? }` → flow |
| `GET /api/tempo/flows/:id` | flow status (poll) |
| `POST /api/tempo/flows/:id/approve` / `deny` | answer a held flow |

The operator route `POST /api/hold/:id/approve` (Bearer `LLX_OPERATOR_TOKEN`) also
works for Tempo holds: it dispatches to the Tempo payer, never the Base x402 client.
`GET /healthz` gains a `tempo` block (enabled + public config, or the reason it's off).

## Env vars (service `liquid-logic-treasurer-web`)

Secrets — **Miles pastes these in Render; crew never handles them**:

| Name | Notes |
| --- | --- |
| `TEMPO_PAYER_PRIVATE_KEY` | LLX Tempo payer key. Must derive to `TEMPO_PAYER_ADDRESS` or the rail refuses to start. |
| `TREASURER_SERVICE_TOKEN` | Shared with LLX Pay (same value on Vercel). 24+ random chars. |
| `RECORDER_API_KEY` | Same value as on `arc-settlement-recorder`. |
| `LLX_BRIDGE_TOKEN` | Optional: bridge crew token for the live-view mirror. |

Non-secret:

| Name | Value |
| --- | --- |
| `TREASURER_TEMPO_ENABLED` | `true` to turn the rail on (unset = off) |
| `TEMPO_PAYER_ADDRESS` | `0x9554509ba5ac1b3f7b6382fedac7709179289f6e` |
| `TREASURER_TEMPO_ALLOWLIST` | demo payee address (comma-separated list) |
| `TEMPO_DEMO_PAYEE_ADDRESS` | optional, defaults to the first allowlist entry |
| `TEMPO_DEMO_PAYEE_NAME` | optional, default `LLX demo payee` |
| `TREASURER_TEMPO_MAX_PER_PAYMENT_USDC` | `5.00` (default) |
| `TREASURER_TEMPO_DAILY_CAP_USDC` | `25.00` (default) |
| `TREASURER_TEMPO_HOLD_ABOVE_USDC` | `2.00` (default) |
| `TEMPO_RPC_URL` | `https://rpc.tempo.xyz` (default) |
| `RECORDER_URL` | `https://arc-settlement-recorder.onrender.com` (default) |

Optional / defaults: `TEMPO_CHAIN_ID` (4217; `42431` = testnet fallback, needs
`TEMPO_PAY_TOKEN`), `TEMPO_PAY_TOKEN` (USDC.e `0x20C0…8b50`), `TEMPO_FEE_TOKEN`
(= pay token), `TEMPO_EXPLORER`, `TEMPO_FEE_RESERVE_USDC` (0.01),
`PUBLIC_VERIFIER_URL`, `LLX_BRIDGE_URL`, `LLX_BRIDGE_TOPIC` (`demo-pay`),
`TEMPO_FLOWS_PATH` (default next to the ledger on the Render disk).

## Tests

`npm run test:tempo -w @liquid-logic/treasurer` — chain, recorder and bridge are
mocked (no RPC, no funded keys): cap, allowlist, hold, daily cap, freeze,
address-key mismatch guard, flag off, Base config unchanged, flow happy path,
hold → approve, deny, expiry, recorder retry / hard failure, HTTP auth.
