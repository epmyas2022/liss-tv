import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      }
    ]
  }
};

export default nextConfig;
