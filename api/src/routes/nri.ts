import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "../auth/rbac.js";
import { audit } from "../lib/audit.js";
import { notFound, parse } from "../lib/http.js";
import { ConciergeRequest, Visit } from "../models/activity.js";
import { Listing } from "../models/listing.js";
import { publicUser, User, type UserDoc } from "../models/user.js";
import { publicView as toClient } from "./listings.js";
import { visitToClient } from "./me.js";

export const nriRouter = Router();
nriRouter.use(requirePermission("concierge:request"));

/** One call for the NRI dashboard: profile, shortlist, upcoming visits, concierge requests. */
nriRouter.get("/dashboard", async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw notFound("User");
  const [shortlist, visits, requests] = await Promise.all([
    Listing.find({ _id: { $in: user.saved } }).lean(),
    Visit.find({ userId: user._id, slot: { $gte: new Date(Date.now() - 86_400_000) }, status: { $ne: "cancelled" } }).sort({ slot: 1 }).lean(),
    ConciergeRequest.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  const byId = new Map(shortlist.map((l) => [String(l._id), l]));
  const missing = visits.filter((v) => !byId.has(v.listingId)).map((v) => v.listingId);
  if (missing.length) for (const l of await Listing.find({ _id: { $in: missing } }).lean()) byId.set(String(l._id), l);
  res.json({
    user: publicUser(user as UserDoc),
    advisor: { name: "Anjali Menon", title: "NRI property advisor", languages: ["English", "Malayalam", "Hindi"], whatsapp: "919000000000" },
    shortlist: shortlist.map(toClient),
    visits: visits.map((v) => visitToClient(v, byId.get(v.listingId))),
    requests: requests.map((r) => ({ id: String(r._id), service: r.service, message: r.message, status: r.status, createdAt: r.createdAt })),
  });
});

const requestSchema = z.object({
  service: z.enum(["shortlist", "legal", "visit", "documents", "after_sales", "other"]),
  message: z.string().trim().min(5).max(1000),
  listingIds: z.array(z.string().max(20)).max(20).optional(),
});

nriRouter.post("/requests", async (req, res) => {
  const body = parse(requestSchema, req.body);
  const r = await ConciergeRequest.create({ ...body, userId: req.user!.id });
  await audit(req, "concierge.request", String(r._id), { service: body.service });
  res.status(201).json({ id: String(r._id), service: r.service, message: r.message, status: r.status, createdAt: r.createdAt });
});
