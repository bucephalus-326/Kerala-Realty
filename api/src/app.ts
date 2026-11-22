import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { readSession, requireJson } from "./auth/session.js";
import { errorHandler, HttpError } from "./lib/http.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { consentRouter } from "./routes/consent.js";
import { listingsRouter } from "./routes/listings.js";
import { meRouter } from "./routes/me.js";
import { nriRouter } from "./routes/nri.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1); // behind Render / Vercel proxies
  app.disable("x-powered-by");
  app.use(helmet());
  // The web app calls the API through its own /api proxy (same origin). CORS is
  // only for direct calls during development.
  app.use(cors({ origin: config.webOrigin, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(requireJson);
  app.use(readSession);

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/auth", authRouter);
  app.use("/listings", listingsRouter);
  app.use("/me", meRouter);
  app.use("/nri", nriRouter);
  app.use("/consent", consentRouter);
  app.use("/admin", adminRouter);

  app.use((_req, _res, next) => next(new HttpError(404, "Not found", "not_found")));
  app.use(errorHandler);
  return app;
}
