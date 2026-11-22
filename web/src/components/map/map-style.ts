import type { StyleSpecification, LayerSpecification } from "maplibre-gl";

/**
 * Loads an OpenFreeMap style and repaints it in the app's theme:
 * near-black land, deep-teal water, thin neon roads, extruded buildings.
 */
const BASE = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron",
};

const PALETTE = {
  dark: {
    background: "#05080a",
    water: "#0a2630",
    waterway: "#0d3441",
    landuse: "#080d0c",
    green: "#0a1511",
    building: "#13201c",
    road: { minor: "#13221e", major: "#1b3a31", motorway: "#21604b", rail: "#173430" },
    label: "#8aa197",
    labelHalo: "#05080a",
    placeLabel: "#cfe3d8",
  },
  light: {
    background: "#eef1ec",
    water: "#c9e4e8",
    waterway: "#b6dadf",
    landuse: "#e8ece6",
    green: "#dfe9dc",
    building: "#dde2da",
    road: { minor: "#ffffff", major: "#fdfdfb", motorway: "#bfe8d2", rail: "#cfd6d0" },
    label: "#5d6d65",
    labelHalo: "#ffffff",
    placeLabel: "#1c2a23",
  },
};

export type MapTheme = keyof typeof BASE;

const cache = new Map<MapTheme, StyleSpecification>();

export async function loadStyle(theme: MapTheme): Promise<StyleSpecification> {
  const hit = cache.get(theme);
  if (hit) return hit;
  const res = await fetch(BASE[theme]);
  if (!res.ok) throw new Error(`Map style failed to load (${res.status})`);
  const style = recolor((await res.json()) as StyleSpecification, theme);
  cache.set(theme, style);
  return style;
}

function recolor(style: StyleSpecification, theme: MapTheme): StyleSpecification {
  const c = PALETTE[theme];
  const vectorSource = Object.entries(style.sources).find(([, s]) => s.type === "vector")?.[0] ?? "openmaptiles";
  const layers: LayerSpecification[] = [];

  for (const layer of style.layers) {
    const l = structuredClone(layer) as LayerSpecification & { paint?: Record<string, unknown>; layout?: Record<string, unknown> };
    const id = l.id;
    l.paint = l.paint ?? {};
    // Some layers reference sprite patterns the style doesn't ship; flat colour suits the look anyway.
    delete l.paint["fill-pattern"];

    // Hide the low-zoom shaded-relief raster; it fights the flat futuristic look.
    if (l.type === "raster") continue;

    if (l.type === "background") l.paint["background-color"] = c.background;
    else if (id === "water") l.paint["fill-color"] = c.water;
    else if (id === "waterway") l.paint["line-color"] = c.waterway;
    else if (id.startsWith("landuse") || id.startsWith("landcover_ice") || id.startsWith("landcover_glacier")) {
      l.paint["fill-color"] = c.landuse;
    } else if (id.includes("wood") || id.includes("park")) {
      if (l.type === "fill") l.paint["fill-color"] = c.green;
    } else if (id === "building") {
      // Replaced by the 3D building layer below.
      continue;
    } else if (l.type === "line" && /highway_motorway|motorway/.test(id)) {
      l.paint["line-color"] = c.road.motorway;
    } else if (l.type === "line" && /highway_major|major/.test(id)) {
      l.paint["line-color"] = c.road.major;
    } else if (l.type === "line" && /highway|road|path|pier/.test(id)) {
      l.paint["line-color"] = c.road.minor;
    } else if (l.type === "line" && id.startsWith("railway")) {
      l.paint["line-color"] = c.road.rail;
    } else if (l.type === "line" && id.startsWith("boundary")) {
      l.paint["line-opacity"] = 0.25;
    }

    if (l.type === "symbol") {
      const isPlace = /place|label_(city|town|village|other)/.test(id);
      l.paint["text-color"] = isPlace ? c.placeLabel : c.label;
      l.paint["text-halo-color"] = c.labelHalo;
      l.paint["text-halo-width"] = 1.2;
      // Road shields and one-way arrows add noise; drop them.
      if (/shield|oneway/.test(id)) continue;
    }
    layers.push(l);
  }

  // 3D buildings (OpenMapTiles has render_height for many buildings).
  const firstSymbol = layers.findIndex((l) => l.type === "symbol");
  const buildings: LayerSpecification = {
    id: "building-3d",
    type: "fill-extrusion",
    source: vectorSource,
    "source-layer": "building",
    minzoom: 13,
    paint: {
      "fill-extrusion-color": c.building,
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": theme === "dark" ? 0.9 : 0.75,
    },
  };
  layers.splice(firstSymbol === -1 ? layers.length : firstSymbol, 0, buildings);

  return { ...style, layers };
}
