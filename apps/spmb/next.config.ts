import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@smpmuh3/ui', '@smpmuh3/types'],
};

export default nextConfig;
