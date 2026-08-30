import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {},
  output: "standalone",
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "**",
      },
      {
        protocol: "https",
        hostname: "**",
      },

      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8090",
      },
    ],
  },
};

export default nextConfig;
