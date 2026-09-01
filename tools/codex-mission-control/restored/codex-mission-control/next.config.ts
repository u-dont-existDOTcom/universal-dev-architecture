import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Codex's embedded browser reaches the local development server through the
  // loopback host. Keep that origin explicit so browser acceptance can load the
  // development assets without weakening production origin handling.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
