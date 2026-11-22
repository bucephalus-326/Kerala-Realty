import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/rbac.js";
import { audit } from "../lib/audit.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { formatIn, hourIn, isValidTimeZone } from "../lib/time.js";
import { Visit } from "../models/activity.js";
import { Listing } from "../models/listing.js";
import { publicUser, User, type UserDoc } from "../models/user.js";
import { publicView as toClient } from "./listings.js";

export const meRouter = Router();
meRouter.use(requireAuth);

/* ── Preferences ── */
const prefSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/).optional(),
  currency: z.enum(["INR", "AED", "USD", "QAR"]).optional(),
  timeZone: z.string().max(60).refine(isValidTimeZone, "Unknown time zone").optional(),
  country: z.string().trim().max(60).optional(),
});

meRouter.patch("/", async (req, res) => {
  const body = parse(prefSchema, req.body);
  const set: Record<string, unknown> = {};
  if (body.name) set.name = body.name;
  if (body.phone) set.phone = body.phone;
  if (body.currency) set["preferences.currency"] = body.currency;
  if (body.timeZone) set["preferences.timeZone"] = body.timeZone;
  if (body.country !== undefined) set["preferences.country"] = body.country;
  const user = await User.findByIdAndUpdate(req.user!.id, { $set: set }, { new: true });
  if (!user) throw notFound("User");
  res.json({ user: publicUser(user as UserDoc) });
});

/* ── Own listings (owners and agents) ── */
meRouter.get("/listings", requirePermission("listings:write_own"), async (req, res) => {
  const items = await Listing.find({ ownerId: req.user!.id }).sort({ postedAt: -1 }).lean();
  const visits = await Visit.aggregate([
    { $match: { listingId: { $in: items.map((l) => l._id) }, status: { $ne: "cancelled" } } },
    { $group: { _id: "$listingId", n: { $sum: 1 } } },
  ]);
  const visitCount = new Map(visits.map((v) => [v._id as string, v.n as number]));
  res.json({ items: items.map((l) => ({ ...toClient(l), visitRequests: visitCount.get(String(l._id)) ?? 0 })) });
});

/* ── Saved properties ── */
meRouter.get("/saved", requirePermission("saved:manage"), async (req, res) => {
  const user = await User.findById(req.user!.id).lean();
  const items = await Listing.find({ _id: { $in: user?.saved ?? [] } }).lean();
  res.json({ ids: user?.saved ?? [], items: items.map(toClient) });
});

meRouter.put("/saved/:listingId", requirePermission("saved:manage"), async (req, res) => {
  const id = String(req.params.listingId);
  if (!(await Listing.exists({ _id: id }))) throw notFound("Listing");
  const user = await User.findByIdAndUpdate(req.user!.id, { $addToSet: { saved: id } }, { new: true });
  res.json({ ids: user?.saved ?? [] });
});

meRouter.delete("/saved/:listingId", requirePermission("saved:manage"), async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user!.id, { $pull: { saved: String(req.params.listingId) } }, { new: true });
  res.json({ ids: user?.saved ?? [] });
});

/* ── Visits (in person or live video tour) ── */
const visitSchema = z.object({
  listingId: z.string().max(20),
  mode: z.enum(["in_person", "video"]),
  slot: z.string().datetime({ offset: true }),
  timeZone: z.string().max(60).refine(isValidTimeZone, "Unknown time zone"),
  note: z.string().trim().max(500).optional(),
});

const VISIT_HOURS_IST = { from: 9, to: 20 }; // last slot starts before 20:00 IST

meRouter.post("/visits", requirePermission("visits:request"), async (req, res) => {
  const body = parse(visitSchema, req.body);
  const listing = await Listing.findOne({ _id: body.listingId, status: "published" }).lean();
  if (!listing) throw notFound("Listing");
  const slot = new Date(body.slot);
  const now = Date.now();
  if (slot.getTime() < now + 2 * 3_600_000) throw new HttpError(400, "Pick a time at least 2 hours from now", "slot_too_soon");
  if (slot.getTime() > now + 60 * 86_400_000) throw new HttpError(400, "Pick a time within the next 60 days", "slot_too_far");
  const h = hourIn(slot, "Asia/Kolkata");
  if (h < VISIT_HOURS_IST.from || h >= VISIT_HOURS_IST.to) {
    throw new HttpError(400, "Visits and tours run 9 AM to 8 PM Kerala time (IST)", "outside_hours");
  }
  const clash = await Visit.exists({ userId: req.user!.id, listingId: body.listingId, status: { $in: ["requested", "confirmed"] } });
  if (clash) throw new HttpError(409, "You already have a visit booked for this property", "duplicate_visit");

  const visit = await Visit.create({ ...body, slot, userId: req.user!.id });
  await audit(req, "visit.request", String(visit._id), { listingId: body.listingId, mode: body.mode });
  res.status(201).json(visitToClient(visit.toObject(), listing));
});

meRouter.get("/visits", requirePermission("visits:read_own"), async (req, res) => {
  const visits = await Visit.find({ userId: req.user!.id }).sort({ slot: 1 }).lean();
  const listings = await Listing.find({ _id: { $in: visits.map((v) => v.listingId) } }).lean();
  const byId = new Map(listings.map((l) => [String(l._id), l]));
  res.json({ items: visits.map((v) => visitToClient(v, byId.get(v.listingId))) });
});

meRouter.post("/visits/:id/cancel", requirePermission("visits:request"), async (req, res) => {
  const visit = await Visit.findOneAndUpdate(
    { _id: String(req.params.id), userId: req.user!.id, status: { $in: ["requested", "confirmed"] } },
    { $set: { status: "cancelled" } },
    { new: true },
  ).lean();
  if (!visit) throw notFound("Visit");
  await audit(req, "visit.cancel", String(visit._id));
  res.json(visitToClient(visit, await Listing.findById(visit.listingId).lean()));
});

type VisitLean = { _id: unknown; listingId: string; mode: string; slot: Date; timeZone: string; status: string; note?: string | null };

export function visitToClient(v: VisitLean, l?: { title?: string | null; locality?: string | null; images?: string[] | null } | null) {
  return {
    id: String(v._id),
    listingId: v.listingId,
    listing: l ? { title: l.title, locality: l.locality, image: l.images?.[0] } : null,
    mode: v.mode,
    status: v.status,
    note: v.note ?? null,
    slot: v.slot.toISOString(),
    timeZone: v.timeZone,
    local: formatIn(v.slot, v.timeZone),
    ist: formatIn(v.slot, "Asia/Kolkata"),
  };
}
