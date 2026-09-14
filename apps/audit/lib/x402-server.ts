/**
 * CDP x402 seller for the audit endpoint.
 * Price: $0.05 USDC on Base (eip155:8453). Coinbase CDP facilitator via createX402Server.
 */
import { createX402Server, type X402Server } from "@coinbase/cdp-sdk/x402";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { AUDIT_PRICE_LABEL, NETWORK_BASE } from "@liquid-logic/shared";

const AUDIT_DESCRIPTION =
  "Liquid Logic Agent — wallet audit. Returns a structured USDC spend summary for an agent wallet from the public ledger. Site: https://liquidlogicx.com";

const discovery = declareDiscoveryExtension({
  method: "GET",
  input: { wallet: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D" },
  inputSchema: {
    properties: {
      wallet: {
        type: "string",
        description: "Agent wallet address (0x…)",
      },
    },
    required: ["wallet"],
  },
  output: {
    example: {
      walletAddress: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D",
      network: "eip155:8453",
      asset: "USDC",
      source: "public_ledger",
      paymentCount: 1,
      totalUsdc: 0.001,
      destinations: [],
      recent: [],
      note: "Operating spend for x402 services (USDC on Base).",
    },
  },
});

let serverPromise: Promise<X402Server> | null = null;

export function getAuditX402Server(): Promise<X402Server> {
  if (!serverPromise) {
    const payToRaw = process.env.AUDIT_PAY_TO_EVM ?? "";
    // Strip whitespace/newlines from mobile paste wrapping
    const payTo = payToRaw.replace(/\s+/g, "");
    if (payTo && !/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
      throw new Error(
        `AUDIT_PAY_TO_EVM must be a 42-char 0x address (got length ${payTo.length})`,
      );
    }
    serverPromise = createX402Server({
      // production default = Base mainnet. Set CDP_X402_SERVER_ENVIRONMENT=development for Sepolia.
      environment:
        process.env.CDP_X402_SERVER_ENVIRONMENT === "development"
          ? "development"
          : "production",
      ...(payTo
        ? {
            payToConfig: {
              type: "address" as const,
              evm: payTo as `0x${string}`,
            },
          }
        : {}),
      routes: {
        "GET /api/audit": {
          price: AUDIT_PRICE_LABEL,
          networks: [NETWORK_BASE],
          description: AUDIT_DESCRIPTION,
          extensions: { ...discovery },
        },
        "POST /api/audit": {
          price: AUDIT_PRICE_LABEL,
          networks: [NETWORK_BASE],
          description: AUDIT_DESCRIPTION,
          extensions: {
            ...declareDiscoveryExtension({
              method: "POST",
              input: { wallet: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D" },
              inputSchema: {
                properties: {
                  wallet: {
                    type: "string",
                    description: "Agent wallet address (0x…)",
                  },
                },
                required: ["wallet"],
              },
              output: {
                example: {
                  walletAddress: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D",
                  network: "eip155:8453",
                  asset: "USDC",
                  source: "public_ledger",
                  paymentCount: 1,
                  totalUsdc: 0.001,
                  destinations: [],
                  recent: [],
                  note: "Operating spend for x402 services (USDC on Base).",
                },
              },
            }),
          },
        },
      },
    });
  }
  return serverPromise;
}
