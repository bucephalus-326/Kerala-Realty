import { type NextRequest, NextResponse } from "next/server";

/**
 * Runs before the /api → API rewrite (next.config.ts). Adds the shared
 * PROXY_SECRET and the visitor's IP so the API can trust this proxy and rate
 * limit per visitor. Headers a browser sends with these names are dropped.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.delete("x-kr-proxy");
  headers.delete("x-kr-client-ip");
  const secret = process.env.PROXY_SECRET;
  if (secret) {
    headers.set("x-kr-proxy", secret);
    // Vercel sets x-real-ip and overwrites x-forwarded-for with the real client IP.
    const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (ip) headers.set("x-kr-client-ip", ip);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/api/:path*" };
