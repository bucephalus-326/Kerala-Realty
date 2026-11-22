/**
 * The web app proxies /api/* to this server and adds two headers:
 * `x-kr-proxy` (the shared PROXY_SECRET) and `x-kr-client-ip` (the visitor's IP
 * as seen by Vercel). With a valid secret, the visitor's IP becomes `req.ip`, so
 * rate limits count visitors rather than the proxy. Without PROXY_SECRET (local
 * development, tests) nothing changes.
 */
import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { HttpError } from "./http.js";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function trustedProxy(req: Request, _res: Response, next: NextFunction) {
  if (!config.proxySecret || req.path === "/health") return next();
  const secret = req.get("x-kr-proxy");
  if (!secret || !same(secret, config.proxySecret)) return next(new HttpError(403, "Use the website", "direct_call"));
  const ip = req.get("x-kr-client-ip");
  if (ip && isIP(ip)) Object.defineProperty(req, "ip", { value: ip, configurable: true });
  next();
}
