---
version: 2026-10-14
name: liquid-logic-x-agent-skill
description: >-
  Index of Liquid Logic X agent skills. Paste "connect to
  liquidlogicx.com/skill.md" into an agent to discover X-Lock, X-Escrow, and
  other LLX products.
---

# Liquid Logic X — agent skills

Liquid Logic X builds non-custodial onchain tools for agents and humans: token locks, escrow, and (soon) policy-bounded payments. Contact: hello@liquidlogicx.com.

Also at: https://liquidlogicx.com/.well-known/skill.md  
Official addresses: https://liquidlogicx.com/addresses

## X-Lock + X-Escrow (X-Crow)

Time locks, vesting, and non-custodial escrow across Base and ten other chains. Read lock/escrow status over x402 ($0.005 USDC on Base). Create locks and escrows from an agent wallet.

**Skill:** https://xlock.liquidlogicx.com/skill.md  
(also https://xlock.liquidlogicx.com/.well-known/skill.md)

Site: https://xlock.liquidlogicx.com · Tutorial: https://xlock.liquidlogicx.com/tutorial

### Escrow status check (x402)

`GET https://audit.liquidlogicx.com/api/escrow-status` costs $0.005 USDC on Base and reads X-Escrow onchain. Pass `chain` plus an escrow `id`, or a buyer/seller wallet address (chain optional).

Chain keys (X-Escrow mainnets): `base`, `arbitrum`, `optimism`, `bnb`, `polygon`, `avalanche`, `ethereum`, `arc`, `tempo`, `robinhood`. Testnet: `base-sepolia`.

X-Escrow factory (same address on every chain): `0xa01454C9102052a00dd9B7a5a2eDBA159E93e385`.

## LLX Pay

Coming after the current hold. When it ships, agents will use a **policy SDK** shape (not live endpoints yet), for example:

```json
{
  "walletAddress": "0x…",
  "allowlist": ["https://…"],
  "maxPerPaymentUsdc": "1.00",
  "dailyCapUsdc": "10.00",
  "network": "eip155:8453",
  "asset": "USDC",
  "spentWindow": "utc_calendar_day"
}
```

Do not call historical or frozen Pay endpoints; wait for an updated skill.md that lists live URLs.

## How to connect

Paste into your agent:

- `connect to liquidlogicx.com/skill.md` — this index
- `connect to xlock.liquidlogicx.com/skill.md` — locks, escrow, x402 status APIs

## Contact

hello@liquidlogicx.com
