import type { Listing, PropertyType, Purpose } from "@/data/listings";
import { localities } from "@/data/localities";

/** Place-aware refinements, added from the follow-up question chips. */
export interface Refinements {
  maxMetroKm?: number;
  maxItParkKm?: number;
  maxHospitalKm?: number;
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
  /** Exact result set chosen by the assistant (its search uses a radius, not just names). */
  ids?: string[];
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
  if (r.maxHospitalKm != null && !((l.nearby.hospital?.km ?? 99) <= r.maxHospitalKm)) return false;
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
  return baseOrIds(all, f).filter((l) => passesRefinements(l, f.refine));
}

function baseOrIds(all: Listing[], f: Filters) {
  if (!f.ids) return baseFilter(all, f);
  const set = new Set(f.ids);
  return all.filter((l) => set.has(l.id));
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
  if (f.budgetMax) parts.push((budgetLabel ?? budgetText(f.budgetMax, f.purpose)).replace(/^Up/, "up"));
  return parts.join(" ");
}

/* ───────────── Place-aware follow-up questions ───────────── */

export type Suggestion =
  | { kind: "refine"; id: string; label: string; count: number; patch: Refinements; icon: "metro" | "flood" | "it" | "school" }
  | { kind: "compare"; id: string; label: string; a: string; b: string };

export const REFINE_LABEL: Record<keyof Refinements, (v: number | boolean) => string> = {
  maxMetroKm: (v) => `Within ${v} km of metro`,
  maxItParkKm: (v) => `Within ${v} km of an IT park`,
  maxHospitalKm: (v) => `Within ${v} km of a hospital`,
  avoidFlood: () => "Outside flood zones",
  minSchools2km: (v) => `${v}+ schools within 2 km`,
};

/**
 * Suggest the next question from facts about the current results.
 * A suggestion only appears when it would actually narrow the list (and not empty it).
 */
export function suggestNext(f: Filters, all: Listing[]): Suggestion[] {
  const pool = baseOrIds(all, f).filter((l) => passesRefinements(l, f.refine));
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

/* ───────────── Assistant → page ───────────── */

/** Filters as the assistant API returns them. */
export interface AssistantFilters {
  purpose: "buy" | "rent";
  type?: PropertyType;
  beds?: number;
  budgetMax?: number;
  locality?: string;
  city?: string;
  near?: string;
  maxMetroKm?: number;
  maxItParkKm?: number;
  maxHospitalKm?: number;
  avoidFlood?: boolean;
  minSchools2km?: number;
}

export function fromAssistant(a: AssistantFilters): Filters {
  const refine: Refinements = {};
  if (a.maxMetroKm != null) refine.maxMetroKm = a.maxMetroKm;
  if (a.maxItParkKm != null) refine.maxItParkKm = a.maxItParkKm;
  if (a.maxHospitalKm != null) refine.maxHospitalKm = a.maxHospitalKm;
  if (a.avoidFlood) refine.avoidFlood = true;
  if (a.minSchools2km != null) refine.minSchools2km = a.minSchools2km;
  const near: Record<string, string> = { infopark: "Infopark", technopark: "Technopark", smartcity: "SmartCity", cyberpark: "Cyberpark", lulu: "LuLu", airport: "Airport" };
  return {
    purpose: a.purpose,
    query: a.locality ?? (a.near ? near[a.near] ?? a.near : undefined) ?? (a.city === "Thiruvananthapuram" ? "Thiruvananthapuram" : a.city) ?? "",
    type: a.type === "house" ? "villa" : a.type ?? "any",
    budgetMax: a.budgetMax ?? null,
    beds: a.beds ?? null,
    segment: "all",
    refine,
  };
}

/** Event the assistant fires to show its search on the home page. */
export const APPLY_SEARCH_EVENT = "kr:apply-search";
export function applySearchOnPage(f: AssistantFilters, ids?: string[]) {
  window.dispatchEvent(new CustomEvent(APPLY_SEARCH_EVENT, { detail: { ...fromAssistant(f), ids } }));
}

/** "Up to ₹70 L" / "Up to ₹25k/mo" for any budget (the assistant can set values outside the presets). */
export function budgetText(v: number, purpose: Purpose) {
  if (purpose === "rent") return `Up to ₹${v >= 1e5 ? `${+(v / 1e5).toFixed(1)} L` : `${Math.round(v / 1000)}k`}/mo`;
  return `Up to ₹${v >= 1e7 ? `${+(v / 1e7).toFixed(2)} Cr` : `${+(v / 1e5).toFixed(1)} L`}`;
}
