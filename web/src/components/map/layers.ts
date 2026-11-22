import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { Layer } from "@deck.gl/core";
import { TripsLayer } from "@deck.gl/geo-layers";
import { ArcLayer, ColumnLayer, GeoJsonLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Listing } from "@/data/listings";
import type { Poi } from "@/data/places";

type RGBA = [number, number, number, number];

/** Layers that must stay visible above the 3D price columns. */
const ON_TOP = { parameters: { depthCompare: "always" as const } };
export type MetroLine = {
  id: string;
  name: string;
  status: "operational" | "under_construction";
  approximate?: boolean;
  stops: { name: string; coords: [number, number]; t: number }[];
};

/** Price ramp: deep teal → brand green → gold → coral (₹/sq.ft low → high). */
export const PRICE_RAMP: [number, number, number][] = [
  [13, 78, 74],
  [32, 160, 120],
  [62, 229, 142],
  [190, 225, 90],
  [227, 185, 92],
  [255, 122, 89],
];
export const PRICE_DOMAIN: [number, number] = [3800, 12500];

function rampColor(v: number, alpha = 255): RGBA {
  const [lo, hi] = PRICE_DOMAIN;
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo))) * (PRICE_RAMP.length - 1);
  const i = Math.floor(t);
  const f = t - i;
  const a = PRICE_RAMP[i];
  const b = PRICE_RAMP[Math.min(i + 1, PRICE_RAMP.length - 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, alpha];
}

export const POI_STYLE: Record<string, { color: RGBA; radius: number; label: string }> = {
  it_park: { color: [139, 156, 255, 255], radius: 9, label: "IT park" },
  metro: { color: [45, 212, 191, 255], radius: 5, label: "Metro" },
  water_metro: { color: [56, 189, 248, 255], radius: 5, label: "Water Metro" },
  hospital: { color: [255, 107, 97, 255], radius: 4, label: "Hospital" },
  school: { color: [227, 185, 92, 255], radius: 2.5, label: "School" },
};

export interface LayerState {
  dark: boolean;
  zoom: number;
  /** Resolved app font stack (next/font renames families, so it is read from the DOM). */
  font: string;
  is3d: boolean;
  time: number;
  layers: Record<string, boolean>;
  priceGrid: [number, number, number][];
  listings: Listing[];
  pois: Poi[];
  metroLines: MetroLine[];
  floodZones: GeoJSON.FeatureCollection;
  selected: Listing | null;
  links: { from: [number, number]; to: [number, number]; label: string; color: RGBA }[];
  draft: [number, number][];
  area: [number, number][] | null;
}

export function buildLayers(s: LayerState): Layer[] {
  const out: Layer[] = [];
  const ink: RGBA = s.dark ? [238, 245, 240, 255] : [20, 34, 28, 255];
  const halo: RGBA = s.dark ? [5, 8, 10, 230] : [255, 255, 255, 230];

  const street = Math.min(1, Math.max(0, (s.zoom - 12.5) / 2)); // 0 at city zoom → 1 at street zoom
  const colScale = 1 - 0.75 * street;
  const colAlpha = 1 - 0.6 * street;

  /* Price */
  if (s.layers.price) {
    if (s.is3d) {
      out.push(
        new ColumnLayer<[number, number, number]>({
          id: "price-columns",
          // Every other cell on a checkerboard keeps the 3D view airy and readable.
          data: s.priceGrid.filter((d) => (Math.round(d[0] / 0.005) + Math.round(d[1] / 0.005)) % 2 === 0),
          diskResolution: 6,
          radius: 190,
          extruded: true,
          pickable: true,
          elevationScale: 1,
          getPosition: (d) => [d[0], d[1]],
          // Columns shrink and fade as you zoom in to street level so homes stay readable.
          getElevation: (d) => Math.max(0, d[2] - 3200) * 0.09 * colScale,
          getFillColor: (d) => rampColor(d[2], Math.round((s.dark ? 120 : 150) * colAlpha)),
          updateTriggers: { getElevation: colScale, getFillColor: colAlpha },
          material: { ambient: 0.6, diffuse: 0.5, shininess: 40 },
          transitions: { getElevation: { duration: 900 } },
        }),
      );
    } else {
      out.push(
        new HeatmapLayer<[number, number, number]>({
          id: "price-heat",
          data: s.priceGrid,
          getPosition: (d) => [d[0], d[1]],
          getWeight: (d) => Math.max(0.05, (d[2] - 3200) / 9000),
          radiusPixels: 55,
          intensity: 1,
          threshold: 0.04,
          aggregation: "MEAN",
          colorRange: PRICE_RAMP.map(([r, g, b], i) => [r, g, b, 40 + i * 30]) as RGBA[],
        }),
      );
    }
  }

  /* Listing density */
  if (s.layers.density) {
    out.push(
      new HeatmapLayer<Listing>({
        id: "density",
        data: s.listings,
        getPosition: (d) => d.coords,
        radiusPixels: 70,
        intensity: 1.4,
        threshold: 0.05,
        colorRange: [
          [70, 40, 160, 0],
          [110, 70, 220, 90],
          [139, 156, 255, 140],
          [180, 200, 255, 180],
          [225, 235, 255, 210],
          [255, 255, 255, 230],
        ],
      }),
    );
  }

  /* Flood risk */
  if (s.layers.flood) {
    out.push(
      new GeoJsonLayer({
        id: "flood",
          ...ON_TOP,
        data: s.floodZones,
        filled: true,
        stroked: true,
        pickable: true,
        getFillColor: (f: GeoJSON.Feature) => (f.properties?.risk === "high" ? [255, 90, 80, 85] : [255, 140, 90, 60]),
        getLineColor: [255, 107, 97, 200],
        getLineWidth: 2,
        lineWidthUnits: "pixels",
      }),
    );
  }

  /* Metro lines: glow underlay + animated light pulses + stations */
  if (s.layers.metro) {
    for (const line of s.metroLines) {
      const uc = line.status === "under_construction";
      const color: RGBA = uc ? [244, 114, 182, 255] : [45, 212, 191, 255];
      out.push(
        new PathLayer({
          id: `metro-glow-${line.id}`,
          ...ON_TOP,
          data: [line],
          getPath: (d: MetroLine) => d.stops.map((p) => p.coords),
          getColor: [color[0], color[1], color[2], uc ? 40 : 60],
          getWidth: 12,
          widthUnits: "pixels",
          jointRounded: true,
          capRounded: true,
        }),
        new PathLayer({
          id: `metro-core-${line.id}`,
          ...ON_TOP,
          data: [line],
          pickable: true,
          getPath: (d: MetroLine) => d.stops.map((p) => p.coords),
          getColor: [color[0], color[1], color[2], uc ? 150 : 230],
          getWidth: uc ? 2 : 3,
          widthUnits: "pixels",
          jointRounded: true,
        }),
        new TripsLayer({
          id: `metro-pulse-${line.id}`,
          ...ON_TOP,
          data: [0, 1, 2, 3].map((k) => ({ line, offset: k * (line.stops.at(-1)!.t / 4) })),
          getPath: (d: { line: MetroLine }) => d.line.stops.map((p) => p.coords),
          getTimestamps: (d: { line: MetroLine; offset: number }) => d.line.stops.map((p) => p.t + d.offset),
          currentTime: s.time % (line.stops.at(-1)!.t * 1.25) + line.stops.at(-1)!.t / 4,
          trailLength: 1.6,
          getColor: uc ? [255, 190, 225] : [190, 255, 240],
          getWidth: 4,
          widthUnits: "pixels",
          capRounded: true,
          fadeTrail: true,
        }),
        new ScatterplotLayer({
          id: `metro-stations-${line.id}`,
          ...ON_TOP,
          data: line.status === "operational" ? line.stops : line.stops.slice(-1),
          pickable: true,
          getPosition: (d: MetroLine["stops"][number]) => d.coords,
          getRadius: 4,
          radiusUnits: "pixels",
          getFillColor: s.dark ? [5, 8, 10, 255] : [255, 255, 255, 255],
          getLineColor: color,
          stroked: true,
          getLineWidth: 2,
          lineWidthUnits: "pixels",
        }),
      );
    }
  }

  /* Places */
  const poiLayer = (cat: string, labels = false) => {
    const st = POI_STYLE[cat];
    const data = s.pois.filter((p) => p.category === cat && (cat !== "hospital" || p.major));
    out.push(
      new ScatterplotLayer<Poi>({
        id: `poi-${cat}`,
          ...ON_TOP,
        data,
        pickable: true,
        getPosition: (d) => d.coords,
        getRadius: st.radius,
        radiusUnits: "pixels",
        radiusMinPixels: st.radius,
        getFillColor: [st.color[0], st.color[1], st.color[2], 220],
        stroked: true,
        getLineColor: [st.color[0], st.color[1], st.color[2], 90],
        getLineWidth: st.radius * 1.6,
        lineWidthUnits: "pixels",
      }),
    );
    if (labels) {
      out.push(
        new TextLayer<Poi>({
          id: `poi-${cat}-label`,
          ...ON_TOP,
          data,
          getPosition: (d) => d.coords,
          getText: (d) => d.name.toUpperCase(),
          getSize: 11,
          getColor: [st.color[0], st.color[1], st.color[2], 255],
          getPixelOffset: [12, 0],
          getTextAnchor: "start",
          fontFamily: s.font,
          fontWeight: 700,
          characterSet: "auto",
          outlineWidth: 3,
          outlineColor: halo,
          fontSettings: { sdf: true },
        }),
      );
    }
  };
  if (s.layers.schools) poiLayer("school");
  if (s.layers.hospitals) poiLayer("hospital");
  if (s.layers.water) poiLayer("water_metro");
  if (s.layers.it) poiLayer("it_park", true);

  /* Drawn search area */
  const ring = s.area ?? (s.draft.length ? s.draft : null);
  if (ring) {
    out.push(
      new PolygonLayer({
        id: "area",
          ...ON_TOP,
        data: [ring],
        getPolygon: (d: [number, number][]) => d,
        filled: !!s.area,
        getFillColor: [62, 229, 142, 28],
        getLineColor: [62, 229, 142, 230],
        getLineWidth: 2,
        lineWidthUnits: "pixels",
        stroked: true,
      }),
      new ScatterplotLayer({
        id: "area-vertices",
          ...ON_TOP,
        data: ring,
        getPosition: (d: [number, number]) => d,
        getRadius: 5,
        radiusUnits: "pixels",
        getFillColor: [62, 229, 142, 255],
      }),
    );
  }

  /* Selection: distance rings + arcs to the nearest key places */
  if (s.selected) {
    const c = s.selected.coords;
    out.push(
      new ScatterplotLayer({
        id: "rings",
          ...ON_TOP,
        data: [1000, 2000, 3000],
        getPosition: () => c,
        getRadius: (d: number) => d,
        filled: false,
        stroked: true,
        getLineColor: (d: number) => [62, 229, 142, d === 1000 ? 200 : d === 2000 ? 130 : 70],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
      }),
      new TextLayer({
        id: "ring-labels",
          fontFamily: s.font,
          ...ON_TOP,
        data: [1, 2, 3],
        getPosition: (d: number) => [c[0], c[1] + (d * 1000) / 111_000],
        getText: (d: number) => `${d} km`,
        getSize: 11,
        getColor: [62, 229, 142, 230],
        getPixelOffset: [0, -6],
        outlineWidth: 3,
        outlineColor: halo,
        fontSettings: { sdf: true },
        fontWeight: 600,
      }),
      new ArcLayer({
        id: "links",
        data: s.links,
        getSourcePosition: (d: LayerState["links"][number]) => d.from,
        getTargetPosition: (d: LayerState["links"][number]) => d.to,
        getSourceColor: [62, 229, 142, 255],
        getTargetColor: (d: LayerState["links"][number]) => d.color,
        getWidth: 2.5,
        getHeight: 0.6,
        greatCircle: false,
      }),
      new TextLayer({
        id: "link-labels",
          fontFamily: s.font,
          ...ON_TOP,
        data: s.links,
        getPosition: (d: LayerState["links"][number]) => d.to,
        getText: (d: LayerState["links"][number]) => d.label,
        getSize: 12,
        getColor: ink,
        getPixelOffset: [0, -16],
        outlineWidth: 4,
        outlineColor: halo,
        fontSettings: { sdf: true },
        fontWeight: 600,
        characterSet: "auto",
      }),
    );
  }

  return out;
}

export function priceToColorCss(v: number) {
  const [r, g, b] = rampColor(v);
  return `rgb(${r | 0} ${g | 0} ${b | 0})`;
}
