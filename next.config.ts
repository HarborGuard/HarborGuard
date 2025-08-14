import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  
  // Optimize for production builds
  productionBrowserSourceMaps: false, // Disable source maps to reduce size
  compress: true, // Enable gzip compression
  poweredByHeader: false, // Remove X-Powered-By header
};

export default nextConfig;
