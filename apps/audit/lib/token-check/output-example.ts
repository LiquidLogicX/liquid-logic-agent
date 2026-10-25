/** Generated from lib/token-check/fixture.ts by scripts/gen-token-check-example.ts (checked by check-token-check). Illustrative token. */
export const TOKEN_CHECK_OUTPUT_EXAMPLE = {
  "token": "0x1111111111111111111111111111111111111111",
  "chain": "base",
  "checkedAt": "2026-10-25T12:00:00.000Z",
  "risk": "high",
  "score": 0,
  "summary": "HIGH risk: Has a mint function and an active owner (0x2222222222222222222222222222222222222222). Has a blacklist function and an active owner (0x2222222222222222222222222222222222222222). 41 buys and 0 sells in 24h on the main pair: possible honeypot.",
  "flags": [
    {
      "code": "POWER_MINT",
      "severity": "high",
      "message": "Has a mint function and an active owner (0x2222222222222222222222222222222222222222)."
    },
    {
      "code": "POWER_BLACKLIST",
      "severity": "high",
      "message": "Has a blacklist function and an active owner (0x2222222222222222222222222222222222222222)."
    },
    {
      "code": "OWNER_HOLDS_LARGE",
      "severity": "medium",
      "message": "Owner wallet holds 18% of supply."
    },
    {
      "code": "LIQUIDITY_LOW",
      "severity": "medium",
      "message": "Low liquidity: $6400 across Base pairs."
    },
    {
      "code": "NO_SELLS_24H",
      "severity": "high",
      "message": "41 buys and 0 sells in 24h on the main pair: possible honeypot."
    },
    {
      "code": "PAIR_NEW",
      "severity": "medium",
      "message": "Main pair is less than 24 hours old."
    }
  ],
  "contract": {
    "name": "Example Token",
    "symbol": "EXMPL",
    "decimals": 18,
    "totalSupply": "1000000000",
    "owner": "0x2222222222222222222222222222222222222222",
    "ownerRenounced": false,
    "upgradeable": false,
    "proxyImplementation": null,
    "proxyAdmin": null,
    "adminPowersInCode": [
      "mint",
      "blacklist"
    ],
    "knownIssuer": null
  },
  "holders": {
    "ownerPct": 18,
    "burnedPct": 5
  },
  "market": {
    "status": "ok",
    "pairCount": 1,
    "totalLiquidityUsd": 6400,
    "topPair": {
      "dex": "uniswap",
      "pairAddress": "0x3333333333333333333333333333333333333333",
      "url": "https://dexscreener.com/base/0x3333333333333333333333333333333333333333",
      "quoteSymbol": "WETH",
      "liquidityUsd": 6400,
      "priceUsd": "0.0000123",
      "volume24hUsd": 18250,
      "buys24h": 41,
      "sells24h": 0,
      "createdAt": "2026-10-25T03:00:00.000Z"
    }
  },
  "locks": {
    "xlockLocked": false,
    "pctOfSupplyLocked": null,
    "nextUnlock": null,
    "lockUrls": []
  },
  "notChecked": [
    "sell simulation (a contract can still block sells in ways not visible here)",
    "full holder list beyond the owner and burn addresses",
    "liquidity locks on lockers other than X-Lock"
  ],
  "links": {
    "basescan": "https://basescan.org/token/0x1111111111111111111111111111111111111111",
    "dexscreener": "https://dexscreener.com/base/0x1111111111111111111111111111111111111111"
  },
  "source": "Base onchain reads + DexScreener public market data, by Liquid Logic X. Evidence, not financial advice."
} as const;
