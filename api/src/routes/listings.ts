import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "../auth/rbac.js";
import { notFound, parse } from "../lib/http.js";
import { Listing } from "../models/listing.js";

export const listingsRouter = Router();

const querySchema = z.object({
  purpose: z.enum(["buy", "rent"]).optional(),
  type: z.enum(["villa", "house", "apartment", "plot", "commercial"]).optional(),
  budgetMax: z.coerce.number().positive().optional(),
  city: z.string().max(40).optional(),
  q: z.string().max(60).optional(),
  ids: z.string().max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
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
  res.json({ items: items.map(toClient), total, page: q.page });
});

listingsRouter.get("/:id", requirePermission("listings:read"), async (req, res) => {
  const l = await Listing.findOne({ _id: String(req.params.id), status: "published" }).lean();
  if (!l) throw notFound("Listing");
  res.json(toClient(l));
});

/** Back to the web app's shape: `id` and `coords` instead of `_id` and GeoJSON. */
export function toClient(l: object) {
  const { _id, location, ownerId, __v, ...rest } = l as Record<string, unknown> & { location?: { coordinates: number[] } | null };
  void ownerId;
  void __v;
  return { id: _id, coords: location?.coordinates, ...rest };
}
