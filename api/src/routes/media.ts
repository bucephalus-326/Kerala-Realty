import express, { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/rbac.js";
import { audit } from "../lib/audit.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { assertQuota, deleteFile, fileInfo, listFiles, putFile, sendFile, sniff } from "../lib/storage.js";
import { Listing } from "../models/listing.js";

/**
 * Uploads are sent as the raw file body with an X-KR-Upload header. The custom
 * header forces a CORS preflight, which protects these routes from CSRF the same
 * way the JSON-only rule protects the rest of the API.
 */
// Photos are resized in the browser (~300 KB), so 3 MB is generous; scanned documents get 8 MB.
const rawPhoto = express.raw({ type: ["image/*"], limit: "3mb" });
const rawDoc = express.raw({ type: ["image/*", "application/pdf"], limit: "8mb" });
const fileName = (v: unknown) => String(v ?? "file").replace(/[^\w.\- ]+/g, "_").slice(0, 120);

/* ───────────── Public listing photos ───────────── */

export const mediaRouter = Router();

mediaRouter.post("/", requirePermission("listings:write_own"), rawPhoto, async (req, res) => {
  const data = req.body as Buffer;
  if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, "Send the image as the request body", "no_file");
  const type = sniff(data);
  if (!type?.startsWith("image/")) throw new HttpError(415, "Photos must be JPEG, PNG or WebP", "bad_type");
  await assertQuota(req.user!.id, data.length);
  const f = await putFile("media", data, fileName(req.headers["x-file-name"]), type, { ownerId: req.user!.id });
  res.status(201).json({ id: f.id, url: `/api/media/${f.id}`, size: f.size });
});

mediaRouter.get("/:id", async (req, res) => {
  const info = await fileInfo("media", req.params.id);
  if (!info) throw notFound("Photo");
  res.setHeader("Content-Type", String(info.metadata?.contentType ?? "application/octet-stream"));
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  sendFile("media", req.params.id, res);
});

/* ───────────── Private document vault ───────────── */

export const DOC_KINDS = ["title_deed", "tax_receipt", "encumbrance", "building_permit", "rera_certificate", "id_proof", "agent_licence", "other"] as const;

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const docMeta = z.object({
  kind: z.enum(DOC_KINDS),
  listingId: z.string().max(20).optional(),
});

documentsRouter.post("/", rawDoc, async (req, res) => {
  const meta = parse(docMeta, { kind: req.headers["x-doc-kind"], listingId: req.headers["x-listing-id"] || undefined });
  if (meta.kind !== "id_proof" && meta.kind !== "agent_licence" && !["owner", "agent"].includes(req.user!.role)) {
    throw new HttpError(403, "Only owners and agents can add property documents", "forbidden");
  }
  if (meta.listingId && !(await Listing.exists({ _id: meta.listingId, ownerId: req.user!.id }))) throw notFound("Listing");
  const data = req.body as Buffer;
  if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, "Send the file as the request body", "no_file");
  const type = sniff(data);
  if (!type) throw new HttpError(415, "Documents must be PDF, JPEG, PNG or WebP", "bad_type");
  await assertQuota(req.user!.id, data.length);
  const f = await putFile("documents", data, fileName(req.headers["x-file-name"]), type, { ownerId: req.user!.id, ...meta, review: "pending" });
  if (meta.listingId) await Listing.updateOne({ _id: meta.listingId }, { $addToSet: { documentIds: f.id } });
  await audit(req, "document.upload", f.id, { kind: meta.kind, listingId: meta.listingId, sha256: f.sha256 });
  res.status(201).json({ id: f.id, sha256: f.sha256, size: f.size, kind: meta.kind, review: "pending" });
});

documentsRouter.get("/", async (req, res) => {
  const files = await listFiles("documents", { "metadata.ownerId": req.user!.id });
  res.json({ items: files.map(docToClient) });
});

/** Owners read their own documents; admins read any (for verification). Every access is audited. */
documentsRouter.get("/:id", async (req, res) => {
  const info = await fileInfo("documents", req.params.id);
  if (!info || (info.metadata?.ownerId !== req.user!.id && req.user!.role !== "admin")) throw notFound("Document");
  await audit(req, "document.view", req.params.id);
  res.setHeader("Content-Type", String(info.metadata?.contentType));
  res.setHeader("Content-Disposition", `inline; filename="${info.filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  sendFile("documents", req.params.id, res);
});

documentsRouter.delete("/:id", async (req, res) => {
  const info = await fileInfo("documents", req.params.id);
  if (!info || info.metadata?.ownerId !== req.user!.id) throw notFound("Document");
  await deleteFile("documents", req.params.id);
  await Listing.updateMany({ documentIds: req.params.id }, { $pull: { documentIds: req.params.id } });
  await audit(req, "document.delete", req.params.id);
  res.json({ ok: true });
});

export function docToClient(f: { _id: unknown; filename: string; uploadDate: Date; metadata?: Record<string, unknown> }) {
  return {
    id: String(f._id),
    name: f.filename,
    kind: f.metadata?.kind,
    listingId: f.metadata?.listingId ?? null,
    sha256: f.metadata?.sha256,
    size: f.metadata?.size,
    contentType: f.metadata?.contentType,
    review: f.metadata?.review ?? "pending",
    uploadedAt: f.uploadDate,
  };
}
