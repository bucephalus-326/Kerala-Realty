import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { cookieOptions } from "../auth/session.js";
import { parse } from "../lib/http.js";
import { Consent } from "../models/activity.js";

/**
 * DPDP Act consent. The browser keeps the choice locally; this stores a record
 * of it (with a random anonymous id, no IP address) so it can be shown on request.
 */
export const consentRouter = Router();

const schema = z.object({
  personalisation: z.boolean(),
  location: z.boolean(),
  analytics: z.boolean(),
});

consentRouter.post("/", async (req, res) => {
  const choices = parse(schema, req.body);
  let anonId = req.cookies?.[config.anonCookie] as string | undefined;
  if (!anonId || !/^[0-9a-f-]{36}$/.test(anonId)) {
    anonId = randomUUID();
    res.cookie(config.anonCookie, anonId, { ...cookieOptions(), maxAge: 365 * 86_400_000 });
  }
  await Consent.create({ anonId, userId: req.user?.id, version: config.consentVersion, choices });
  res.status(201).json({ version: config.consentVersion, choices });
});

consentRouter.get("/", async (req, res) => {
  const anonId = req.cookies?.[config.anonCookie];
  const latest = anonId ? await Consent.findOne({ anonId }).sort({ createdAt: -1 }).lean() : null;
  res.json(latest ? { version: latest.version, choices: latest.choices, at: latest.createdAt } : null);
});
