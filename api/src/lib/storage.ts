/**
 * File storage in MongoDB GridFS: free on Atlas, no extra service.
 * "media" holds public listing photos; "documents" is the private vault.
 */
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { HttpError } from "./http.js";
import { getSettings } from "./settings.js";

type Bucket = "media" | "documents";
const bucket = (name: Bucket) => new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: name });

export async function putFile(name: Bucket, data: Buffer, filename: string, contentType: string, metadata: Record<string, unknown>) {
  const sha256 = createHash("sha256").update(data).digest("hex");
  const stream = bucket(name).openUploadStream(filename, { metadata: { ...metadata, contentType, sha256, size: data.length } });
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
    stream.end(data);
  });
  return { id: String(stream.id), sha256, size: data.length };
}

export async function fileInfo(name: Bucket, id: string) {
  if (!mongoose.isValidObjectId(id)) return null;
  return bucket(name).find({ _id: new mongoose.Types.ObjectId(id) }).next();
}

/** Stream a file to the response. A damaged or missing file ends that response, never the process. */
export function sendFile(name: Bucket, id: string, res: import("express").Response) {
  const stream = bucket(name).openDownloadStream(new mongoose.Types.ObjectId(id));
  stream.on("error", () => {
    if (!res.headersSent) res.status(404).json({ error: { code: "not_found", message: "File not found" } });
    else res.destroy();
  });
  stream.pipe(res);
}

/** Files and bytes a user has stored across both buckets. */
export async function usageOf(ownerId: string) {
  let files = 0;
  let bytes = 0;
  for (const b of ["media", "documents"] as const) {
    const [row] = await mongoose.connection
      .db!.collection(`${b}.files`)
      .aggregate([{ $match: { "metadata.ownerId": ownerId } }, { $group: { _id: null, n: { $sum: 1 }, bytes: { $sum: "$length" } } }])
      .toArray();
    files += row?.n ?? 0;
    bytes += row?.bytes ?? 0;
  }
  return { files, bytes };
}

/**
 * Per-user storage cap, so one account can't fill the free database
 * (Atlas M0 has 512 MB). Read per call so it can be tuned without a restart.
 */
export async function assertQuota(ownerId: string, incoming: number) {
  const { uploads } = await getSettings();
  // Env still wins when set explicitly (tests and emergency overrides).
  const maxFiles = Number(process.env.UPLOAD_MAX_FILES ?? uploads.maxFiles);
  const maxBytes = Number(process.env.UPLOAD_MAX_MB ?? uploads.maxMB) * 1024 * 1024;
  const u = await usageOf(ownerId);
  if (u.files + 1 > maxFiles || u.bytes + incoming > maxBytes) {
    throw new HttpError(413, `Storage limit reached (${maxFiles} files or ${maxBytes / 1024 / 1024} MB per account). Delete unused files or contact support.`, "quota_exceeded");
  }
}

export async function listFiles(name: Bucket, filter: Record<string, unknown>) {
  return bucket(name).find(filter).sort({ uploadDate: -1 }).toArray();
}

export async function deleteFile(name: Bucket, id: string) {
  await bucket(name).delete(new mongoose.Types.ObjectId(id));
}

/** Check magic bytes so a renamed file can't pose as an image or PDF. */
export function sniff(data: Buffer): string | null {
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (data.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}
