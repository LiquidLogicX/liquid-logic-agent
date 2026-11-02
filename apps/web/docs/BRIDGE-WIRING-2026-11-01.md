# $LLX V2 OFT wiring check — Nov 1 2026, ~7:40 PM PST (read-only RPC reads, nothing signed or sent)

Token (same address on all six chains): 0x72885fBFA330d1a8fA95880A85b73d699943053B
Owner + LZ delegate on all six: LLX V2 Vault Safe 0x794A618486dAA4EC6724865E68Fdc79Ae1eecB0B (2-of-3; Safe nonce Base 4, others 3)

| chain | chainId | EID | endpoint | token code | owner/delegate = Vault |
|---|---|---|---|---|---|
| Base | 8453 | 30184 | 0x1a44076050125825900e736c501f859c50fE728c | yes (25M supply) | yes |
| Arc | 5042 | 30417 | 0x6F475642a6e85809B1c36Fa62763669b1b48DD5B | yes | yes |
| Robinhood | 4663 | 30416 | 0x6F475642a6e85809B1c36Fa62763669b1b48DD5B | yes | yes |
| BNB Chain | 56 | 30102 | 0x1a44076050125825900e736c501f859c50fE728c | yes | yes |
| Tempo | 4217 | 30410 | 0x20Bb7C2E2f4e5ca2B4c57060d1aE2615245dCc9C (EndpointV2Alt, fee in LZD) | yes (LLXTokenAlt) | yes |
| HyperEVM | 999 | 30367 | 0x3A73033C0b1407574C76BdBAc67f126f6b4a9AA9 | yes | yes |

## Result: all 30 directed routes are fully wired. NO missing calls → no new Safe batch needed.
Per route, checked on the source chain:
- peers(dstEid) = the token (bytes32) ✅ 30/30
- send library pinned (not default): SendUln302 ✅ 30/30; receive library pinned ReceiveUln302 ✅ 30/30
- getConfig ULN (send + receive): requiredDVNCount 2, optional 0, DVNs = LayerZero Labs + Horizen ✅ 30/30
  confirmations: send = source chain's (Base 10, Arc 5, RH 5, BSC 20, Tempo 20, HyperEVM 1); receive = remote's
- executor config: maxMessageSize 10,000, LZ executor ✅ 30/30
- enforcedOptions(SEND): lzReceive 120,000 gas; 1,000,000 into Tempo ✅ 30/30
- outbound rate limit 1,000 LLX / 86,400 s ✅ 30/30; inbound limit 1,000 LLX / day ✅ 30/30
- quoteSend(10 LLX) returns a fee on every route ✅ 30/30 (Base ~0.00011 ETH, Arc ~0.25–0.27 USDC,
  RH ~0.00011–0.00012 ETH, BSC ~0.00037–0.00039 BNB, HyperEVM ~0.0026–0.0028 HYPE, Tempo ~0.25–0.27 LZD)
- Base→{Arc,RH,BSC,Tempo,HyperEVM} send(1 LLX) eth_call simulation from the Vault (balance override) ✅ succeeds;
  value = fee−1 wei reverts NotEnoughNative (OFT needs msg.value == fee.nativeFee).

The earlier Safe batch drafts (Oct 28–29) were executed
on-chain already — do NOT re-submit them.

## Watch items (not blocking)
- Horizen DVN after Nov 5 2026 18:00 UTC (Horizen L3 sunset). If Horizen DVN stops verifying, every route stalls
  (2-of-2 required). Fallback: Nethermind DVN, a 2-call setConfig swap per route on both ends (see LiquidLogicX/llx-token docs/DEPLOY-TOKEN.md).
  Not drafted yet — say the word and crew can generate the 6 batches.
- Limits are the 1,000 LLX/day live-test values. Raising them = setRateLimits + setInboundLimits per chain (Safe batch).
- Tempo outbound needs LZD (ERC-20) for the fee; the website bridge treats Tempo as destination-only for now.
