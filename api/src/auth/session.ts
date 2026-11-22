import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { User } from "../models/user.js";
import type { Role } from "./rbac.js";

export interface SessionUser {
  id: string;
  role: Role;
  /** Token version; must match the user's current one. */
  v?: number;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
  }
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.isProd,
  sameSite: "lax" as const,
  path: "/",
});

export function startSession(res: Response, user: SessionUser) {
  const token = jwt.sign({ sub: user.id, role: user.role, v: user.v ?? 0 }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: `${config.sessionDays}d`,
  });
  res.cookie(config.sessionCookie, token, { ...cookieOptions(), maxAge: config.sessionDays * 86_400_000 });
}

export function endSession(res: Response) {
  res.clearCookie(config.sessionCookie, cookieOptions());
}

/**
 * Current role and status per user, re-read from the database at most every
 * 30 s. Tokens carry a role, but an admin's role change or suspension must win.
 * shortcut: per-process cache, so with several API processes a change can take
 * up to 30 s to reach all of them; bumping tokenVersion makes it final.
 */
const live = new Map<string, { role: Role; status: string; v: number; at: number }>();
const LIVE_TTL = 30_000;

export function forgetSession(userId: string) {
  live.delete(userId);
}

async function liveUser(id: string) {
  const hit = live.get(id);
  if (hit && Date.now() - hit.at < LIVE_TTL) return hit;
  const u = await User.findById(id, { role: 1, status: 1, tokenVersion: 1 }).lean();
  if (!u) {
    live.delete(id);
    return null;
  }
  const row = { role: u.role as Role, status: u.status ?? "active", v: u.tokenVersion ?? 0, at: Date.now() };
  live.set(id, row);
  if (live.size > 10_000) live.delete(live.keys().next().value!); // bounded
  return row;
}

/** Reads the session cookie. Invalid, expired, revoked or suspended sessions are treated as signed out. */
export async function readSession(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[config.sessionCookie];
  if (!token) return next();
  let p: jwt.JwtPayload;
  try {
    p = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as jwt.JwtPayload;
  } catch {
    return next();
  }
  if (!p.sub || !p.role) return next();
  let u: Awaited<ReturnType<typeof liveUser>>;
  try {
    u = await liveUser(String(p.sub));
  } catch {
    return next(); // database blip: signed out for this request only, keep the cookie
  }
  if (!u || u.status !== "active" || u.v !== (p.v ?? 0)) {
    res.clearCookie(config.sessionCookie, cookieOptions());
    return next();
  }
  req.user = { id: String(p.sub), role: u.role, v: u.v };
  next();
}

/**
 * CSRF guard: every state-changing request must declare a JSON body.
 * HTML forms can only send form or text encodings, and a cross-site fetch with
 * JSON triggers a CORS preflight, which only the web origin passes.
 */
export function requireJson(req: Request, _res: Response, next: NextFunction) {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    // File uploads send raw bytes; the custom header plays the same CSRF role (it forces a preflight).
    if (req.method === "POST" && /^\/(media|documents)\/?$/.test(req.path) && req.headers["x-kr-upload"] === "1") return next();
    const type = req.headers["content-type"] ?? "";
    if (!type.startsWith("application/json")) {
      return next(new HttpError(415, "Send the request body as JSON", "json_required"));
    }
  }
  next();
}

export { cookieOptions };
