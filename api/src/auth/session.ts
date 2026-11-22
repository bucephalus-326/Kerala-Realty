import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import type { Role } from "./rbac.js";

export interface SessionUser {
  id: string;
  role: Role;
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
  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: `${config.sessionDays}d`,
  });
  res.cookie(config.sessionCookie, token, { ...cookieOptions(), maxAge: config.sessionDays * 86_400_000 });
}

export function endSession(res: Response) {
  res.clearCookie(config.sessionCookie, cookieOptions());
}

/** Reads the session cookie if present. Invalid or expired tokens are treated as signed out. */
export function readSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[config.sessionCookie];
  if (token) {
    try {
      const p = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as jwt.JwtPayload;
      if (p.sub && p.role) req.user = { id: String(p.sub), role: p.role as Role };
    } catch {
      /* ignore: signed out */
    }
  }
  next();
}

/**
 * CSRF guard: every state-changing request must declare a JSON body.
 * HTML forms can only send form or text encodings, and a cross-site fetch with
 * JSON triggers a CORS preflight, which only the web origin passes.
 */
export function requireJson(req: Request, _res: Response, next: NextFunction) {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const type = req.headers["content-type"] ?? "";
    if (!type.startsWith("application/json")) {
      return next(new HttpError(415, "Send the request body as JSON", "json_required"));
    }
  }
  next();
}

export { cookieOptions };
