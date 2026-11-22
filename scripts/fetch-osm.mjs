// Pulls points of interest from OpenStreetMap (Overpass API) for the demo cities.
// Output: data/raw/osm-<city>.json (raw elements).
// Run: NODE_USE_ENV_PROXY=1 node scripts/fetch-osm.mjs [city...]   (env var only matters behind a proxy)
import { writeFile } from "node:fs/promises";

const CITIES = {
  kochi: [9.9, 76.2, 10.14, 76.43],
  trivandrum: [8.47, 76.86, 8.62, 76.97],
  kozhikode: [11.2, 75.74, 11.33, 75.86],
};

const query = ([s, w, n, e]) => `
[out:json][timeout:120];
(
  nwr["amenity"~"^(school|hospital|college|university|ferry_terminal|bus_station)$"](${s},${w},${n},${e});
  nwr["railway"="station"](${s},${w},${n},${e});
  nwr["shop"="mall"](${s},${w},${n},${e});
  nwr["aeroway"="aerodrome"](${s},${w},${n},${e});
  nwr["name"~"Infopark|Technopark|Cyberpark|SmartCity|Smart City|Kinfra",i](${s},${w},${n},${e});
);
out center tags;`;

// Public Overpass endpoints, tried in order.
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function overpass(q) {
  let last;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "kerala-realty-demo/0.1" },
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(150_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      last = e;
      console.warn(`  ${new URL(url).host} failed: ${e.cause?.code ?? e.message}`);
    }
  }
  throw last;
}

const only = process.argv.slice(2);
for (const [city, bbox] of Object.entries(CITIES).filter(([c]) => !only.length || only.includes(c))) {
  const json = await overpass(query(bbox));
  await writeFile(`data/raw/osm-${city}.json`, JSON.stringify(json.elements));
  console.log(city, json.elements.length, "elements");
  await new Promise((r) => setTimeout(r, 3000)); // be polite to the public endpoint
}
