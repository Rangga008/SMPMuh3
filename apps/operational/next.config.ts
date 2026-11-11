import path from 'node:path';
import type { NextConfig } from 'next';

// output 'standalone' hanya di Docker — pembuatan symlink buntu di Windows.
const standalone = process.env.DOCKER_BUILD === '1';

const nextConfig: NextConfig = {
  // VPS kecil (2 vCPU): static generation tiap halaman bisa >60s —
  // default timeout Next terlalu pendek dan build gagal.
  staticPageGenerationTimeout: 300,
  ...(standalone
    ? {
        output: 'standalone',
        outputFileTracingRoot: path.join(__dirname, '../../'),
      }
    : {}),
  transpilePackages: ['@smpmuh3/ui', '@smpmuh3/types'],
  // Chrome tetap request /favicon.ico utk tab/history — proxy ke logo.
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/logo.png' }];
  },
};

export default nextConfig;
