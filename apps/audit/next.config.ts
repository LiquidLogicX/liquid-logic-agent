import type { NextConfig } from "next";

/** Minimal security headers (internal audit Nov 4 2026, item Website-M). Nothing frames the audit app. */
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@liquid-logic/shared"],
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  outputFileTracingIncludes: {
    "/api/audit": [
      "./public/ledger/**/*",
      "../../public/ledger/**/*",
      "../../data/ledger.jsonl",
    ],
    "/api/allowance": [
      "./public/ledger/**/*",
      "./public/policy.json",
      "../../public/ledger/**/*",
      "../../public/policy.json",
      "../../data/ledger.jsonl",
    ],
  },
};

export default nextConfig;
