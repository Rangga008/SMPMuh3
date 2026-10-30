import path from 'node:path';
import type { NextConfig } from 'next';

// output 'standalone' hanya di Docker — pembuatan symlink buntu di Windows.
const standalone = process.env.DOCKER_BUILD === '1';

const nextConfig: NextConfig = {
  ...(standalone
    ? {
        output: 'standalone',
        outputFileTracingRoot: path.join(__dirname, '../../'),
      }
    : {}),
  transpilePackages: ['@smpmuh3/ui', '@smpmuh3/types'],
};

export default nextConfig;
