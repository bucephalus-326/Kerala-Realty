import type { NextConfig } from "next";

// The browser talks to the API through /api on the same origin, so the
// session cookie stays first-party (no third-party cookie or CORS issues).
const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
