import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/escrow",
        destination: "https://xlock.liquidlogicx.com/escrow",
        permanent: true,
      },
      {
        source: "/escrow/:path*",
        destination: "https://xlock.liquidlogicx.com/escrow",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
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
