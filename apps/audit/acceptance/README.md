# Acceptance artifacts

Store real payment + paid audit call evidence here (Task C format):

- `paid-audit-*.json` from `npm run paid-call` (Base / CDP)
- `paid-audit-arc-*.json` from Arc rail paid calls when `ENABLE_X402_ARC=1`
- Explorer tx URLs for the `$0.05` USDC settlement (BaseScan or Arc explorer)
- Optional screenshots
- `circle-supported-arc.json` — live `GET …/v1/x402/supported` Arc kind snapshot

## Arc rail (`ENABLE_X402_ARC`)

Flag **off** (default): 402 response matches production Base-only accepts (CDP).

Flag **on**: v2 `accepts = [Base, Arc eip155:5042]`; Base settles via CDP; Arc settles via Circle Gateway (`gateway-api.circle.com`).

### Paid acceptance blockers (Miles)

Paid Arc testnet then mainnet `$0.05` calls need:

1. Deploy / preview with `ENABLE_X402_ARC=1` and `ARC_PAY_TO_EVM=0xe9bf3457f1e59ffa507141e64e8eb259f966c2c2` (or confirmed dedicated Arc payTo).
2. Payer wallet with **USDC on Arc** (`eip155:5042`) — gas on Arc is USDC; Circle Gateway settles EIP-3009 via GatewayWalletBatched.
3. Client capable of selecting the Arc accept (not CDP-only `CdpX402Client`) — e.g. `@circle-fin/x402-batching` client or wallet that signs GatewayWalletBatched.
4. Optional Arc testnet first (`eip155:5042002`) if a test rail is configured; this PR codes **mainnet Arc** `eip155:5042` per live `/supported`.

**Do not invent tx hashes.** Until the above exist, leave dry-run notes under `DRY_RUN_ARC.md` and Base CDP paid artifacts when CDP keys + Base USDC are available.

Base CDP paid-call blockers (unchanged): `CDP_API_KEY_*`, `CDP_WALLET_SECRET`, funded Base USDC payer — see root `BLOCKERS.md`.
