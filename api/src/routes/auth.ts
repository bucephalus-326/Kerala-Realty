import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { permissionsFor, requireAuth, SELF_SERVE_ROLES } from "../auth/rbac.js";
import { endSession, startSession } from "../auth/session.js";
import { audit } from "../lib/audit.js";
import { HttpError, parse } from "../lib/http.js";
import { publicUser, User, type UserDoc } from "../models/user.js";

export const authRouter = Router();

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false });

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8, "Use at least 8 characters").max(128),
  role: z.enum(SELF_SERVE_ROLES).default("buyer"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a phone number with country code")
    .optional(),
  company: z.string().trim().max(120).optional(),
  country: z.string().trim().max(60).optional(),
  timeZone: z.string().max(60).optional(),
  currency: z.enum(["INR", "AED", "USD", "QAR"]).optional(),
  /** Properties saved while signed out, merged into the new account. */
  saved: z.array(z.string().max(20)).max(200).optional(),
});

authRouter.post("/register", limiter, async (req, res) => {
  const body = parse(registerSchema, req.body);
  if (await User.exists({ email: body.email.toLowerCase() })) {
    throw new HttpError(409, "An account with this email already exists", "email_taken");
  }
  const user = await User.create({
    name: body.name,
    email: body.email,
    passwordHash: await bcrypt.hash(body.password, 11),
    role: body.role,
    phone: body.phone,
    company: body.company,
    verification: body.role === "owner" || body.role === "agent" ? "pending" : "not_required",
    preferences: {
      currency: body.currency ?? (body.role === "nri" ? "AED" : "INR"),
      timeZone: body.timeZone ?? "Asia/Kolkata",
      country: body.country,
    },
    saved: [...new Set(body.saved ?? [])],
  });
  startSession(res, { id: String(user._id), role: user.role });
  req.user = { id: String(user._id), role: user.role };
  await audit(req, "auth.register", String(user._id), { role: user.role });
  res.status(201).json({ user: publicUser(user as UserDoc), permissions: permissionsFor(user.role) });
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  saved: z.array(z.string().max(20)).max(200).optional(),
});

authRouter.post("/login", limiter, async (req, res) => {
  const body = parse(loginSchema, req.body);
  const user = await User.findOne({ email: body.email.toLowerCase() }).select("+passwordHash");
  // Same message and similar timing whether the email exists or not.
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? "$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!user || !ok) {
    await audit(req, "auth.login_failed", undefined, { email: body.email.toLowerCase() });
    throw new HttpError(401, "Email or password is incorrect", "bad_credentials");
  }
  if (body.saved?.length) user.saved = [...new Set([...user.saved, ...body.saved])];
  user.lastLoginAt = new Date();
  await user.save();
  startSession(res, { id: String(user._id), role: user.role });
  req.user = { id: String(user._id), role: user.role };
  await audit(req, "auth.login", String(user._id));
  res.json({ user: publicUser(user as UserDoc), permissions: permissionsFor(user.role) });
});

authRouter.post("/logout", async (req, res) => {
  if (req.user) await audit(req, "auth.logout", req.user.id);
  endSession(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) {
    endSession(res);
    throw new HttpError(401, "Session expired", "unauthenticated");
  }
  res.json({ user: publicUser(user as UserDoc), permissions: permissionsFor(user.role) });
});
