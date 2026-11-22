import { Router } from "express";
import { z } from "zod";
import { requirePermission, ROLES } from "../auth/rbac.js";
import { parse } from "../lib/http.js";
import { AuditLog } from "../models/activity.js";
import { Listing } from "../models/listing.js";
import { audit } from "../lib/audit.js";
import { notFound } from "../lib/http.js";
import { toClient } from "./listings.js";
import { ensureEmbeddings } from "../ai/search.js";
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

/** Listings awaiting review (full console UI arrives with the admin stage). */
adminRouter.get("/listings", requirePermission("users:manage"), async (req, res) => {
  const q = parse(z.object({ status: z.enum(["pending", "published", "rejected", "draft"]).default("pending") }), req.query);
  const items = await Listing.find({ status: q.status }).sort({ submittedAt: 1 }).limit(200).lean();
  res.json({ items: items.map((l) => toClient(l)) });
});

adminRouter.post("/listings/:id/review", requirePermission("users:manage"), async (req, res) => {
  const body = parse(z.object({ decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).optional() }), req.body);
  const l = await Listing.findOne({ _id: String(req.params.id), status: "pending" });
  if (!l) throw notFound("Pending listing");
  l.status = body.decision === "approve" ? "published" : "rejected";
  l.reviewNote = body.note;
  if (body.decision === "approve") l.publishedAt = new Date();
  await l.save();
  await audit(req, `listing.${body.decision}`, l.id, { note: body.note });
  if (body.decision === "approve") ensureEmbeddings().catch(() => {});
  res.json(toClient(l.toObject()));
});
