# Guardrails — Liquid Logic Agent

These rules are **non-negotiable**. They apply to code, comments, logs, copy, README, UI, social drafts, and ops.

## USDC only (Base)

- The only payment asset is **USDC on Base** (`eip155:8453`).
- The treasurer never buys, sells, or holds $LLX. $LLX is a separate Virtuals token; it is not used for x402 settlement.
- Never buy, swap into, or hold any asset other than USDC for operating spend (ETH for gas only as required by the network — never as a spend position).
- If a feature would make the treasurer spend or hold $LLX: **STOP** and open a `BLOCKER`.

## Operating spend only

- Do **not** describe balances, spend, or operations as “treasury growth,” APY, appreciation, or similar.
- Copy and logs must frame activity as **operating spend for services** (x402 endpoints).

## Services only

- The treasurer **pays x402 service endpoints** for useful work.
- Enforce in code: endpoint **allowlist**, **max per payment**, and **cumulative daily USDC cap**.
- Hard-fail any code path that would swap/buy non-USDC.

## Social posts

- Drafts only under `drafts/social/` for a human to post.
- **No** Twitter/X / LinkedIn / API posting automation in this repo.

## Scope

- This repo is **only** `LiquidLogicX/liquid-logic-agent`.
- Do **not** touch `LiquidLogicX/liquid-logic-x` or any Sepolia FHE contracts from this codebase.
