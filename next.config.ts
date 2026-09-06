import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  experimental: {
    serverActions: {
      // Faktury v PDF mohou mít i pár MB, výchozí limit 1 MB nestačí.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
