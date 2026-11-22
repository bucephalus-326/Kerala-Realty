const env = process.env;

const isProd = env.NODE_ENV === "production";
if (isProd && (!env.JWT_SECRET || env.JWT_SECRET === "change-me")) {
  throw new Error("JWT_SECRET must be set to a long random value in production");
}

if (isProd && !env.PROXY_SECRET) {
  console.warn("PROXY_SECRET is not set: the API accepts direct calls and rate limits see the proxy's IP, not the visitor's");
}

export const config = {
  isProd,
  port: Number(env.PORT ?? 4000),
  mongoUri: env.MONGODB_URI ?? "",
  jwtSecret: env.JWT_SECRET ?? "dev-only-secret-not-for-production",
  webOrigin: env.WEB_ORIGIN ?? "http://localhost:3000",
  /** Shared with the web app's /api proxy. When set, the API only answers requests that carry it. */
  proxySecret: env.PROXY_SECRET ?? "",
  sessionCookie: "kr_session",
  anonCookie: "kr_anon",
  sessionDays: 7,
  consentVersion: "2026-11",
};
