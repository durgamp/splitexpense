import type { NextConfig } from 'next';

const config: NextConfig = {
  // Proxy /api/* to the Express backend during development
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default config;
