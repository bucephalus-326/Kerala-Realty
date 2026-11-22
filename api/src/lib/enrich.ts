/**
 * Location facts for a listing from its coordinates (same rules as
 * scripts/build-data.mjs): nearest places by category, school and hospital
 * counts, card highlights and demo flood risk. Used when owners add or move a listing.
 */
import { readFileSync } from "node:fs";

type Coords = [number, number];
interface Poi {
  name: string;
  category: string;
  coords: Coords;
  major?: boolean;
  status?: string;
}
const read = <T>(f: string): T => JSON.parse(readFileSync(new URL(`../../../web/src/data/generated/${f}`, import.meta.url), "utf8"));
const POIS = read<Poi[]>("pois.json");
const FLOOD = read<{ features: { properties: { name: string; risk: string }; geometry: { coordinates: Coords[][] } }[] }>("flood-zones.json");
const BY_CAT = POIS.reduce<Record<string, Poi[]>>((acc, p) => ((acc[p.category] ??= []).push(p), acc), {});

export function km([lng1, lat1]: Coords, [lng2, lat2]: Coords) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function inPolygon([x, y]: Coords, ring: Coords[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const CATS = ["metro", "water_metro", "rail", "it_park", "hospital", "school", "college", "mall", "bus", "airport"];
const HIGHLIGHT_KM: Record<string, number> = { metro: 2.5, water_metro: 2, it_park: 5, hospital: 2, mall: 2.5, rail: 2.5, airport: 12 };
const PRIORITY: Record<string, number> = { metro: 1, it_park: 1, water_metro: 1.2, rail: 1.4, airport: 1.4, mall: 1.6, hospital: 1.6 };
const LABEL: Record<string, string> = { metro: "metro", water_metro: "Water Metro", rail: "railway station" };

/** Kerala bounding box; listings outside it are rejected. */
export const inKerala = ([lng, lat]: Coords) => lng >= 74.8 && lng <= 77.5 && lat >= 8.1 && lat <= 12.9;

export function enrich(coords: Coords) {
  const nearby: Record<string, { name: string; km: number; status?: string }> = {};
  for (const cat of CATS) {
    let best: { name: string; km: number; status?: string } | null = null;
    for (const p of BY_CAT[cat] ?? []) {
      if (cat === "hospital" && !p.major) continue;
      const d = km(coords, p.coords);
      if (!best || d < best.km) best = { name: p.name, km: d, status: p.status };
    }
    if (best && best.km <= 40) nearby[cat] = { name: best.name, km: +Math.max(0.1, best.km).toFixed(1), ...(best.status && { status: best.status }) };
  }
  const counts = {
    schools2km: (BY_CAT.school ?? []).filter((p) => km(coords, p.coords) <= 2).length,
    hospitals3km: (BY_CAT.hospital ?? []).filter((p) => km(coords, p.coords) <= 3).length,
  };
  const highlights = Object.entries(HIGHLIGHT_KM)
    .filter(([cat, max]) => nearby[cat] && nearby[cat].km <= max)
    .sort((a, b) => (nearby[a[0]].km / a[1]) * PRIORITY[a[0]] - (nearby[b[0]].km / b[1]) * PRIORITY[b[0]])
    .slice(0, 2)
    .map(([cat]) => ({
      label:
        (LABEL[cat] ? `${nearby[cat].name.replace(/ (I )?(Station|Water Metro.*)$/i, "")} ${LABEL[cat]}`.trim() : nearby[cat].name) +
        (nearby[cat].status === "under_construction" ? " (u/c)" : ""),
      km: nearby[cat].km,
      category: cat,
    }));
  if (highlights.length < 2 && counts.schools2km > 0) highlights.push({ label: `${counts.schools2km} schools within 2 km`, km: 2, category: "school" });
  let flood = { level: "low", zone: null as string | null };
  for (const f of FLOOD.features)
    if (inPolygon(coords, f.geometry.coordinates[0])) {
      flood = { level: f.properties.risk, zone: f.properties.name };
      break;
    }
  return { nearby, counts, highlights, flood };
}
