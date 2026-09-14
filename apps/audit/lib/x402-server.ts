/**
 * CDP x402 seller for audit + treasurer allowance pre-flight.
 * - GET/POST /api/audit     $0.05 USDC on Base
 * - GET/POST /api/allowance $0.001 USDC on Base (cheaper; call before spending)
 */
import { createX402Server, type X402Server } from "@coinbase/cdp-sdk/x402";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import {
  ALLOWANCE_PRICE_LABEL,
  AUDIT_PRICE_LABEL,
  NETWORK_BASE,
} from "@liquid-logic/shared";
import { AUDIT_OUTPUT_EXAMPLE } from "./audit-output-example";
import { ALLOWANCE_OUTPUT_EXAMPLE } from "./allowance-output-example";

const AUDIT_DESCRIPTION =
  "Liquid Logic Agent — wallet audit. Returns a structured USDC spend summary for an agent wallet from the public ledger. Site: https://liquidlogicx.com";

const ALLOWANCE_DESCRIPTION =
  "Call this BEFORE paying an x402 endpoint: ask whether the Liquid Logic treasurer wallet (0xEA24…) is allowed to pay that URL and how much USDC remains under the UTC daily cap. $0.001 USDC on Base — cheaper than /api/audit ($0.05). Pass wallet; optionally pass endpoint. Omit endpoint for wallet-level remaining + allowlist. Site: https://liquidlogicx.com";

const auditOutputExample = {
  example: AUDIT_OUTPUT_EXAMPLE,
};

const allowanceOutputExample = {
  example: ALLOWANCE_OUTPUT_EXAMPLE,
};

const walletInputSchema = {
  properties: {
    wallet: {
      type: "string",
      description: "Agent wallet address (0x…)",
    },
  },
  required: ["wallet"],
};

const allowanceInputSchema = {
  properties: {
    wallet: {
      type: "string",
      description:
        "Wallet to check (Liquid Logic treasurer is 0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D)",
    },
    endpoint: {
      type: "string",
      description:
        "Optional x402 URL the wallet wants to pay. Omit to get remaining cap + allowlist summary.",
    },
  },
  required: ["wallet"],
};

// method is inferred: query input => GET; bodyType => POST/body methods
const getAuditDiscovery = declareDiscoveryExtension({
  input: { wallet: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D" },
  inputSchema: walletInputSchema,
  output: auditOutputExample,
});

const postAuditDiscovery = declareDiscoveryExtension({
  bodyType: "json",
  input: { wallet: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D" },
  inputSchema: walletInputSchema,
  output: auditOutputExample,
});

const getAllowanceDiscovery = declareDiscoveryExtension({
  input: {
    wallet: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D",
    endpoint: "https://audit.liquidlogicx.com/api/audit",
  },
  inputSchema: allowanceInputSchema,
  output: allowanceOutputExample,
});

const postAllowanceDiscovery = declareDiscoveryExtension({
  bodyType: "json",
  input: {
    wallet: "0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D",
    endpoint: "https://audit.liquidlogicx.com/api/audit",
  },
  inputSchema: allowanceInputSchema,
  output: allowanceOutputExample,
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
          extensions: { ...getAuditDiscovery },
        },
        "POST /api/audit": {
          price: AUDIT_PRICE_LABEL,
          networks: [NETWORK_BASE],
          description: AUDIT_DESCRIPTION,
          extensions: { ...postAuditDiscovery },
        },
        "GET /api/allowance": {
          price: ALLOWANCE_PRICE_LABEL,
          networks: [NETWORK_BASE],
          description: ALLOWANCE_DESCRIPTION,
          extensions: { ...getAllowanceDiscovery },
        },
        "POST /api/allowance": {
          price: ALLOWANCE_PRICE_LABEL,
          networks: [NETWORK_BASE],
          description: ALLOWANCE_DESCRIPTION,
          extensions: { ...postAllowanceDiscovery },
        },
      },
    });
  }
  return serverPromise;
}
