import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@liquid-logic/shared"],
  outputFileTracingIncludes: {
    "/api/audit": [
      "./public/ledger/**/*",
      "../../public/ledger/**/*",
      "../../data/ledger.jsonl",
    ],
  },
};

export default nextConfig;
