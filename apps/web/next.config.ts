import type { NextConfig } from "next";
import { securityHeaders } from "./lib/securityHeaders";

const nextConfig: NextConfig = {
  async headers() {
    return [
      ...securityHeaders(),
      {
        source: "/ledger",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
      {
        source: "/ledger/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, max-age=0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
