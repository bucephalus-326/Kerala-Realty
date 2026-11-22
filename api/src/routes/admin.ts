/**
 * Admin console API. Every route requires an admin-only permission.
 * All decisions are written to the audit trail.
 */
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ensureEmbeddings } from "../ai/search.js";
import { requirePermission, ROLES } from "../auth/rbac.js";
import { forgetSession } from "../auth/session.js";
import { audit } from "../lib/audit.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { getSettings, invalidateSettings } from "../lib/settings.js";
import { listFiles } from "../lib/storage.js";
import { AiLog, Lead } from "../models/ai.js";
import { AuditLog, Visit } from "../models/activity.js";
import { Report, Settings } from "../models/admin.js";
import { Listing, ListingView } from "../models/listing.js";
import { publicUser, User, type UserDoc } from "../models/user.js";
import { toClient } from "./listings.js";
import { docToClient } from "./media.js";

export const adminRouter = Router();

const page = z.coerce.number().int().min(1).default(1);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const day = (d: Date) => d.toISOString().slice(0, 10);

/* ───────────── Users ───────────── */

adminRouter.get("/users", requirePermission("users:manage"), async (req, res) => {
  const q = parse(
    z.object({
      q: z.string().max(60).optional(),
      role: z.enum(ROLES).optional(),
      status: z.enum(["active", "suspended"]).optional(),
      verification: z.enum(["not_required", "pending", "verified", "rejected"]).optional(),
      page,
    }),
    req.query,
  );
  const filter: Record<string, unknown> = {};
  if (q.role) filter.role = q.role;
  if (q.status) filter.status = q.status === "active" ? { $ne: "suspended" } : "suspended";
  if (q.verification) filter.verification = q.verification;
  if (q.q) filter.$or = [{ name: new RegExp(esc(q.q), "i") }, { email: new RegExp(esc(q.q), "i") }, { company: new RegExp(esc(q.q), "i") }];
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * 50).limit(50),
    User.countDocuments(filter),
  ]);
  const counts = await Listing.aggregate([{ $match: { ownerId: { $in: users.map((u) => u._id) } } }, { $group: { _id: "$ownerId", n: { $sum: 1 } } }]);
  const byOwner = new Map(counts.map((c) => [String(c._id), c.n as number]));
  res.json({
    total,
    items: users.map((u) => ({ ...publicUser(u as UserDoc), createdAt: u.createdAt, lastLoginAt: u.lastLoginAt ?? null, listings: byOwner.get(String(u._id)) ?? 0, suspendedReason: u.suspendedReason ?? null })),
  });
});

const userPatch = z.object({
  role: z.enum(ROLES).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  suspendedReason: z.string().trim().max(200).optional(),
  verification: z.enum(["not_required", "pending", "verified", "rejected"]).optional(),
});

adminRouter.patch("/users/:id", requirePermission("users:manage"), async (req, res) => {
  const body = parse(userPatch, req.body);
  if (String(req.params.id) === req.user!.id && (body.role || body.status === "suspended")) {
    throw new HttpError(400, "You can't change your own role or suspend yourself", "self_change");
  }
  const user = await User.findById(String(req.params.id));
  if (!user) throw notFound("User");
  const before = { role: user.role, status: user.status, verification: user.verification };
  if (body.role && body.role !== user.role) {
    user.role = body.role;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1; // signs them out so the new role applies at once
  }
  if (body.status && body.status !== user.status) {
    user.status = body.status;
    user.suspendedReason = body.status === "suspended" ? body.suspendedReason : undefined;
    if (body.status === "suspended") user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  }
  if (body.verification && body.verification !== user.verification) {
    user.verification = body.verification;
    // Their listings carry the "verified owner" badge only while they are verified.
    await Listing.updateMany({ ownerId: user._id }, { $set: { verified: body.verification === "verified" } });
  }
  await user.save();
  forgetSession(String(user._id));
  await audit(req, "admin.user_update", String(user._id), { before, after: { role: user.role, status: user.status, verification: user.verification } });
  res.json({ ...publicUser(user as UserDoc), suspendedReason: user.suspendedReason ?? null });
});

/* ───────────── Verification and documents ───────────── */

adminRouter.get("/verifications", requirePermission("users:manage"), async (_req, res) => {
  const users = await User.find({ role: { $in: ["owner", "agent"] }, verification: { $in: ["pending", "rejected"] } }).sort({ createdAt: 1 }).limit(100);
  const docs = await listFiles("documents", { "metadata.ownerId": { $in: users.map((u) => String(u._id)) } });
  res.json({
    items: users.map((u) => ({
      user: publicUser(u as UserDoc),
      createdAt: u.createdAt,
      documents: docs.filter((d) => d.metadata?.ownerId === String(u._id)).map(docToClient),
    })),
  });
});

adminRouter.post("/documents/:id/review", requirePermission("users:manage"), async (req, res) => {
  const body = parse(z.object({ decision: z.enum(["verified", "rejected"]), note: z.string().trim().max(300).optional() }), req.body);
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound("Document");
  const r = await mongoose.connection.db!.collection("documents.files").findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(String(req.params.id)) },
    { $set: { "metadata.review": body.decision, "metadata.reviewNote": body.note ?? null, "metadata.reviewedAt": new Date() } },
    { returnDocument: "after" },
  );
  if (!r) throw notFound("Document");
  await audit(req, `admin.document_${body.decision}`, String(req.params.id), { note: body.note });
  res.json(docToClient(r as never));
});

/* ───────────── Listings: review queue, takedown, featured ───────────── */

adminRouter.get("/listings", requirePermission("listings:moderate"), async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(["pending", "published", "rejected", "draft", "sold", "rented", "unavailable"]).default("pending"),
      featured: z.enum(["true"]).optional(),
      q: z.string().max(60).optional(),
      page,
    }),
    req.query,
  );
  const filter: Record<string, unknown> = { status: q.status };
  if (q.featured) filter.featured = true;
  if (q.q) filter.$or = [{ _id: q.q.toUpperCase() }, { title: new RegExp(esc(q.q), "i") }, { locality: new RegExp(esc(q.q), "i") }];
  const items = await Listing.find(filter).sort(q.status === "pending" ? { submittedAt: 1 } : { updatedAt: -1 }).skip((q.page - 1) * 50).limit(50).lean();
  const owners = await User.find({ _id: { $in: items.map((l) => l.ownerId) } }, { name: 1, company: 1, verification: 1, role: 1 }).lean();
  const byId = new Map(owners.map((o) => [String(o._id), o]));
  const reports = await Report.aggregate([{ $match: { listingId: { $in: items.map((l) => String(l._id)) }, status: "open" } }, { $group: { _id: "$listingId", n: { $sum: 1 } } }]);
  const openReports = new Map(reports.map((r) => [r._id as string, r.n as number]));
  res.json({
    items: items.map((l) => {
      const o = byId.get(String(l.ownerId));
      return {
        ...toClient(l),
        owner: o ? { id: String(o._id), name: o.company ?? o.name, role: o.role, verification: o.verification } : null,
        documents: (l.documentIds ?? []).length,
        openReports: openReports.get(String(l._id)) ?? 0,
      };
    }),
  });
});

adminRouter.post("/listings/:id/review", requirePermission("listings:moderate"), async (req, res) => {
  const body = parse(z.object({ decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).optional() }), req.body);
  if (body.decision === "reject" && !body.note) throw new HttpError(400, "Tell the owner what to change", "note_required");
  const l = await Listing.findOne({ _id: String(req.params.id), status: "pending" });
  if (!l) throw notFound("Pending listing");
  const owner = await User.findById(l.ownerId, { verification: 1 }).lean();
  l.status = body.decision === "approve" ? "published" : "rejected";
  l.reviewNote = body.note;
  if (body.decision === "approve") {
    l.publishedAt = new Date();
    l.verified = owner?.verification === "verified";
  }
  await l.save();
  await audit(req, `listing.${body.decision}`, l.id, { note: body.note });
  if (body.decision === "approve") ensureEmbeddings().catch(() => {});
  res.json(toClient(l.toObject()));
});

adminRouter.post("/listings/:id/takedown", requirePermission("listings:moderate"), async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(5).max(500) }), req.body);
  const l = await Listing.findOne({ _id: String(req.params.id), status: { $in: ["published", "sold", "rented", "unavailable", "pending"] } });
  if (!l) throw notFound("Listing");
  l.status = "rejected";
  l.reviewNote = reason;
  l.featured = false;
  await l.save();
  await Report.updateMany({ listingId: l.id, status: "open" }, { $set: { status: "actioned", resolution: reason, resolvedBy: req.user!.id } });
  await audit(req, "listing.takedown", l.id, { reason });
  res.json(toClient(l.toObject()));
});

adminRouter.post("/listings/:id/feature", requirePermission("listings:moderate"), async (req, res) => {
  const { featured } = parse(z.object({ featured: z.boolean() }), req.body);
  const l = await Listing.findOne({ _id: String(req.params.id) });
  if (!l) throw notFound("Listing");
  if (featured && l.status !== "published") throw new HttpError(409, "Only live listings can be featured", "bad_state");
  l.featured = featured;
  await l.save();
  await audit(req, featured ? "listing.feature" : "listing.unfeature", l.id);
  res.json(toClient(l.toObject()));
});

/* ───────────── Reports ───────────── */

adminRouter.get("/reports", requirePermission("reports:manage"), async (req, res) => {
  const q = parse(z.object({ status: z.enum(["open", "dismissed", "actioned"]).default("open") }), req.query);
  const reports = await Report.find({ status: q.status }).sort({ createdAt: -1 }).limit(200).populate<{ reporterId: { name: string } | null }>("reporterId", "name").lean();
  const listings = await Listing.find({ _id: { $in: reports.map((r) => r.listingId) } }, { title: 1, status: 1, locality: 1, images: 1 }).lean();
  const byId = new Map(listings.map((l) => [String(l._id), l]));
  res.json({
    items: reports.map((r) => {
      const l = byId.get(r.listingId);
      return {
        id: String(r._id),
        listingId: r.listingId,
        listing: l ? { title: l.title, status: l.status, locality: l.locality, image: l.images?.[0] } : null,
        reason: r.reason,
        details: r.details ?? null,
        reporter: r.reporterId?.name ?? "Anonymous visitor",
        status: r.status,
        resolution: r.resolution ?? null,
        createdAt: r.createdAt,
      };
    }),
  });
});

adminRouter.post("/reports/:id", requirePermission("reports:manage"), async (req, res) => {
  const body = parse(z.object({ action: z.enum(["dismiss", "takedown"]), note: z.string().trim().min(3).max(500) }), req.body);
  const r = await Report.findOne({ _id: String(req.params.id), status: "open" });
  if (!r) throw notFound("Open report");
  if (body.action === "takedown") {
    await Listing.updateOne({ _id: r.listingId }, { $set: { status: "rejected", reviewNote: `Removed after a report: ${body.note}`, featured: false } });
    // Close every open report on the same listing.
    await Report.updateMany({ listingId: r.listingId, status: "open" }, { $set: { status: "actioned", resolution: body.note, resolvedBy: req.user!.id } });
  } else {
    r.status = "dismissed";
    r.resolution = body.note;
    r.set("resolvedBy", req.user!.id);
    await r.save();
  }
  await audit(req, `report.${body.action}`, String(r._id), { listingId: r.listingId, note: body.note });
  res.json({ ok: true });
});

/* ───────────── Analytics ───────────── */

adminRouter.get("/analytics", requirePermission("analytics:read"), async (req, res) => {
  const { days } = parse(z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }), req.query);
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const dayKeys = [...Array(days)].map((_, i) => day(new Date(since.getTime() + i * 86_400_000)));
  const perDay = (rows: { _id: string; n: number }[]) => {
    const m = new Map(rows.map((r) => [r._id, r.n]));
    return dayKeys.map((d) => ({ day: d, n: m.get(d) ?? 0 }));
  };
  const byDay = (model: mongoose.Model<never>, extra: Record<string, unknown> = {}) =>
    model.aggregate([{ $match: { createdAt: { $gte: since }, ...extra } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, n: { $sum: 1 } } }]);

  const [usersByRole, listingsByStatus, listingsByCity, newUsers, leads, visits, views, topListings, reportsOpen, pending, ai] = await Promise.all([
    User.aggregate([{ $group: { _id: "$role", n: { $sum: 1 } } }]),
    Listing.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    Listing.aggregate([{ $match: { status: "published" } }, { $group: { _id: "$city", n: { $sum: 1 } } }]),
    byDay(User as never),
    byDay(Lead as never),
    byDay(Visit as never, { status: { $ne: "cancelled" } }),
    ListingView.aggregate([{ $match: { day: { $gte: dayKeys[0] } } }, { $group: { _id: "$day", n: { $sum: 1 } } }]),
    ListingView.aggregate([{ $match: { day: { $gte: dayKeys[0] } } }, { $group: { _id: "$listingId", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
    Report.countDocuments({ status: "open" }),
    Listing.countDocuments({ status: "pending" }),
    AiLog.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: "$mode", n: { $sum: 1 } } }]),
  ]);
  const topIds = topListings.map((t) => t._id as string);
  const titles = new Map((await Listing.find({ _id: { $in: topIds } }, { title: 1, locality: 1 }).lean()).map((l) => [String(l._id), l]));
  const pendingVerification = await User.countDocuments({ role: { $in: ["owner", "agent"] }, verification: "pending" });
  res.json({
    days,
    totals: {
      users: usersByRole.reduce((a, r) => a + r.n, 0),
      live: listingsByStatus.find((r) => r._id === "published")?.n ?? 0,
      pendingReview: pending,
      pendingVerification,
      openReports: reportsOpen,
    },
    usersByRole,
    listingsByStatus,
    listingsByCity,
    series: { newUsers: perDay(newUsers), leads: perDay(leads), visits: perDay(visits), views: perDay(views) },
    topListings: topListings.map((t) => ({ id: t._id, views: t.n, title: titles.get(t._id)?.title ?? t._id, locality: titles.get(t._id)?.locality ?? "" })),
    ai,
  });
});

/* ───────────── Activity log ───────────── */

adminRouter.get("/audit", requirePermission("audit:read"), async (req, res) => {
  const q = parse(z.object({ action: z.string().max(40).optional(), role: z.string().max(20).optional(), actor: z.string().max(40).optional(), page }), req.query);
  const filter: Record<string, unknown> = {};
  if (q.action) filter.action = new RegExp(`^${esc(q.action)}`);
  if (q.role) filter.actorRole = q.role;
  if (q.actor && mongoose.isValidObjectId(q.actor)) filter.actorId = q.actor;
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * 100).limit(100).populate<{ actorId: { name: string; email: string } | null }>("actorId", "name email").lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({
    total,
    items: items.map((a) => ({ ...a, actor: a.actorId ? { name: a.actorId.name, email: a.actorId.email } : null, actorId: undefined })),
  });
});

/* ───────────── Settings ───────────── */

adminRouter.get("/settings", requirePermission("settings:manage"), async (_req, res) => {
  res.json(await getSettings());
});

const settingsSchema = z.object({
  announcement: z.object({ text: z.string().trim().max(200), active: z.boolean() }).optional(),
  ai: z.object({ dailyPerVisitor: z.number().int().min(0).max(500), globalDaily: z.number().int().min(0).max(100_000), enabled: z.boolean() }).partial().optional(),
  uploads: z.object({ maxFiles: z.number().int().min(1).max(1000), maxMB: z.number().int().min(1).max(500) }).partial().optional(),
});

adminRouter.put("/settings", requirePermission("settings:manage"), async (req, res) => {
  const body = parse(settingsSchema, req.body);
  const set: Record<string, unknown> = {};
  for (const [group, values] of Object.entries(body)) for (const [k, v] of Object.entries(values ?? {})) set[`${group}.${k}`] = v;
  await Settings.updateOne({ _id: "platform" }, { $set: set }, { upsert: true });
  invalidateSettings();
  await audit(req, "admin.settings", "platform", set);
  res.json(await getSettings());
});
