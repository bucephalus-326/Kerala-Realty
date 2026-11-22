import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http.js";

/**
 * Role-based access control.
 * "guest" is anyone without a session. Admin holds every permission.
 */
export const ROLES = ["buyer", "nri", "owner", "agent", "admin"] as const;
export type Role = (typeof ROLES)[number];
export type Actor = Role | "guest";

/** Roles a person can choose at sign-up. Admins are created by other admins or the seed. */
export const SELF_SERVE_ROLES = ["buyer", "nri", "owner", "agent"] as const;

export const PERMISSIONS = {
  "listings:read": ["guest", "buyer", "nri", "owner", "agent"],
  "saved:manage": ["buyer", "nri"],
  "visits:request": ["buyer", "nri"],
  "visits:read_own": ["buyer", "nri"],
  "concierge:request": ["nri"],
  "listings:write_own": ["owner", "agent"],
  "leads:read_own": ["owner", "agent"],
  "projects:manage": ["agent"],
  "users:manage": [],
  "audit:read": [],
} as const satisfies Record<string, readonly Actor[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(actor: Actor, permission: Permission) {
  return actor === "admin" || (PERMISSIONS[permission] as readonly Actor[]).includes(actor);
}

export function permissionsFor(actor: Actor): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(actor, p));
}

/** Middleware: 401 without a session, 403 without the permission. */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const actor: Actor = req.user?.role ?? "guest";
    if (!can(actor, permission)) {
      if (!req.user) return next(new HttpError(401, "Please sign in to continue", "unauthenticated"));
      return next(new HttpError(403, "Your account type can't do this", "forbidden"));
    }
    next();
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, "Please sign in to continue", "unauthenticated"));
  next();
}
