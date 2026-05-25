import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        // Codespaces dev URLs
        '*.app.github.dev',
        // Local dev (just in case)
        'localhost:3000',
        // Production
        'elite-11u-moore.vercel.app',
      ],
    },
  },
};

export default nextConfig;