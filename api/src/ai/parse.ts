/**
 * Rule-based understanding of property queries in English and Manglish.
 * Runs first on every message; the LLM is only used when this isn't confident.
 */
import { readFileSync } from "node:fs";

export type Intent = "search" | "compare" | "lead" | "greeting" | "question";
export type PropertyType = "villa" | "house" | "apartment" | "plot" | "commercial";

export interface SearchFilters {
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

export interface Understanding {
  intent: Intent;
  filters: SearchFilters;
  compare?: [string, string];
  /** 0..1: how sure the rules are. Below 0.6 the LLM is asked. */
  confidence: number;
  matched: string[];
}

interface LocalityRow {
  name: string;
  city: string;
}
const LOCALITIES: LocalityRow[] = JSON.parse(
  readFileSync(new URL("../../../web/src/data/generated/localities.json", import.meta.url), "utf8"),
);

/** Spelling variants people actually type. */
const LOCALITY_ALIASES: Record<string, string> = {
  kakanad: "Kakkanad",
  kakkanadu: "Kakkanad",
  edapally: "Edappally",
  edappalli: "Edappally",
  idappally: "Edappally",
  vytilla: "Vyttila",
  vyttilla: "Vyttila",
  "fort cochin": "Fort Kochi",
  fortkochi: "Fort Kochi",
  panampilly: "Panampilly Nagar",
  tripunithura: "Thrippunithura",
  tripunittura: "Thrippunithura",
  kazhakuttam: "Kazhakkoottam",
  kazhakoottam: "Kazhakkoottam",
  palarivattam: "Palarivattom",
  chittethukkara: "Chittethukara",
  thrikkakkara: "Thrikkakara",
};
const CITY_ALIASES: Record<string, string> = {
  kochi: "Kochi",
  cochin: "Kochi",
  ernakulam: "Kochi",
  ekm: "Kochi",
  trivandrum: "Thiruvananthapuram",
  tvm: "Thiruvananthapuram",
  thiruvananthapuram: "Thiruvananthapuram",
  calicut: "Kozhikode",
  kozhikode: "Kozhikode",
};
const NEAR_PLACES = ["infopark", "technopark", "smartcity", "smart city", "cyberpark", "lulu", "airport", "metro"];

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ").trim();

export function parseQuery(raw: string): Understanding {
  const text = norm(raw);
  const matched: string[] = [];
  const filters: SearchFilters = { purpose: "buy" };
  let score = 0;

  /* Intent */
  let intent: Intent = "search";
  const compareM = text.match(/compare\s+(.+?)\s+(?:and|with|vs\.?|versus)\s+(.+?)(?:\s+(?:on|for)\b.*)?$/) ?? text.match(/^(.+?)\s+(?:vs\.?|versus)\s+(.+)$/);
  if (compareM) {
    const a = findLocality(compareM[1]);
    const b = findLocality(compareM[2]);
    if (a && b) return { intent: "compare", filters, compare: [a.name, b.name], confidence: 0.95, matched: ["compare"] };
    intent = "compare";
  }
  if (/\b(call me|call back|callback|contact me|talk to (an )?(agent|someone|advisor)|vilikk|whatsapp me|my number)\b/.test(text)) {
    return { intent: "lead", filters, confidence: 0.9, matched: ["lead"] };
  }
  if (/^(hi+|hello+|hey+|namaskaram|good (morning|evening|afternoon))\b[!. ]*$/.test(text)) {
    return { intent: "greeting", filters, confidence: 0.95, matched: ["greeting"] };
  }

  /* Purpose */
  if (/\b(rent|rental|vaadaka|vadaka|lease|per month|\/month|monthly|pg)\b/.test(text)) {
    filters.purpose = "rent";
    matched.push("purpose");
    score += 0.2;
  } else if (/\b(buy|purchase|sale|vanganam|vangan|own)\b/.test(text)) {
    matched.push("purpose");
    score += 0.1;
  }

  /* Bedrooms */
  const bhk = text.match(/\b(\d)\s*(?:bhk|bed(?:room)?s?|br)\b/);
  if (bhk) {
    filters.beds = Number(bhk[1]);
    matched.push("beds");
    score += 0.2;
  }

  /* Type */
  const typeRules: [RegExp, PropertyType][] = [
    [/\b(flat|flats|apartment|apartments|apt)\b/, "apartment"],
    [/\b(villa|villas)\b/, "villa"],
    [/\b(house|houses|veedu|veed|home|independent house)\b/, "villa"], // villa search includes houses
    [/\b(plot|plots|land|sthalam|cents? of land)\b/, "plot"],
    [/\b(office|shop|commercial|showroom|warehouse|godown)\b/, "commercial"],
  ];
  for (const [rx, t] of typeRules)
    if (rx.test(text)) {
      filters.type = t;
      matched.push("type");
      score += 0.25;
      break;
    }

  /* Budget: "50 lakh", "50l", "1.5 cr", "75 lakhs", "25k", "₹50,00,000" */
  const money =
    text.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|lakh|l|k|thousand)\b/) ??
    text.match(/(?:₹|rs\.?|inr)\s*([\d,]{5,})/);
  if (money) {
    const n = Number(money[1].replace(/,/g, ""));
    const unit = money[2] ?? "";
    let value = n;
    if (/^cr|crore/.test(unit)) value = n * 1e7;
    else if (/^l|lakh|lac/.test(unit)) value = n * 1e5;
    else if (/^k|thousand/.test(unit)) value = n * 1e3;
    if (value >= 5000) {
      filters.budgetMax = Math.round(value);
      matched.push("budget");
      score += 0.25;
      if (value < 300_000 && !matched.includes("purpose")) filters.purpose = "rent"; // "25k" is rent
    }
  }

  /* Place */
  const loc = findLocality(text);
  if (loc) {
    filters.locality = loc.name;
    filters.city = loc.city;
    matched.push("locality");
    score += 0.3;
  } else {
    for (const [alias, city] of Object.entries(CITY_ALIASES))
      if (new RegExp(`\\b${alias}\\b`).test(text)) {
        filters.city = city;
        matched.push("city");
        score += 0.2;
        break;
      }
  }
  for (const p of NEAR_PLACES)
    if (text.includes(p) && p !== "metro") {
      filters.near = p.replace(" ", "");
      matched.push("near");
      score += 0.2;
      break;
    }

  /* Refinements */
  if (/\b(near|close to|walking distance|within \d km of)\b.*\bmetro\b|\bmetro\b.*\b(near|close)\b/.test(text)) {
    filters.maxMetroKm = 1;
    matched.push("metro");
    score += 0.1;
  }
  if (/\b(no|avoid|without|safe from|not in)\b.*\bflood|\bflood[- ]?(free|safe)\b/.test(text)) {
    filters.avoidFlood = true;
    matched.push("flood");
    score += 0.1;
  }
  if (/\b(hospital|hospitals|medical|clinic|elderly|parents|retire|retirement)\b/.test(text)) {
    filters.maxHospitalKm = 2;
    matched.push("hospital");
    score += 0.05;
  }
  if (/\b(school|schools|kids|children|family)\b/.test(text)) {
    filters.minSchools2km = 10;
    matched.push("schools");
    score += 0.05;
  }

  // Open questions ("is it safe", "what is", "which is better") need the LLM agent.
  const looksLikeQuestion = /\b(what|which|why|how|is it|are there|should i|explain|tell me about|fair price|worth)\b/.test(text) || text.endsWith("?");
  if (looksLikeQuestion && matched.length < 3) intent = "question";

  return { intent, filters, confidence: Math.min(1, score), matched };
}

export function findLocality(text: string): LocalityRow | null {
  const t = norm(text);
  // Longest names first so "panampilly nagar" beats shorter matches.
  for (const l of [...LOCALITIES].sort((a, b) => b.name.length - a.name.length))
    if (t.includes(l.name.toLowerCase())) return l;
  for (const [alias, name] of Object.entries(LOCALITY_ALIASES))
    if (t.includes(alias)) return LOCALITIES.find((l) => l.name === name) ?? null;
  return null;
}

export const localityNames = () => LOCALITIES.map((l) => l.name);
