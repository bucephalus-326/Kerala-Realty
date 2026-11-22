/**
 * Owner and agent portal: listings (draft → review → published → sold/rented),
 * visit requests, enquiries and performance.
 */
import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "../auth/rbac.js";
import { audit } from "../lib/audit.js";
import { enrich, inKerala } from "../lib/enrich.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { Lead } from "../models/ai.js";
import { Visit } from "../models/activity.js";
import { Listing, ListingView, nextListingId } from "../models/listing.js";
import { User } from "../models/user.js";
import { toClient } from "./listings.js";

export const portalRouter = Router();
portalRouter.use(requirePermission("listings:write_own"));

/* ───────────── Validation ───────────── */

const RERA_RX = /^K-RERA\/(PRJ|AGT)\/[A-Z]{3}\/\d{3}\/\d{4}$/;
const VIDEO_RX = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=[\w-]{6,}|youtu\.be\/[\w-]{6,}|vimeo\.com\/\d+)/;
const IMAGE_RX = /^(\/api\/media\/[a-f0-9]{24}|\/img\/[\w-]+\.jpg)$/;

const draftSchema = z.object({
  title: z.string().trim().min(5).max(90),
  purpose: z.enum(["buy", "rent"]),
  type: z.enum(["villa", "house", "apartment", "plot", "commercial"]),
  description: z.string().trim().max(2000).optional(),
  price: z.number().positive().max(5_000_000_000).optional(),
  beds: z.number().int().min(0).max(20).optional(),
  baths: z.number().int().min(0).max(20).optional(),
  builtUpSqft: z.number().positive().max(200_000).optional(),
  landCents: z.number().positive().max(10_000).optional(),
  furnishing: z.enum(["furnished", "semi", "unfurnished"]).optional(),
  locality: z.string().trim().min(2).max(60).optional(),
  city: z.enum(["Kochi", "Thiruvananthapuram", "Kozhikode"]).optional(),
  district: z.string().trim().max(40).optional(),
  coords: z
    .tuple([z.number(), z.number()])
    .refine(inKerala, "Pick a location in Kerala")
    .optional(),
  rera: z
    .object({ status: z.enum(["registered", "not_required", "pending"]), number: z.string().trim().max(40).optional() })
    .refine((r) => r.status !== "registered" || RERA_RX.test(r.number ?? ""), { message: "K-RERA number looks wrong (e.g. K-RERA/PRJ/ERN/123/2024)", path: ["number"] })
    .optional(),
  amenities: z.array(z.string().trim().min(2).max(40)).max(20).optional(),
  images: z.array(z.string().regex(IMAGE_RX, "Upload photos first")).max(20).optional(),
  videoUrl: z.union([z.string().regex(VIDEO_RX, "Use a YouTube or Vimeo link"), z.literal("")]).optional(),
  isNewProject: z.boolean().optional(),
  possession: z.string().trim().max(20).optional(),
});
type Draft = z.infer<typeof draftSchema>;

/** Everything a listing needs before it can go to review. */
function readinessErrors(d: Partial<Draft>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.price) e.price = "Add a price";
  if (!d.coords) e.coords = "Pin the location on the map";
  if (!d.locality) e.locality = "Add the locality";
  if (!d.city) e.city = "Choose the city";
  if (!d.images?.length) e.images = "Add at least one photo";
  if (!d.description || d.description.length < 40) e.description = "Write at least a short description (40+ characters)";
  if (d.type === "plot" && !d.landCents) e.landCents = "Add the land area";
  if (d.type !== "plot" && !d.builtUpSqft) e.builtUpSqft = "Add the built-up area";
  if (["villa", "house", "apartment"].includes(d.type ?? "") && !d.beds) e.beds = "Add bedrooms";
  if (!d.rera) e.rera = "Say whether K-RERA applies";
  if (d.isNewProject && d.rera?.status !== "registered") e.rera = "New projects must be K-RERA registered";
  return e;
}

/* ───────────── Helpers ───────────── */

async function own(req: { user?: { id: string } }, id: string) {
  const l = await Listing.findOne({ _id: id, ownerId: req.user!.id, status: { $ne: "removed" } });
  if (!l) throw notFound("Listing");
  return l;
}

function asDraft(l: InstanceType<typeof Listing>): Partial<Draft> {
  const o = l.toObject() as Record<string, unknown> & { location?: { coordinates: [number, number] }; pinned?: boolean };
  return { ...(o as Partial<Draft>), coords: o.pinned === false ? undefined : o.location?.coordinates };
}

function applyDraft(l: InstanceType<typeof Listing>, d: Partial<Draft>) {
  const { coords, ...rest } = d;
  l.set(rest);
  if (coords) {
    l.set({ location: { type: "Point", coordinates: coords }, pinned: true, ...enrich(coords) });
  }
}

function portalView(l: object) {
  const c = toClient(l) as Record<string, unknown>;
  return c;
}

/* ───────────── Listings ───────────── */

portalRouter.get("/listings", async (req, res) => {
  const items = await Listing.find({ ownerId: req.user!.id, status: { $ne: "removed" } })
    .sort({ updatedAt: -1 })
    .lean();
  const ids = items.map((l) => String(l._id));
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [views, visits, leads, saves] = await Promise.all([
    ListingView.aggregate([{ $match: { listingId: { $in: ids }, day: { $gte: since } } }, { $group: { _id: "$listingId", n: { $sum: 1 } } }]),
    Visit.aggregate([{ $match: { listingId: { $in: ids }, status: { $ne: "cancelled" } } }, { $group: { _id: "$listingId", n: { $sum: 1 } } }]),
    Lead.aggregate([{ $match: { listingIds: { $in: ids } } }, { $unwind: "$listingIds" }, { $match: { listingIds: { $in: ids } } }, { $group: { _id: "$listingIds", n: { $sum: 1 } } }]),
    User.aggregate([{ $match: { saved: { $in: ids } } }, { $unwind: "$saved" }, { $match: { saved: { $in: ids } } }, { $group: { _id: "$saved", n: { $sum: 1 } } }]),
  ]);
  const m = (rows: { _id: string; n: number }[]) => new Map(rows.map((r) => [r._id, r.n]));
  const [v, vi, le, sa] = [m(views), m(visits), m(leads), m(saves)];
  res.json({
    items: items.map((l) => ({
      ...portalView(l),
      stats: { views30d: v.get(String(l._id)) ?? 0, visits: vi.get(String(l._id)) ?? 0, leads: le.get(String(l._id)) ?? 0, saves: sa.get(String(l._id)) ?? 0 },
    })),
  });
});

portalRouter.post("/listings", async (req, res) => {
  const d = parse(draftSchema, req.body);
  const user = await User.findById(req.user!.id);
  if (!user) throw notFound("User");
  if (d.isNewProject && user.role !== "agent") throw new HttpError(403, "Only agents and builders can list new projects", "forbidden");
  const id = await nextListingId();
  const l = new Listing({
    _id: id,
    slug: `${d.title}-${d.locality ?? ""}-${id}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    status: "draft",
    ownerId: user._id,
    postedBy: { kind: user.role === "agent" ? (user.company ? "builder" : "agent") : "owner", name: user.role === "agent" ? user.company ?? user.name : "Direct owner" },
    verified: user.verification === "verified",
    postedAt: new Date().toISOString().slice(0, 10),
    // Placeholders until the owner pins a location; drafts are never public.
    price: d.price ?? 0,
    location: { type: "Point", coordinates: d.coords ?? [76.28, 9.98] },
    pinned: false,
    images: [],
  });
  applyDraft(l, d);
  await l.save();
  await audit(req, "listing.create", id);
  res.status(201).json({ ...portalView(l.toObject()), missing: readinessErrors(asDraft(l)) });
});

portalRouter.get("/listings/:id", async (req, res) => {
  const l = await own(req, req.params.id);
  res.json({ ...portalView(l.toObject()), missing: readinessErrors(asDraft(l)) });
});

/** Price, description, photos order, video and amenities apply live; anything else on a live listing goes back to review. */
const LIVE_EDITABLE = new Set(["price", "description", "videoUrl", "amenities", "images"]);

portalRouter.patch("/listings/:id", async (req, res) => {
  const l = await own(req, req.params.id);
  const d = parse(draftSchema.partial(), req.body);
  if (d.isNewProject && req.user!.role !== "agent") throw new HttpError(403, "Only agents and builders can list new projects", "forbidden");
  const changed = Object.keys(d).filter((k) => JSON.stringify((d as Record<string, unknown>)[k]) !== JSON.stringify((asDraft(l) as Record<string, unknown>)[k]));
  applyDraft(l, d);
  let reReview = false;
  if (["published", "sold", "rented", "unavailable"].includes(l.status) && changed.some((k) => !LIVE_EDITABLE.has(k))) {
    l.status = "pending";
    l.submittedAt = new Date();
    reReview = true;
  }
  if (l.status === "rejected") l.status = "draft";
  await l.save();
  await audit(req, "listing.update", l.id, { fields: changed, reReview });
  res.json({ ...portalView(l.toObject()), missing: readinessErrors(asDraft(l)), reReview });
});

portalRouter.post("/listings/:id/submit", async (req, res) => {
  const l = await own(req, req.params.id);
  if (!["draft", "rejected"].includes(l.status)) throw new HttpError(409, "Only drafts can be submitted", "bad_state");
  const missing = readinessErrors(asDraft(l));
  if (Object.keys(missing).length) {
    return res.status(400).json({ error: { code: "incomplete", message: "A few details are missing", fields: Object.fromEntries(Object.entries(missing).map(([k, v]) => [k, [v]])) } });
  }
  l.status = "pending";
  l.submittedAt = new Date();
  l.reviewNote = undefined;
  await l.save();
  await audit(req, "listing.submit", l.id);
  res.json(portalView(l.toObject()));
});

const statusSchema = z.object({ status: z.enum(["published", "sold", "rented", "unavailable"]) });

portalRouter.post("/listings/:id/status", async (req, res) => {
  const l = await own(req, req.params.id);
  const { status } = parse(statusSchema, req.body);
  if (!["published", "sold", "rented", "unavailable"].includes(l.status)) throw new HttpError(409, "Only approved listings can change availability", "bad_state");
  if (status === "sold" && l.purpose !== "buy") throw new HttpError(400, "Rentals are marked rented, not sold", "bad_status");
  if (status === "rented" && l.purpose !== "rent") throw new HttpError(400, "Sale listings are marked sold, not rented", "bad_status");
  l.status = status;
  await l.save();
  await audit(req, "listing.status", l.id, { status });
  res.json(portalView(l.toObject()));
});

portalRouter.delete("/listings/:id", async (req, res) => {
  const l = await own(req, req.params.id);
  // Drafts disappear; anything that was public is kept (hidden) so visit history stays intact.
  if (["draft", "pending", "rejected"].includes(l.status) && !(await Visit.exists({ listingId: l.id }))) await l.deleteOne();
  else {
    l.status = "removed";
    await l.save();
  }
  await audit(req, "listing.delete", l.id);
  res.json({ ok: true });
});

/* ───────────── Performance ───────────── */

portalRouter.get("/listings/:id/stats", async (req, res) => {
  const l = await own(req, req.params.id);
  const days = [...Array(14)].map((_, i) => new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10));
  const [views, saves, visits, leads] = await Promise.all([
    ListingView.aggregate([{ $match: { listingId: l.id, day: { $gte: days[0] } } }, { $group: { _id: "$day", n: { $sum: 1 } } }]),
    User.countDocuments({ saved: l.id }),
    Visit.find({ listingId: l.id }).sort({ slot: 1 }).populate<{ userId: { name: string; phone?: string } }>("userId", "name phone").lean(),
    Lead.find({ listingIds: l.id }).sort({ createdAt: -1 }).lean(),
  ]);
  const byDay = new Map(views.map((v) => [v._id as string, v.n as number]));
  res.json({
    views: days.map((d) => ({ day: d, n: byDay.get(d) ?? 0 })),
    saves,
    visits: { requested: visits.filter((v) => v.status === "requested").length, confirmed: visits.filter((v) => v.status === "confirmed").length, completed: visits.filter((v) => v.status === "completed").length },
    // Interested buyers: people who booked a visit or asked for a call. Savers stay anonymous (a count only).
    interested: [
      ...visits.filter((v) => v.status !== "cancelled").map((v) => ({ name: v.userId?.name ?? "Buyer", via: v.mode === "video" ? "Video tour" : "Visit", at: v.createdAt, status: v.status })),
      ...leads.map((x) => ({ name: x.name, via: "Call-back", at: x.createdAt, status: x.status })),
    ].sort((a, b) => +new Date(b.at!) - +new Date(a.at!)),
  });
});

/* ───────────── Visit requests on my listings ───────────── */

async function myListingIds(userId: string) {
  return (await Listing.find({ ownerId: userId }, { _id: 1 }).lean()).map((l) => String(l._id));
}

portalRouter.get("/visits", async (req, res) => {
  const ids = await myListingIds(req.user!.id);
  const visits = await Visit.find({ listingId: { $in: ids } })
    .sort({ slot: 1 })
    .populate<{ userId: { name: string; phone?: string; email: string } }>("userId", "name phone email")
    .lean();
  const titles = new Map((await Listing.find({ _id: { $in: ids } }, { title: 1 }).lean()).map((l) => [String(l._id), l.title]));
  const fmt = (d: Date, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
  res.json({
    items: visits.map((v) => ({
      id: String(v._id),
      listingId: v.listingId,
      listingTitle: titles.get(v.listingId),
      mode: v.mode,
      status: v.status,
      note: v.note ?? null,
      ist: fmt(v.slot, "Asia/Kolkata"),
      buyerTimeZone: v.timeZone,
      buyer: {
        name: v.userId?.name ?? "Buyer",
        // Contact details are shared only once the owner confirms.
        phone: v.status === "confirmed" || v.status === "completed" ? v.userId?.phone ?? null : null,
        email: v.status === "confirmed" || v.status === "completed" ? v.userId?.email ?? null : null,
      },
    })),
  });
});

const visitAction = z.object({ action: z.enum(["confirm", "decline", "complete"]) });

portalRouter.post("/visits/:id", async (req, res) => {
  const { action } = parse(visitAction, req.body);
  const ids = await myListingIds(req.user!.id);
  const v = await Visit.findOne({ _id: String(req.params.id), listingId: { $in: ids } });
  if (!v) throw notFound("Visit");
  const next = { confirm: "confirmed", decline: "cancelled", complete: "completed" }[action] as "confirmed" | "cancelled" | "completed";
  const allowed: Record<string, string[]> = { confirm: ["requested"], decline: ["requested", "confirmed"], complete: ["confirmed"] };
  if (!allowed[action].includes(v.status)) throw new HttpError(409, `Can't ${action} a ${v.status} visit`, "bad_state");
  v.status = next;
  await v.save();
  await audit(req, `visit.${action}`, String(v._id));
  res.json({ id: String(v._id), status: v.status });
});

/* ───────────── Enquiries ───────────── */

portalRouter.get("/leads", async (req, res) => {
  const ids = await myListingIds(req.user!.id);
  const items = await Lead.find({ listingIds: { $in: ids } }).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ items: items.map(({ anonId, userId, ...l }) => (void anonId, void userId, l)) });
});

portalRouter.post("/leads/:id", async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(["new", "contacted", "closed"]) }), req.body);
  const ids = await myListingIds(req.user!.id);
  const lead = await Lead.findOneAndUpdate({ _id: String(req.params.id), listingIds: { $in: ids } }, { $set: { status } }, { new: true }).lean();
  if (!lead) throw notFound("Lead");
  await audit(req, "lead.status", String(lead._id), { status });
  res.json({ id: String(lead._id), status: lead.status });
});
