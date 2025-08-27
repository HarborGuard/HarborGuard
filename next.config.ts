import type { NextConfig } from "next";
import packageJson from './package.json';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  
  // Inject version information
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    BUILD_TIME: new Date().toISOString(),
  },
  
  // Optimize for production builds
  productionBrowserSourceMaps: false, // Disable source maps to reduce size
  compress: true, // Enable gzip compression
  poweredByHeader: false, // Remove X-Powered-By header
};

export default nextConfig;
