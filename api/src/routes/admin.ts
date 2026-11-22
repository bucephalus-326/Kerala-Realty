import { Router } from "express";
import { z } from "zod";
import { requirePermission, ROLES } from "../auth/rbac.js";
import { parse } from "../lib/http.js";
import { AuditLog } from "../models/activity.js";
import { publicUser, User, type UserDoc } from "../models/user.js";

/** Minimal admin endpoints. The full admin console arrives in a later stage. */
export const adminRouter = Router();

adminRouter.get("/users", requirePermission("users:manage"), async (req, res) => {
  const q = parse(z.object({ role: z.enum(ROLES).optional() }), req.query);
  const users = await User.find(q.role ? { role: q.role } : {}).sort({ createdAt: -1 }).limit(200);
  res.json({ items: users.map((u) => publicUser(u as UserDoc)) });
});

adminRouter.get("/audit", requirePermission("audit:read"), async (_req, res) => {
  const items = await AuditLog.find().sort({ createdAt: -1 }).limit(100).lean();
  res.json({ items });
});
