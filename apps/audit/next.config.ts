import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@liquid-logic/shared"],
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
