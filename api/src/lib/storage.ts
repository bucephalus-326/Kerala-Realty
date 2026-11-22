/**
 * File storage in MongoDB GridFS: free on Atlas, no extra service.
 * "media" holds public listing photos; "documents" is the private vault.
 */
import { createHash } from "node:crypto";
import mongoose from "mongoose";

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

export function openFile(name: Bucket, id: string) {
  return bucket(name).openDownloadStream(new mongoose.Types.ObjectId(id));
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
