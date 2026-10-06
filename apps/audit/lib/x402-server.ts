/**
 * CDP x402 seller for audit + treasurer allowance pre-flight.
 * - GET/POST /api/audit     $0.05 USDC on Base
 * - GET/POST /api/allowance $0.001 USDC on Base (cheaper; call before spending)
 * - GET/POST /api/prove     $0.02 USDC on Base (settlement proof on Arc)
 */
import {
  createX402Server,
  type CdpRouteConfig,
  type RouteConfig,
  type X402Server,
} from "@coinbase/cdp-sdk/x402";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import {
  ALLOWANCE_PRICE_LABEL,
  AUDIT_PRICE_LABEL,
  NETWORK_BASE,
  PROVE_PRICE_LABEL,
} from "@liquid-logic/shared";
import { AUDIT_OUTPUT_EXAMPLE } from "./audit-output-example";
import { ALLOWANCE_OUTPUT_EXAMPLE } from "./allowance-output-example";
import {
  getProveDiscovery,
  postProveDiscovery,
  PROVE_DESCRIPTION,
} from "./prove/discovery";
import {
  ALLOWANCE_META,
  AUDIT_META,
  BAZAAR_ICON_URL,
  PROVE_META,
  type BazaarMeta,
} from "./bazaar-meta";

/**
 * /api/prove routes (Base only — never the Arc dual rail, which settles
 * before the handler). Exported so tests can mount the same config on a mock
 * facilitator.
 */
export const PROVE_ROUTES: Record<"GET /api/prove" | "POST /api/prove", CdpRouteConfig> = {
  "GET /api/prove": {
    price: PROVE_PRICE_LABEL,
    networks: [NETWORK_BASE],
    description: PROVE_DESCRIPTION,
    extensions: { ...getProveDiscovery },
  },
  "POST /api/prove": {
    price: PROVE_PRICE_LABEL,
    networks: [NETWORK_BASE],
    description: PROVE_DESCRIPTION,
    extensions: { ...postProveDiscovery },
  },
};

/**
 * Bazaar listing metadata (x402 `resource.serviceName` / `tags` / `iconUrl`),
 * set per route from ./bazaar-meta so each endpoint gets a keyword-first name
 * and its own tags (Bazaar ranks name > tags > description).
 * Only the full x402 RouteConfig format carries them — the simplified
 * CdpRouteConfig drops them — so every route is converted with `withServiceMeta`.
 */
/** Convert a simplified CDP route (Base only) to full RouteConfig + listing metadata. */
function withServiceMeta(route: CdpRouteConfig, meta: BazaarMeta): RouteConfig {
  return {
    accepts: {
      scheme: "exact",
      price: route.price,
      network: NETWORK_BASE as `${string}:${string}`,
      payTo: "", // vacant — filled from payToConfig by createX402Server
      maxTimeoutSeconds: 300,
    },
    ...(route.description !== undefined && { description: route.description }),
    mimeType: "application/json",
    serviceName: meta.serviceName,
    tags: [...meta.tags],
    iconUrl: BAZAAR_ICON_URL,
    ...(route.extensions !== undefined && { extensions: route.extensions }),
  };
}

const AUDIT_DESCRIPTION = AUDIT_META.description;

const ALLOWANCE_DESCRIPTION = ALLOWANCE_META.description;

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
        "GET /api/audit": withServiceMeta({
          price: AUDIT_PRICE_LABEL,
          networks: [NETWORK_BASE],
          description: AUDIT_DESCRIPTION,
          extensions: { ...getAuditDiscovery },
        }, AUDIT_META),
        "POST /api/audit": withServiceMeta({
          price: AUDIT_PRICE_LABEL,
          networks: [NETWORK_BASE],
          description: AUDIT_DESCRIPTION,
          extensions: { ...postAuditDiscovery },
        }, AUDIT_META),
        "GET /api/allowance": withServiceMeta({
          price: ALLOWANCE_PRICE_LABEL,
          networks: [NETWORK_BASE],
          description: ALLOWANCE_DESCRIPTION,
          extensions: { ...getAllowanceDiscovery },
        }, ALLOWANCE_META),
        "POST /api/allowance": withServiceMeta({
          price: ALLOWANCE_PRICE_LABEL,
          networks: [NETWORK_BASE],
          description: ALLOWANCE_DESCRIPTION,
          extensions: { ...postAllowanceDiscovery },
        }, ALLOWANCE_META),
        "GET /api/prove": withServiceMeta(PROVE_ROUTES["GET /api/prove"], PROVE_META),
        "POST /api/prove": withServiceMeta(PROVE_ROUTES["POST /api/prove"], PROVE_META),
      },
    });
  }
  return serverPromise;
}
