import type { NextConfig } from 'next';

const config: NextConfig = {
  // Silence the "BACKEND_URL not set" warning at build time — it's fine;
  // the proxy route only needs it at request time (runtime env var on Vercel).
  serverExternalPackages: [],
};

export default config;
