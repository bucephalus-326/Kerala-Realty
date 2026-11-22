# Data pipeline

```
data/raw/osm-*.json        ← scripts/fetch-osm.mjs   (OpenStreetMap via Overpass)
data/seed/*.json           ← hand-written demo seeds
        │
        └─ scripts/build-data.mjs ─→ web/src/data/generated/*.json  (what the app reads)
```

| File | What it is |
|---|---|
| `seed/listings-curated.json` | 19 hand-written listings |
| `seed/localities.json` | 24 localities with demo price per sq.ft, land price per cent and yearly change |
| `seed/flood-zones.geojson` | **Demo only.** Hand-drawn flood-prone belts. Replace with KSDMA maps before real use. |
| `raw/osm-{kochi,trivandrum,kozhikode}.json` | OSM extract: metro, Water Metro, rail, IT parks, schools, hospitals, colleges, malls, bus stations, airports |

`build-data.mjs` generates 41 more listings (seeded, so output is repeatable) to reach 60, then for every listing works out:

- the nearest place in each category and its distance (`nearby`)
- schools within 2 km and hospitals within 3 km (`counts`)
- the two most useful facts for the card (`highlights`)
- flood risk from the flood layer (`flood`)

It also writes a ~500 m price grid for the heatmap, and per-locality stats for comparisons.

Cleaning rules: places named only in Malayalam script are skipped; only major hospitals are used for highlights (OSM tags many clinics as hospitals); "malls" must look like malls by name; the InfoPark metro station on the Pink Line is marked under construction.

## Refresh

```bash
NODE_USE_ENV_PROXY=1 node scripts/fetch-osm.mjs            # all cities (or name some: kochi trivandrum)
node scripts/build-data.mjs
```

`NODE_USE_ENV_PROXY=1` only matters behind an HTTPS proxy. The fetch script falls back to public Overpass mirrors if the main server fails.

## Licence

OpenStreetMap data © OpenStreetMap contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright). The app credits it in the footer.
