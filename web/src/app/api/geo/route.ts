import { type NextRequest, NextResponse } from "next/server";

/**
 * Approximate visitor location from the hosting platform's edge headers
 * (Vercel adds these for free; no third-party lookup, nothing stored).
 * The client only calls this after the visitor allows location in the consent banner.
 */
export function GET(req: NextRequest) {
  const h = req.headers;
  const decode = (v: string | null) => (v ? decodeURIComponent(v) : null);
  const city = decode(h.get("x-vercel-ip-city"));
  const body = city
    ? { city, region: decode(h.get("x-vercel-ip-country-region")), country: h.get("x-vercel-ip-country"), source: "edge" }
    : { city: null, region: null, country: null, source: null };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
