/** Bazaar output example. Generated from ./fixture.ts (escrow #3, funded); scripts/check-escrow-status.ts asserts it matches. */
import type { EscrowStatusResponse } from "./core";

export const ESCROW_STATUS_OUTPUT_EXAMPLE: EscrowStatusResponse = {
  "query": {
    "chain": "base-sepolia",
    "id": 3,
    "address": null
  },
  "found": true,
  "checkedAt": "2026-10-14T21:00:00.000Z",
  "chainsChecked": [
    "base-sepolia"
  ],
  "chainsFailed": [],
  "total": 1,
  "escrows": [
    {
      "chain": "base-sepolia",
      "chainId": 84532,
      "caip2": "eip155:84532",
      "testnet": true,
      "factory": "0xAd45eFa49A7BD027823b01453dC8468AA756574F",
      "escrowId": 3,
      "state": "funded" as const,
      "buyer": "0x793E8C977CB0c188332a72E34e9774dc1Dc762a0",
      "seller": "0x000000000000000000000000000000000000dEaD",
      "token": {
        "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "symbol": "USDC",
        "decimals": 6,
        "native": false
      },
      "amount": "25",
      "amountRaw": "25000000",
      "deadline": "2026-10-21T21:00:00.000Z",
      "verifier": null,
      "createdAt": "2026-10-14T20:50:00.000Z",
      "createdBlock": 48122000,
      "refundableNow": false,
      "secondsToDeadline": 604800,
      "escrowUrl": "https://xlock.liquidlogicx.com/escrow/base-sepolia/3"
    }
  ],
  "chains": [
    {
      "chain": "base-sepolia",
      "chainId": 84532,
      "status": "ok" as const,
      "found": 1
    }
  ],
  "source": "X-Escrow factory contracts (onchain reads). Verify any escrow at its escrowUrl."
};
