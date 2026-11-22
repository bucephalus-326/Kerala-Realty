import type { Request } from "express";
import { AuditLog } from "../models/activity.js";

/** Record an action. Never throws: auditing must not break the request. */
export async function audit(req: Request, action: string, target?: string, meta?: Record<string, unknown>) {
  try {
    await AuditLog.create({ actorId: req.user?.id, actorRole: req.user?.role ?? "guest", action, target, meta });
  } catch (e) {
    console.warn("audit failed", e);
  }
}
