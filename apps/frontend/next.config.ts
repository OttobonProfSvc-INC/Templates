import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/library',
        permanent: false,
      },
      {
        source: '/login',
        destination: '/library',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/assets/raw/:path*',
        destination: `${backendUrl}/api/assets/raw/:path*`,
      },
    ];
  },
};

export default nextConfig;
