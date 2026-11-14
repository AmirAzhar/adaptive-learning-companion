import { apiPort } from './server/config.js';

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `http://127.0.0.1:${apiPort}/api/:path*` }];
  },
};

export default nextConfig;
