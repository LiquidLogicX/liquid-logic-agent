/** Bazaar output example. Generated from ./fixture.ts (illustrative locks); scripts/check-lock-status.ts asserts it matches. */
import type { LockStatusResponse } from "./core";

export const LOCK_STATUS_OUTPUT_EXAMPLE: LockStatusResponse = {
  "token": "0x1111111111111111111111111111111111111111",
  "isLocked": true,
  "checkedAt": "2026-10-14T12:00:00.000Z",
  "chainsChecked": [
    "base"
  ],
  "chainsFailed": [],
  "totalLocks": 2,
  "nextUnlock": {
    "chain": "base",
    "lockId": 1,
    "at": "2026-12-13T12:00:00.000Z",
    "amount": "36986301.369863013698630136",
    "lockUrl": "https://xlock.liquidlogicx.com/lock/1"
  },
  "chains": [
    {
      "chain": "base",
      "chainId": 8453,
      "caip2": "eip155:8453",
      "factory": "0xD47326d2B5822355D9c4dfF5265849a5bb5D20ec",
      "status": "ok" as const,
      "lockCount": 2,
      "totalLockedAmount": "200000000",
      "totalLockedRaw": "200000000000000000000000000",
      "pctOfSupplyLocked": 20,
      "nextUnlock": {
        "lockId": 1,
        "at": "2026-12-13T12:00:00.000Z",
        "amount": "36986301.369863013698630136",
        "lockUrl": "https://xlock.liquidlogicx.com/lock/1"
      },
      "locks": [
        {
          "lockId": 1,
          "kind": "vesting" as const,
          "lockWallet": "0x2222222222222222222222222222222222222222",
          "beneficiary": "0x4444444444444444444444444444444444444444",
          "creator": "0x3333333333333333333333333333333333333333",
          "amount": "150000000",
          "amountRaw": "150000000000000000000000000",
          "start": "2026-09-14T12:00:00.000Z",
          "cliff": "2026-12-13T12:00:00.000Z",
          "end": "2027-09-14T12:00:00.000Z",
          "released": "0",
          "claimable": "0",
          "stillLocked": "150000000",
          "status": "locked" as const,
          "lockUrl": "https://xlock.liquidlogicx.com/lock/1"
        },
        {
          "lockId": 2,
          "kind": "timelock" as const,
          "lockWallet": "0x5555555555555555555555555555555555555555",
          "beneficiary": "0x3333333333333333333333333333333333333333",
          "creator": "0x3333333333333333333333333333333333333333",
          "amount": "50000000",
          "amountRaw": "50000000000000000000000000",
          "start": "2027-04-12T12:00:00.000Z",
          "cliff": "2027-04-12T12:00:00.000Z",
          "end": "2027-04-12T12:00:00.000Z",
          "released": "0",
          "claimable": "0",
          "stillLocked": "50000000",
          "status": "locked" as const,
          "lockUrl": "https://xlock.liquidlogicx.com/lock/2"
        }
      ],
      "token": {
        "symbol": "EXAMPLE",
        "decimals": 18,
        "totalSupply": "1000000000"
      }
    }
  ],
  "source": "X-Lock factory contracts (onchain reads). Verify any lock at its lockUrl."
};
