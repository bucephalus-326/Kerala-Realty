import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requirePermission } from "../auth/rbac.js";
import { notFound, parse } from "../lib/http.js";
import { Listing, ListingView } from "../models/listing.js";

export const listingsRouter = Router();

const querySchema = z.object({
  purpose: z.enum(["buy", "rent"]).optional(),
  type: z.enum(["villa", "house", "apartment", "plot", "commercial"]).optional(),
  budgetMax: z.coerce.number().positive().optional(),
  city: z.string().max(40).optional(),
  q: z.string().max(60).optional(),
  ids: z.string().max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(24),
  page: z.coerce.number().int().min(1).default(1),
});

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

listingsRouter.get("/", requirePermission("listings:read"), async (req, res) => {
  const q = parse(querySchema, req.query);
  const filter: Record<string, unknown> = { status: "published" };
  if (q.purpose) filter.purpose = q.purpose;
  if (q.type) filter.type = q.type;
  if (q.city) filter.city = q.city;
  if (q.budgetMax) filter.price = { $lte: q.budgetMax * 1.1 };
  if (q.ids) filter._id = { $in: q.ids.split(",").slice(0, 100) };
  if (q.q) {
    const rx = new RegExp(escape(q.q), "i");
    filter.$or = [{ locality: rx }, { city: rx }, { title: rx }];
  }
  const [items, total] = await Promise.all([
    Listing.find(filter).sort({ postedAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Listing.countDocuments(filter),
  ]);
  res.json({ items: items.map(publicView), total, page: q.page });
});

/** Count a page view once per visitor per day. Never fails the page. */
const viewLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false });

listingsRouter.post("/:id/view", viewLimiter, async (req, res) => {
  const id = String(req.params.id);
  // Only real, live listings are counted; made-up ids never create rows.
  if (!/^L\d{3,6}$/.test(id) || !(await Listing.exists({ _id: id, status: "published" }))) return res.json({ ok: true });
  const visitor = req.user ? `u:${req.user.id}` : `a:${String(req.cookies?.kr_anon ?? req.ip)}`;
  await ListingView.updateOne(
    { listingId: id, day: new Date().toISOString().slice(0, 10), visitor },
    { $setOnInsert: { listingId: id } },
    { upsert: true },
  ).catch(() => {});
  res.json({ ok: true });
});

listingsRouter.get("/:id", requirePermission("listings:read"), async (req, res) => {
  const l = await Listing.findOne({ _id: String(req.params.id), status: "published" }).lean();
  if (!l) throw notFound("Listing");
  res.json(publicView(l));
});

/** Public shape: hides vault document ids and moderation notes. */
export function publicView(l: object) {
  const { documentIds, reviewNote, submittedAt, ...rest } = toClient(l) as Record<string, unknown>;
  void documentIds;
  void reviewNote;
  void submittedAt;
  return rest;
}

/** Back to the web app's shape: `id` and `coords` instead of `_id` and GeoJSON. */
export function toClient(l: object) {
  const { _id, location, ownerId, __v, ...rest } = l as Record<string, unknown> & { location?: { coordinates: number[] } | null };
  void ownerId;
  void __v;
  return { id: _id, coords: location?.coordinates, ...rest };
}
