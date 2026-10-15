import type { NextConfig } from "next";

const backend = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  // One origin for browser + API, so a single HTTPS tunnel is enough for phone mic access.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  devIndicators: false,
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.loca.lt"],
};

export default nextConfig;
