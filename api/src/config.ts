const env = process.env;

const isProd = env.NODE_ENV === "production";
if (isProd && (!env.JWT_SECRET || env.JWT_SECRET === "change-me")) {
  throw new Error("JWT_SECRET must be set to a long random value in production");
}

export const config = {
  isProd,
  port: Number(env.PORT ?? 4000),
  mongoUri: env.MONGODB_URI ?? "",
  jwtSecret: env.JWT_SECRET ?? "dev-only-secret-not-for-production",
  webOrigin: env.WEB_ORIGIN ?? "http://localhost:3000",
  sessionCookie: "kr_session",
  anonCookie: "kr_anon",
  sessionDays: 7,
  consentVersion: "2026-11",
};
