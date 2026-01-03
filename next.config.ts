import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile Three.js packages for proper ESM support
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  
  // Empty turbopack config to silence the warning
  turbopack: {},
};

export default nextConfig;
