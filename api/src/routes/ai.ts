import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { chatInputSchema, contextSchema, respond, starterSuggestions } from "../ai/assistant.js";
import { requirePermission } from "../auth/rbac.js";
import { cookieOptions } from "../auth/session.js";
import { config } from "../config.js";
import { audit } from "../lib/audit.js";
import { parse } from "../lib/http.js";
import { AiLog, Lead } from "../models/ai.js";
import { Listing } from "../models/listing.js";

export const aiRouter = Router();

/** Stable key per visitor for daily AI limits: account id, else an anonymous cookie. */
function visitorKey(req: Request, res: Response) {
  if (req.user) return `u:${req.user.id}`;
  let anon = req.cookies?.[config.anonCookie] as string | undefined;
  if (!anon || !/^[0-9a-f-]{36}$/.test(anon)) {
    anon = randomUUID();
    res.cookie(config.anonCookie, anon, { ...cookieOptions(), maxAge: 365 * 86_400_000 });
  }
  return `a:${anon}`;
}

const chatLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 40, standardHeaders: "draft-7", legacyHeaders: false });

aiRouter.post("/chat", chatLimiter, async (req, res) => {
  const input = parse(chatInputSchema, req.body);
  res.json(await respond(input, visitorKey(req, res)));
});

/** Personalised greeting and starter prompts. Rule-based: costs no AI quota. */
aiRouter.get("/suggestions", (req, res) => {
  const ctx = parse(contextSchema, req.query);
  res.json(starterSuggestions(ctx));
});

/* ───────────── Leads ───────────── */

export const leadsRouter = Router();
const leadLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });

const leadSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a phone number with country code"),
  preferredTime: z.string().trim().max(60).optional(),
  timeZone: z.string().max(60).optional(),
  message: z.string().trim().max(500).optional(),
  listingIds: z.array(z.string().max(20)).max(10).default([]),
  filters: z.record(z.unknown()).optional(),
  source: z.enum(["assistant", "listing", "nri"]).default("assistant"),
  /** The visitor must agree to be contacted (DPDP: purpose-specific consent). */
  consent: z.literal(true, { errorMap: () => ({ message: "Please agree to be contacted" }) }),
});

leadsRouter.post("/", leadLimiter, async (req, res) => {
  const body = parse(leadSchema, req.body);
  const { consent, ...data } = body;
  void consent;
  const lead = await Lead.create({ ...data, userId: req.user?.id, anonId: req.cookies?.[config.anonCookie] });
  await audit(req, "lead.create", String(lead._id), { source: body.source, listings: body.listingIds.length });
  res.status(201).json({ id: String(lead._id), status: lead.status });
});

/** Owners and agents see leads that mention their listings. */
leadsRouter.get("/mine", requirePermission("leads:read_own"), async (req, res) => {
  const mine = (await Listing.find({ ownerId: req.user!.id }, { _id: 1 }).lean()).map((l) => String(l._id));
  const items = await Lead.find({ listingIds: { $in: mine } }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ items: items.map(({ anonId, ...l }) => (void anonId, l)) });
});

/* ───────────── Admin: leads and AI monitoring ───────────── */

export const aiAdminRouter = Router();

aiAdminRouter.get("/leads", requirePermission("users:manage"), async (_req, res) => {
  res.json({ items: await Lead.find().sort({ createdAt: -1 }).limit(200).lean() });
});

aiAdminRouter.get("/ai-stats", requirePermission("audit:read"), async (_req, res) => {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [byMode, byIntent, latency, errors, tools] = await Promise.all([
    AiLog.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: "$mode", n: { $sum: 1 } } }]),
    AiLog.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: "$intent", n: { $sum: 1 } } }]),
    AiLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$mode", avgMs: { $avg: "$latencyMs" }, tokens: { $sum: { $ifNull: ["$tokens", 0] } }, zeroResults: { $sum: { $cond: [{ $eq: ["$results", 0] }, 1, 0] } } } },
    ]),
    AiLog.find({ error: { $exists: true } }).sort({ createdAt: -1 }).limit(10).select("error createdAt mode").lean(),
    AiLog.aggregate([{ $match: { createdAt: { $gte: since } } }, { $unwind: "$toolCalls" }, { $group: { _id: "$toolCalls", n: { $sum: 1 } } }]),
  ]);
  res.json({ since, byMode, byIntent, latency, errors, tools });
});
