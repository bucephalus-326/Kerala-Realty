import type { Listing, PropertyType, Purpose } from "@/data/listings";

export interface Filters {
  purpose: Purpose;
  query: string;
  type: PropertyType | "any";
  budgetMax: number | null;
  beds: number | null;
  segment: "all" | "new" | "luxury";
}

export const DEFAULT_FILTERS: Filters = {
  purpose: "buy",
  query: "",
  type: "any",
  budgetMax: null,
  beds: null,
  segment: "all",
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
  return f.query.trim() !== "" || f.type !== "any" || f.budgetMax !== null || f.beds !== null || f.segment !== "all";
}

/** Hard filters. A budget allows 10% stretch so near-misses still appear. */
export function filterListings(all: Listing[], f: Filters): Listing[] {
  const q = f.query.trim().toLowerCase().split(",")[0];
  return all.filter((l) => {
    if (l.purpose !== f.purpose) return false;
    if (f.type !== "any" && l.type !== f.type && !(f.type === "villa" && l.type === "house")) return false;
    if (f.budgetMax !== null && l.price > f.budgetMax * 1.1) return false;
    if (f.beds !== null && (l.beds ?? 0) < f.beds) return false;
    if (f.segment === "new" && !l.isNewProject) return false;
    if (f.segment === "luxury" && !l.isLuxury) return false;
    if (q) {
      const hay = `${l.locality} ${l.city} ${l.district} ${l.title} ${l.highlights.map((h) => h.label).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Rank results and explain the top picks. This rule-based ranker is the
 * no-AI fallback; the AI agent in stage 5 produces the same shape.
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
    const nearest = [...l.highlights].sort((a, b) => a.km - b.km)[0];
    if (nearest && nearest.km <= 1.5) {
      score += 1.5;
      reasons.push(`${nearest.km} km to ${nearest.label}`);
    }
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
