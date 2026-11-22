import type { Listing, PropertyType, Purpose } from "@/data/listings";
import { localities } from "@/data/places";

/** Place-aware refinements, added from the follow-up question chips. */
export interface Refinements {
  maxMetroKm?: number;
  maxItParkKm?: number;
  avoidFlood?: boolean;
  minSchools2km?: number;
}

export interface Filters {
  purpose: Purpose;
  query: string;
  type: PropertyType | "any";
  budgetMax: number | null;
  beds: number | null;
  segment: "all" | "new" | "luxury";
  refine: Refinements;
}

export const DEFAULT_FILTERS: Filters = {
  purpose: "buy",
  query: "",
  type: "any",
  budgetMax: null,
  beds: null,
  segment: "all",
  refine: {},
};

export const BUDGETS: Record<Purpose, { label: string; value: number | null }[]> = {
  buy: [
    { label: "Any budget", value: null },
    { label: "Up to ₹30 L", value: 3_000_000 },
    { label: "Up to ₹50 L", value: 5_000_000 },
    { label: "Up to ₹75 L", value: 7_500_000 },
    { label: "Up to ₹1 Cr", value: 10_000_000 },
    { label: "Up to ₹2 Cr", value: 20_000_000 },
    { label: "Up to ₹5 Cr", value: 50_000_000 },
  ],
  rent: [
    { label: "Any rent", value: null },
    { label: "Up to ₹15k/mo", value: 15_000 },
    { label: "Up to ₹30k/mo", value: 30_000 },
    { label: "Up to ₹50k/mo", value: 50_000 },
    { label: "Up to ₹2 L/mo", value: 200_000 },
  ],
};

export function isActive(f: Filters) {
  return (
    f.query.trim() !== "" ||
    f.type !== "any" ||
    f.budgetMax !== null ||
    f.beds !== null ||
    f.segment !== "all" ||
    Object.keys(f.refine).length > 0
  );
}

function matchesQuery(l: Listing, q: string) {
  if (!q) return true;
  const hay = [
    l.locality,
    l.city,
    l.district,
    l.title,
    ...Object.values(l.nearby).map((n) => n?.name ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function passesRefinements(l: Listing, r: Refinements) {
  if (r.maxMetroKm != null && !((l.nearby.metro?.km ?? 99) <= r.maxMetroKm)) return false;
  if (r.maxItParkKm != null && !((l.nearby.it_park?.km ?? 99) <= r.maxItParkKm)) return false;
  if (r.avoidFlood && l.flood.level !== "low") return false;
  if (r.minSchools2km != null && l.counts.schools2km < r.minSchools2km) return false;
  return true;
}

/** Hard filters before refinements. A budget allows 10% stretch so near-misses still appear. */
function baseFilter(all: Listing[], f: Filters): Listing[] {
  const q = f.query.trim().toLowerCase().split(",")[0];
  return all.filter((l) => {
    if (l.purpose !== f.purpose) return false;
    if (f.type !== "any" && l.type !== f.type && !(f.type === "villa" && l.type === "house")) return false;
    if (f.budgetMax !== null && l.price > f.budgetMax * 1.1) return false;
    if (f.beds !== null && (l.beds ?? 0) < f.beds) return false;
    if (f.segment === "new" && !l.isNewProject) return false;
    if (f.segment === "luxury" && !l.isLuxury) return false;
    return matchesQuery(l, q);
  });
}

export function filterListings(all: Listing[], f: Filters): Listing[] {
  return baseFilter(all, f).filter((l) => passesRefinements(l, f.refine));
}

/**
 * Rank results and explain the top picks. Rule-based: this is the no-AI
 * fallback, and the AI agent in stage 5 returns the same shape.
 */
export function rankListings(results: Listing[], f: Filters) {
  const scored = results.map((l) => {
    let score = 0;
    const reasons: string[] = [];
    if (l.verified) score += 2;
    if (l.rera.status === "registered") {
      score += 1.5;
      reasons.push("K-RERA registered");
    }
    if (f.budgetMax) {
      const ratio = l.price / f.budgetMax;
      if (ratio <= 1) {
        score += 2 + (1 - Math.abs(0.85 - ratio)); // best value sits a little under budget
        if (ratio < 0.95) reasons.push(`${Math.round((1 - ratio) * 100)}% under your budget`);
      } else {
        reasons.push("Slightly above budget, negotiable");
      }
    }
    const top = l.highlights[0];
    if (top && top.km <= 1.5 && top.category !== "school") {
      score += 1.5;
      reasons.push(`${top.km} km to ${top.label}`);
    }
    if (l.flood.level !== "low") score -= 1.5;
    if (l.postedBy.kind === "owner") {
      score += 0.5;
      reasons.push("Direct owner, no brokerage");
    }
    const ageDays = (Date.parse("2026-11-22") - Date.parse(l.postedAt)) / 86_400_000;
    score += Math.max(0, 1 - ageDays / 30);
    return { listing: l, score, reasons: reasons.slice(0, 2) };
  });
  return scored.sort((a, b) => b.score - a.score);
}

export function describeFilters(f: Filters, budgetLabel?: string) {
  const parts: string[] = [];
  if (f.beds) parts.push(`${f.beds}BHK+`);
  parts.push(f.type === "any" ? "properties" : `${f.type}s`);
  parts.push(f.purpose === "rent" ? "for rent" : "for sale");
  if (f.query.trim()) parts.push(`in ${f.query.split(",")[0]}`);
  if (budgetLabel && f.budgetMax) parts.push(budgetLabel.charAt(0).toLowerCase() + budgetLabel.slice(1));
  return parts.join(" ");
}

/* ───────────── Place-aware follow-up questions ───────────── */

export type Suggestion =
  | { kind: "refine"; id: string; label: string; count: number; patch: Refinements; icon: "metro" | "flood" | "it" | "school" }
  | { kind: "compare"; id: string; label: string; a: string; b: string };

export const REFINE_LABEL: Record<keyof Refinements, (v: number | boolean) => string> = {
  maxMetroKm: (v) => `Within ${v} km of metro`,
  maxItParkKm: (v) => `Within ${v} km of an IT park`,
  avoidFlood: () => "Outside flood zones",
  minSchools2km: (v) => `${v}+ schools within 2 km`,
};

/**
 * Suggest the next question from facts about the current results.
 * A suggestion only appears when it would actually narrow the list (and not empty it).
 */
export function suggestNext(f: Filters, all: Listing[]): Suggestion[] {
  const pool = baseFilter(all, f).filter((l) => passesRefinements(l, f.refine));
  const n = pool.length;
  const out: Suggestion[] = [];
  const useful = (c: number) => c > 0 && c < n;

  if (f.refine.maxMetroKm == null) {
    const c = pool.filter((l) => (l.nearby.metro?.km ?? 99) <= 1).length;
    if (useful(c)) out.push({ kind: "refine", id: "metro", icon: "metro", count: c, patch: { maxMetroKm: 1 }, label: "Only homes within 1 km of a metro station" });
  }
  if (!f.refine.avoidFlood) {
    const risky = pool.filter((l) => l.flood.level !== "low").length;
    if (useful(n - risky)) out.push({ kind: "refine", id: "flood", icon: "flood", count: n - risky, patch: { avoidFlood: true }, label: `Hide ${risky} in monsoon flood-prone pockets` });
  }
  if (f.refine.maxItParkKm == null) {
    const near = pool.filter((l) => (l.nearby.it_park?.km ?? 99) <= 3);
    const park = near[0]?.nearby.it_park?.name;
    if (park && useful(near.length)) out.push({ kind: "refine", id: "it", icon: "it", count: near.length, patch: { maxItParkKm: 3 }, label: `Within 3 km of ${park}` });
  }
  if (f.refine.minSchools2km == null && f.type !== "commercial") {
    const c = pool.filter((l) => l.counts.schools2km >= 10).length;
    if (useful(c)) out.push({ kind: "refine", id: "school", icon: "school", count: c, patch: { minSchools2km: 10 }, label: "Family-friendly: 10+ schools within 2 km" });
  }

  // Compare the searched locality with the nearest priced alternative.
  const q = f.query.split(",")[0].trim().toLowerCase();
  const here = localities.find((l) => l.name.toLowerCase() === q);
  if (here) {
    const alt = localities
      .filter((l) => l.city === here.city && l.name !== here.name && l.listingCount >= 3)
      .sort((a, b) => dist(a.coords, here.coords) - dist(b.coords, here.coords))[0];
    if (alt) out.push({ kind: "compare", id: "compare", a: here.name, b: alt.name, label: `Compare ${here.name} with ${alt.name}` });
  }
  return out.slice(0, 4);
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
