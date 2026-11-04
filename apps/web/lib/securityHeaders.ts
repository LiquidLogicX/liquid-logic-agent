// Response security headers for liquidlogicx.com (internal audit Nov 4 2026, item Website-M).
// Pure data, read by next.config.ts and apps/web/test/security-headers.test.ts.
//
// Enforced on every route: HSTS, nosniff, Referrer-Policy, Permissions-Policy.
// Enforced on every route except the ledger embed: frame-ancestors 'none' + X-Frame-Options DENY.
// The ledger embed (/ledger/embed and the static /ledger/index.html it iframes) may be framed
// by any site: frame-ancestors checks every ancestor, so the inner file needs it too.
//
// The full CSP ships as Content-Security-Policy-Report-Only first: violations show in the
// browser console without breaking anything. Enforce it once a preview is clean.

import { BRIDGE_CHAINS } from "./bridge";

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[] };

/** Paths that third-party sites may iframe. */
export const EMBED_PATHS = ["/ledger/embed", "/ledger/index.html"] as const;

const origin = (url: string) => new URL(url).origin;

/** Every public RPC the bridge reads from (primary + fallbacks), as origins. */
export const RPC_ORIGINS: readonly string[] = [
  ...new Set(BRIDGE_CHAINS.flatMap((c) => [c.rpc, ...(c.rpcFallbacks ?? [])]).map(origin)),
];

/** Full policy, report-only for now. frame-ancestors is enforced separately below. */
export const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // Next.js inline bootstrap scripts + the theme boot script in app/layout.tsx.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self'",
  `connect-src 'self' ${RPC_ORIGINS.join(" ")}`,
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const BASE: Header[] = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const NO_FRAMING: Header[] = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
];

const EMBED_FRAMING: Header[] = [{ key: "Content-Security-Policy", value: "frame-ancestors *" }];

const escapeRe = (p: string) => p.slice(1).replace(/[.]/g, "\\.");

/** Everything except the embed paths (path-to-regexp negative lookahead). */
export const NON_EMBED_SOURCE = `/:path((?!${EMBED_PATHS.map((p) => `${escapeRe(p)}$`).join("|")}).*)`;

export function securityHeaders(): HeaderRule[] {
  return [
    { source: "/:path*", headers: BASE },
    { source: "/", headers: NO_FRAMING },
    { source: NON_EMBED_SOURCE, headers: NO_FRAMING },
    ...EMBED_PATHS.map((source) => ({ source, headers: EMBED_FRAMING })),
  ];
}
