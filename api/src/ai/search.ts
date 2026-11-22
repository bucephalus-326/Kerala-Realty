/**
 * Retrieval for the assistant (the "R" in RAG): structured filters first,
 * then rank by budget fit, trust signals, commute and semantic similarity.
 */
import { readFileSync } from "node:fs";
import { Listing } from "../models/listing.js";
import { toClient } from "../routes/listings.js";
import { cosine, embed } from "./provider.js";
import type { SearchFilters } from "./parse.js";

interface LocalityRow {
  name: string;
  city: string;
  coords: [number, number];
  psf: number;
  yoy: number;
  listingCount: number;
  nearby: Record<string, { name: string; km: number; status?: string } | null>;
  schools2km: number;
}
export const LOCALITIES: LocalityRow[] = JSON.parse(
  readFileSync(new URL("../../../web/src/data/generated/localities.json", import.meta.url), "utf8"),
);

export type ClientListing = ReturnType<typeof toClient> & {
  id: string;
  title: string;
  price: number;
  purpose: string;
  type: string;
  locality: string;
  city: string;
  beds?: number;
  verified?: boolean;
  rera?: { status: string };
  postedBy: { kind: string };
  postedAt: string;
  highlights?: { label: string; km: number; category: string }[];
  nearby?: Record<string, { name: string; km: number; status?: string }>;
  counts?: { schools2km: number; hospitals3km: number };
  flood?: { level: string; zone: string | null };
};

const NEAR_TO_FIELD: Record<string, string> = {
  infopark: "Infopark",
  technopark: "Technopark",
  smartcity: "SmartCity",
  cyberpark: "Cyberpark",
  lulu: "LuLu",
  airport: "Airport",
};

export async function searchListings(f: SearchFilters, opts: { semanticQuery?: string; limit?: number } = {}) {
  const q: Record<string, unknown> = { status: "published", purpose: f.purpose };
  if (f.type) q.type = f.type === "villa" ? { $in: ["villa", "house"] } : f.type;
  if (f.beds) q.beds = { $gte: f.beds };
  if (f.budgetMax) q.price = { $lte: f.budgetMax * 1.1 };
  if (f.city) q.city = f.city;
  if (f.locality) {
    const loc = LOCALITIES.find((l) => l.name === f.locality);
    // The locality itself, or anything within 2.5 km of its centre.
    q.$or = [
      { locality: f.locality },
      ...(loc ? [{ location: { $geoWithin: { $centerSphere: [loc.coords, 2.5 / 6378.1] } } }] : []),
    ];
  }
  let rows = (await Listing.find(q).lean()).map((l) => toClient(l) as ClientListing);

  // Refinements computed from OpenStreetMap facts.
  if (f.near) {
    const label = NEAR_TO_FIELD[f.near]?.toLowerCase() ?? f.near;
    rows = rows.filter((l) => Object.values(l.nearby ?? {}).some((n) => n.name.toLowerCase().includes(label) && n.km <= 4));
  }
  if (f.maxMetroKm != null) rows = rows.filter((l) => (l.nearby?.metro?.km ?? 99) <= f.maxMetroKm!);
  if (f.maxItParkKm != null) rows = rows.filter((l) => (l.nearby?.it_park?.km ?? 99) <= f.maxItParkKm!);
  if (f.maxHospitalKm != null) rows = rows.filter((l) => (l.nearby?.hospital?.km ?? 99) <= f.maxHospitalKm!);
  if (f.avoidFlood) rows = rows.filter((l) => l.flood?.level === "low");
  if (f.minSchools2km != null) rows = rows.filter((l) => (l.counts?.schools2km ?? 0) >= f.minSchools2km!);

  const ranked = await rank(rows, f, opts.semanticQuery);
  return { total: rows.length, results: ranked.slice(0, opts.limit ?? 12) };
}

/** Rule score + optional semantic similarity. Returns reasons for the top picks. */
async function rank(rows: ClientListing[], f: SearchFilters, semanticQuery?: string) {
  let sims: Map<string, number> | null = null;
  if (semanticQuery && rows.length > 1) {
    const withVec = await Listing.find({ _id: { $in: rows.map((r) => r.id) }, embedding: { $exists: true } }).select("+embedding").lean();
    if (withVec.length) {
      const qv = await embed([semanticQuery]);
      if (qv) sims = new Map(withVec.map((l) => [String(l._id), cosine(qv[0], l.embedding as number[])]));
    }
  }
  const now = Date.now();
  return rows
    .map((l) => {
      let score = 0;
      const reasons: string[] = [];
      if (l.verified) score += 2;
      if (l.rera?.status === "registered") {
        score += 1.5;
        reasons.push("K-RERA registered");
      }
      if (f.budgetMax) {
        const r = l.price / f.budgetMax;
        if (r <= 1) {
          score += 2 + (1 - Math.abs(0.85 - r));
          // "Far under budget" usually means a smaller home than wanted, so it isn't sold as a plus.
          if (r < 0.95 && r >= 0.6) reasons.push(`${Math.round((1 - r) * 100)}% under your budget`);
        } else reasons.push("Slightly above budget, negotiable");
      }
      const top = l.highlights?.[0];
      if (top && top.km <= 1.5 && top.category !== "school") {
        score += 1.5;
        reasons.push(`${top.km} km to ${top.label}`);
      }
      if (l.flood?.level && l.flood.level !== "low") score -= 1.5;
      if (l.postedBy?.kind === "owner") {
        score += 0.5;
        reasons.push("Direct owner, no brokerage");
      }
      score += Math.max(0, 1 - (now - Date.parse(l.postedAt)) / (30 * 86_400_000));
      const sim = sims?.get(l.id);
      if (sim != null) score += sim * 4; // semantic match matters, but filters and trust come first
      return { listing: l, score, reasons: reasons.slice(0, 2), similarity: sim ?? null };
    })
    .sort((a, b) => b.score - a.score);
}

/** Text used for listing embeddings. */
export function listingText(l: ClientListing & { amenities?: string[] }) {
  const near = Object.values(l.nearby ?? {})
    .slice(0, 6)
    .map((n) => `${n.name} ${n.km} km`)
    .join(", ");
  return `${l.title}. ${l.type} for ${l.purpose} in ${l.locality}, ${l.city}. ${l.beds ? `${l.beds} BHK. ` : ""}Amenities: ${(l.amenities ?? []).join(", ")}. Nearby: ${near}. Flood risk ${l.flood?.level ?? "low"}.`;
}

/** Compute embeddings for listings that don't have one (one batched call). */
export async function ensureEmbeddings() {
  const missing = await Listing.find({ status: "published", embedding: { $exists: false } }).lean();
  if (!missing.length) return 0;
  const vectors = await embed(missing.map((l) => listingText(toClient(l) as ClientListing)));
  if (!vectors) return 0;
  await Listing.bulkWrite(missing.map((l, i) => ({ updateOne: { filter: { _id: l._id }, update: { $set: { embedding: vectors[i] } } } })));
  return missing.length;
}

/** Follow-up questions that would actually narrow the current results. */
export function nextQuestions(f: SearchFilters, rows: ClientListing[]) {
  const n = rows.length;
  const out: { label: string; prompt: string }[] = [];
  const useful = (c: number) => c > 0 && c < n;
  const place = f.locality ?? f.city ?? "here";
  if (f.maxMetroKm == null) {
    const c = rows.filter((l) => (l.nearby?.metro?.km ?? 99) <= 1).length;
    if (useful(c)) out.push({ label: `Only within 1 km of a metro (${c})`, prompt: "only homes near metro" });
  }
  if (!f.avoidFlood) {
    const risky = rows.filter((l) => l.flood?.level !== "low").length;
    if (useful(n - risky)) out.push({ label: `Hide ${risky} in flood-prone pockets`, prompt: "avoid flood prone areas" });
  }
  if (f.maxItParkKm == null) {
    const near = rows.filter((l) => (l.nearby?.it_park?.km ?? 99) <= 3);
    if (useful(near.length)) out.push({ label: `Within 3 km of ${near[0].nearby!.it_park!.name} (${near.length})`, prompt: `near ${near[0].nearby!.it_park!.name.toLowerCase()}` });
  }
  if (f.minSchools2km == null && f.type !== "commercial") {
    const c = rows.filter((l) => (l.counts?.schools2km ?? 0) >= 10).length;
    if (useful(c)) out.push({ label: `Family-friendly: 10+ schools nearby (${c})`, prompt: "good for family with kids, near schools" });
  }
  const here = LOCALITIES.find((l) => l.name === f.locality);
  if (here) {
    const alt = LOCALITIES.filter((l) => l.city === here.city && l.name !== here.name && l.listingCount >= 3).sort(
      (a, b) => Math.hypot(a.coords[0] - here.coords[0], a.coords[1] - here.coords[1]) - Math.hypot(b.coords[0] - here.coords[0], b.coords[1] - here.coords[1]),
    )[0];
    if (alt) out.push({ label: `Compare ${here.name} with ${alt.name}`, prompt: `compare ${here.name} and ${alt.name}` });
  }
  if (n > 0) out.push({ label: "Talk to an advisor", prompt: "call me back" });
  return out.slice(0, 4);
}

export function compareLocalities(a: string, b: string) {
  const rows = [a, b].map((n) => LOCALITIES.find((l) => l.name === n)).filter(Boolean) as LocalityRow[];
  return rows.map((l) => ({
    name: l.name,
    city: l.city,
    psf: l.psf,
    yoy: l.yoy,
    listings: l.listingCount,
    metro: l.nearby.metro ?? null,
    itPark: l.nearby.it_park ?? null,
    schools2km: l.schools2km,
  }));
}
