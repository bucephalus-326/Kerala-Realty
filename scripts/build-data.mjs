// Builds the app's data files from the OSM extracts and seed files.
//   input : data/raw/osm-*.json, data/seed/*.json(.geojson)
//   output: web/src/data/generated/{pois,listings,price-grid,flood-zones,localities}.json
// Deterministic: same inputs → same output (seeded PRNG).
// Run: node scripts/build-data.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "web/src/data/generated";
mkdirSync(OUT, { recursive: true });
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/* ─────────────── helpers ─────────────── */

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261122);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + rand() * (b - a);
const round = (n, step) => Math.round(n / step) * step;

const R = 6371;
function km([lng1, lat1], [lng2, lat2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function pointInPolygon([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ─────────────── 1. POIs from OSM ─────────────── */

const IT_PARKS = [
  { key: "infopark", re: /^info ?park( kochi)?$|leela infopark|infopark (first|main|second) gate/i, name: "Infopark" },
  { key: "smartcity", re: /smart ?city kochi/i, name: "SmartCity Kochi" },
  { key: "kinfra", re: /kinfra hi-tech park office|kinfra biotechnology/i, name: "KINFRA Hi-Tech Park" },
  { key: "technopark", re: /technopark/i, name: "Technopark" },
  { key: "cyberpark", re: /cyberpark|cyber park/i, name: "UL Cyberpark" },
];

// OSM tags many clinics as hospitals; only "major" ones are used for card highlights.
const MAJOR_HOSPITAL = /hospital|medical (college|centre|center|trust|institute)|institute of medical|health ?city|medicity/i;
const MINOR_HOSPITAL = /clinic|eye|dental|ayur|homoeo|homeo|speech|physio|diagnostic|scan|lab\b|maternity home|nursing home|co-?operative|panchayat|family health|primary health|community health|\bphc\b|\bchc\b|taluk|dispensary|polyclinic/i;

// Airports sit outside the city query boxes, so they are added by hand (public coordinates).
const MANUAL_POIS = [
  { id: "m-cok", name: "Cochin International Airport", category: "airport", coords: [76.4019, 10.152] },
  { id: "m-ccj", name: "Calicut International Airport", category: "airport", coords: [75.9553, 11.1368] },
];

function classify(t) {
  if (t.railway === "station") {
    if (/metro/i.test(`${t.network ?? ""} ${t.operator ?? ""}`) || t.station === "subway" || t.station === "light_rail") return "metro";
    return "rail";
  }
  if (t.amenity === "ferry_terminal") return /water metro/i.test(t.name ?? "") ? "water_metro" : null;
  if (t.amenity === "school") return "school";
  if (t.amenity === "hospital") return "hospital";
  if (t.amenity === "college" || t.amenity === "university") return "college";
  if (t.amenity === "bus_station") return "bus";
  if (t.shop === "mall") return "mall";
  if (t.aeroway === "aerodrome" && t.iata) return "airport";
  return null;
}

const pois = [];
const itBuckets = new Map();
for (const city of ["kochi", "trivandrum", "kozhikode"]) {
  const file = `data/raw/osm-${city}.json`;
  if (!existsSync(file)) {
    console.warn(`! ${file} missing; skipped`);
    continue;
  }
  for (const e of readJson(file)) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (lat == null || !t.name) continue;
    const coords = [+lng.toFixed(5), +lat.toFixed(5)];

    if (!t.highway) {
      const park = IT_PARKS.find((p) => p.re.test(t.name));
      if (park) {
        const b = itBuckets.get(park.key) ?? { ...park, pts: [] };
        b.pts.push(coords);
        itBuckets.set(park.key, b);
        continue;
      }
    }
    const category = classify(t);
    if (!category) continue;
    // Prefer an English/Latin name; skip places named only in Malayalam script.
    const name = (t["name:en"] ?? t.name).replace(/\s*[\u0D00-\u0D7F].*$/, "").trim();
    if (!name || !/[a-z]/i.test(name)) continue;
    const poi = { id: `${e.type[0]}${e.id}`, name, category, coords };
    if (category === "mall" && !/mall|souk|square|plaza|centre|center|complex/i.test(name)) continue;
    if (name === name.toLowerCase()) poi.name = name.replace(/\b\w/g, (c) => c.toUpperCase());
    if (category === "hospital") poi.major = MAJOR_HOSPITAL.test(name) && !MINOR_HOSPITAL.test(name);
    if (category === "metro" && /pink/i.test(t.network ?? "")) poi.status = "under_construction";
    pois.push(poi);
  }
}
for (const b of itBuckets.values()) {
  const lng = b.pts.reduce((s, p) => s + p[0], 0) / b.pts.length;
  const lat = b.pts.reduce((s, p) => s + p[1], 0) / b.pts.length;
  pois.push({ id: `it-${b.key}`, name: b.name, category: "it_park", coords: [+lng.toFixed(5), +lat.toFixed(5)] });
}

// De-duplicate same name + category within 400 m (OSM often has node + way for one place).
pois.push(...MANUAL_POIS);
const deduped = [];
for (const p of pois) {
  if (deduped.some((q) => q.category === p.category && q.name === p.name && km(q.coords, p.coords) < 0.4)) continue;
  deduped.push(p);
}
const byCat = Object.groupBy(deduped, (p) => p.category);

/* ─────────────── 2. Flood zones ─────────────── */

const flood = readJson("data/seed/flood-zones.geojson");
function floodRisk(coords) {
  for (const f of flood.features) if (pointInPolygon(coords, f.geometry.coordinates[0])) return { level: f.properties.risk, zone: f.properties.name };
  return { level: "low", zone: null };
}

/* ─────────────── 3. Listings ─────────────── */

const { localities } = readJson("data/seed/localities.json");
const curated = readJson("data/seed/listings-curated.json");
const TARGET = 60;

const IMG = {
  villa: ["villa-1", "villa-2", "villa-3", "villa-4", "villa-5", "villa-6", "villa-7", "villa-8", "villa-9", "villa-10"],
  house: ["house-1", "house-2", "villa-10", "villa-3"],
  apartment: ["apt-1", "interior-1", "interior-2", "interior-3", "interior-4", "interior-5"],
  plot: ["plot-field", "waterfront-plot"],
  commercial: ["commercial-1", "office-1"],
};
const INTERIORS = ["interior-1", "interior-2", "interior-3", "interior-4", "interior-5"];
const BUILDERS = ["Periyar Homes", "Marine Crest Developers", "Skyline Kerala", "Anantha Builders", "Malabar Greens", "Backwater Living"];
const AGENTS = ["Cochin Estates", "Vembanad Realty", "Malabar Property Desk", "Capital City Realty"];
const AMENITIES = {
  villa: ["Gated", "Solar", "Rainwater harvesting", "Car porch", "Garden", "CCTV", "Pool", "Home office"],
  house: ["Well water", "Courtyard", "Car porch", "Garden", "Solar"],
  apartment: ["Gym", "Pool", "Power backup", "Covered parking", "Clubhouse", "Kids play area", "Lift", "Security"],
  plot: ["Clear title", "Road access 12 ft", "Road access 20 ft", "Dry land", "Corner plot", "Compound wall"],
  commercial: ["Central AC", "100% backup", "Car parking", "Lift", "Pantry"],
};
const TITLES = {
  villa: ["{b}BHK Villa", "Modern {b}BHK Villa", "{b}BHK Villa in Gated Community", "Kerala-Modern {b}BHK Villa"],
  house: ["{b}BHK Independent House", "Traditional {b}BHK Home", "{b}BHK House with Courtyard"],
  apartment: ["{b}BHK Apartment", "{b}BHK Flat", "{b}BHK Premium Apartment", "{b}BHK City-View Flat"],
  plot: ["Residential Plot", "Corner Residential Plot", "Plot near Main Road"],
  commercial: ["Office Space", "Retail Shop on Main Road", "Commercial Floor"],
};

function weightedLocality() {
  const total = localities.reduce((s, l) => s + l.weight, 0);
  let r = rand() * total;
  for (const l of localities) if ((r -= l.weight) < 0) return l;
  return localities[0];
}
function jitter([lng, lat], maxKm) {
  const d = (rand() * maxKm) / 111;
  const a = rand() * Math.PI * 2;
  return [+(lng + d * Math.cos(a)).toFixed(5), +(lat + d * Math.sin(a)).toFixed(5)];
}
function daysAgo(n) {
  const d = new Date(Date.UTC(2026, 10, 22) - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const generated = [];
let seq = curated.length + 1;
while (curated.length + generated.length < TARGET) {
  const loc = weightedLocality();
  const r = rand();
  const type = r < 0.42 ? "apartment" : r < 0.66 ? "villa" : r < 0.76 ? "house" : r < 0.9 ? "plot" : "commercial";
  const purpose = type === "plot" ? "buy" : rand() < 0.24 ? "rent" : "buy";
  const coords = jitter(loc.coords, 1.4);
  const id = `L${String(seq++).padStart(3, "0")}`;
  const kind = type === "plot" ? pick(["owner", "agent"]) : type === "apartment" && purpose === "buy" ? pick(["builder", "builder", "owner", "agent"]) : pick(["owner", "owner", "agent", "builder"]);
  const postedBy = { kind, name: kind === "owner" ? "Direct owner" : kind === "agent" ? pick(AGENTS) : pick(BUILDERS) };
  const isNewProject = kind === "builder" && type === "apartment" && purpose === "buy" && rand() < 0.4;

  let beds, baths, builtUpSqft, landCents, price, furnishing;
  if (type === "apartment") {
    beds = pick([1, 2, 2, 2, 3, 3, 4]);
    baths = Math.max(1, beds - (rand() < 0.4 ? 1 : 0));
    builtUpSqft = round(beds * between(420, 560) + 150, 10);
    price = builtUpSqft * loc.psf * between(0.9, 1.12);
  } else if (type === "villa" || type === "house") {
    beds = pick([3, 3, 4, 4, 5]);
    baths = beds - (rand() < 0.5 ? 1 : 0);
    builtUpSqft = round(beds * between(560, 760), 10);
    landCents = round(between(4, type === "house" ? 12 : 10), 0.5);
    price = builtUpSqft * loc.psf * 0.55 + landCents * loc.landPerCent * 0.8;
  } else if (type === "plot") {
    landCents = round(between(5, 25), 0.5);
    price = landCents * loc.landPerCent * between(0.9, 1.1);
  } else {
    builtUpSqft = round(between(600, 4000), 50);
    price = builtUpSqft * loc.psf * between(1.1, 1.4);
  }
  if (type !== "plot") furnishing = pick(["furnished", "semi", "semi", "unfurnished"]);

  if (purpose === "rent") {
    price = type === "commercial" ? builtUpSqft * between(45, 80) : price * between(0.0028, 0.0038);
    price = round(price, 500);
  } else {
    price = round(price, price > 1e7 ? 100000 : 50000);
  }

  const isLuxury = purpose === "buy" && price >= 25_000_000;
  const reraNeeded = purpose === "buy" && (kind === "builder" || isNewProject) && type !== "plot";
  const rera = reraNeeded
    ? rand() < 0.85
      ? { status: "registered", number: `K-RERA/PRJ/${loc.district === "Ernakulam" ? "ERN" : loc.district === "Kozhikode" ? "KKD" : "TVM"}/${String(Math.floor(between(10, 260))).padStart(3, "0")}/${pick([2023, 2024, 2025, 2026])}` }
      : { status: "pending" }
    : { status: "not_required" };

  const main = pick(IMG[type]);
  const images = [`/img/${main}.jpg`];
  if (type !== "plot") images.push(`/img/${pick(INTERIORS.filter((i) => i !== main))}.jpg`);

  const titleTpl = pick(TITLES[type]).replace("{b}", beds);
  const amen = [...AMENITIES[type]].sort(() => rand() - 0.5).slice(0, 3 + Math.floor(rand() * 2));
  if (isNewProject) amen.unshift(`Possession ${pick(["Mar 2027", "Dec 2027", "Jun 2028", "Dec 2028"])}`);

  generated.push({
    id,
    slug: `${titleTpl}-${loc.name}-${id}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title: `${titleTpl}, ${loc.name}`,
    purpose,
    type,
    price,
    ...(beds && { beds, baths }),
    ...(builtUpSqft && { builtUpSqft }),
    ...(landCents && { landCents }),
    ...(furnishing && { furnishing }),
    locality: loc.name,
    city: loc.city,
    district: loc.district,
    coords,
    rera,
    verified: rand() < 0.9,
    ...(isNewProject && { isNewProject }),
    ...(isLuxury && { isLuxury }),
    images,
    amenities: amen,
    postedBy,
    postedAt: daysAgo(Math.floor(between(0, 40))),
  });
}

/* Location facts for every listing, computed from OSM (never invented). */
const NEARBY_CATS = ["metro", "water_metro", "rail", "it_park", "hospital", "school", "college", "mall", "bus", "airport"];
// How far a place may be and still be worth a highlight on the card.
const HIGHLIGHT_KM = { metro: 2.5, water_metro: 2, it_park: 5, hospital: 2, mall: 2.5, rail: 2.5, airport: 12 };
// Lower = more important to a buyer when two places are equally close.
const PRIORITY = { metro: 1, it_park: 1, water_metro: 1.2, rail: 1.4, airport: 1.4, mall: 1.6, hospital: 1.6 };
const LABEL = { metro: "metro", water_metro: "Water Metro", rail: "railway station", it_park: "", hospital: "", mall: "", airport: "" };

function enrich(l) {
  const nearby = {};
  for (const cat of NEARBY_CATS) {
    const list = byCat[cat];
    if (!list?.length) continue;
    let best = null;
    for (const p of list) {
      if (cat === "hospital" && !p.major) continue;
      const d = km(l.coords, p.coords);
      if (!best || d < best.km) best = { name: p.name, km: d, status: p.status };
    }
    if (best && best.km <= 40)
      nearby[cat] = { name: best.name, km: +Math.max(0.1, best.km).toFixed(1), ...(best.status && { status: best.status }) };
  }
  const counts = {
    schools2km: (byCat.school ?? []).filter((p) => km(l.coords, p.coords) <= 2).length,
    hospitals3km: (byCat.hospital ?? []).filter((p) => km(l.coords, p.coords) <= 3).length,
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
  if (highlights.length < 2 && counts.schools2km > 0)
    highlights.push({ label: `${counts.schools2km} schools within 2 km`, km: 2, category: "school" });
  return { ...l, nearby, counts, highlights, flood: floodRisk(l.coords) };
}

const listings = [...curated, ...generated].map(enrich);

/* ─────────────── 4. Price grid (for heatmap) ─────────────── */
// Inverse-distance weighting from locality anchors, on a ~500 m grid,
// keeping only cells within 3 km of an anchor (avoids painting the sea).
const grid = [];
const STEP = 0.005;
for (const region of [
  [76.2, 9.9, 76.42, 10.13],
  [76.85, 8.48, 76.98, 8.6],
  [75.74, 11.2, 75.86, 11.32],
]) {
  for (let lng = region[0]; lng <= region[2]; lng += STEP)
    for (let lat = region[1]; lat <= region[3]; lat += STEP) {
      const c = [lng, lat];
      let num = 0, den = 0, nearest = Infinity;
      for (const a of localities) {
        const d = km(c, a.coords);
        nearest = Math.min(nearest, d);
        const w = 1 / Math.max(d, 0.3) ** 2;
        num += w * a.psf;
        den += w;
      }
      if (nearest <= 3) grid.push([+lng.toFixed(4), +lat.toFixed(4), Math.round(num / den)]);
    }
}

/* ─────────────── 5. Localities with live stats ─────────────── */
const localityOut = localities.map(({ weight, ...l }) => {
  const own = listings.filter((x) => x.locality === l.name);
  const nearest = (cat) => {
    let best = null;
    for (const p of byCat[cat] ?? []) {
      const d = km(l.coords, p.coords);
      if (!best || d < best.km) best = { name: p.name.replace(/ Station$/, ""), km: +Math.max(0.1, d).toFixed(1), ...(p.status && { status: p.status }) };
    }
    return best;
  };
  return {
    ...l,
    listingCount: own.length,
    nearby: { metro: nearest("metro"), it_park: nearest("it_park"), water_metro: nearest("water_metro") },
    schools2km: (byCat.school ?? []).filter((p) => km(l.coords, p.coords) <= 2).length,
  };
});

/* ─────────────── 6. Metro lines ─────────────── */
// OSM station points joined in official order. Pink Line is under construction:
// only InfoPark station is mapped, so the route between is approximate.
const BLUE_LINE = [
  "Aluva", "Pulinchodu", "Companypady", "Ambattukavu", "Muttom", "Kalamassery Town", "Cochin University",
  "Pathadipalam", "Edappally", "Changampuzha Park", "Palarivattom", "JLN Stadium", "Kaloor", "Town Hall",
  "M. G. Road", "Maharaja's College", "Ernakulam South", "Kadavanthra", "Elamkulam", "Vyttila", "Thykoodam",
  "Pettah", "Vadakkekotta", "SN Junction", "Thrippunithura Terminal",
];
const metroStations = byCat.metro ?? [];
const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
const station = (name) => metroStations.find((p) => norm(p.name).startsWith(norm(name)));
const bluePts = BLUE_LINE.map((n) => {
  const st = station(n);
  if (!st) console.warn(`! metro station not found: ${n}`);
  return st && { name: n, coords: st.coords };
}).filter(Boolean);
const infopark = station("InfoPark");
const pinkPts = [
  { name: "JLN Stadium", coords: station("JLN Stadium")?.coords },
  { name: "Palarivattom", coords: [76.3092, 10.0072] },
  { name: "Chembumukku", coords: [76.3185, 10.0128] },
  { name: "Vazhakkala", coords: [76.3256, 10.0177] },
  { name: "Padamugal", coords: [76.3316, 10.0204] },
  { name: "Kakkanad Junction", coords: [76.3419, 10.0159] },
  { name: "Cochin SEZ", coords: [76.3525, 10.0121] },
  { name: "InfoPark", coords: infopark?.coords },
].filter((p) => p.coords);
function withTimes(pts) {
  let t = 0;
  return pts.map((p, i) => {
    if (i) t += km(pts[i - 1].coords, p.coords);
    return { ...p, t: +t.toFixed(3) };
  });
}
const metroLines = [
  { id: "blue", name: "Kochi Metro Line 1", status: "operational", stops: withTimes(bluePts) },
  { id: "pink", name: "Kochi Metro Pink Line (Kakkanad)", status: "under_construction", approximate: true, stops: withTimes(pinkPts) },
];

/* ─────────────── write ─────────────── */
const write = (name, data) => {
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data));
  console.log(`${name}.json`.padEnd(20), Array.isArray(data) ? data.length : Object.keys(data).length);
};
write("pois", deduped);
write("listings", listings);
write("price-grid", { cols: ["lng", "lat", "psf"], rows: grid });
write("flood-zones", flood);
write("localities", localityOut);
write("metro-lines", metroLines);

const counts = Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, v.length]));
console.log("poi categories", counts);
