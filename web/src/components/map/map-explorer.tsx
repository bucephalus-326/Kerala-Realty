"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import clsx from "clsx";
import {
  Box,
  ChevronUp,
  Compass,
  Layers as LayersIcon,
  MapPin,
  MessageCircle,
  Minus,
  PenLine,
  Plus,
  Square,
  Trash2,
  Waves,
  X,
} from "lucide-react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { site } from "@/config/site";
import metroLinesRaw from "@/data/generated/metro-lines.json";
import { listings, TYPE_LABEL, type Listing, type PropertyType, type Purpose } from "@/data/listings";
import { floodZones, pois, priceGrid } from "@/data/places";
import { formatPrice } from "@/lib/currency";
import { inPolygon, km } from "@/lib/geo";
import { BUDGETS, DEFAULT_FILTERS, filterListings, rankListings } from "@/lib/search";
import { usePrefs } from "../providers";
import { buttonClass } from "../ui/primitives";
import { buildLayers, type MetroLine, POI_STYLE, PRICE_DOMAIN, PRICE_RAMP } from "./layers";
import { loadStyle } from "./map-style";

const metroLines = metroLinesRaw as MetroLine[];

const CITIES = {
  kochi: { label: "Kochi", center: [76.315, 10.005] as [number, number], zoom: 11.6 },
  trivandrum: { label: "Trivandrum", center: [76.905, 8.545] as [number, number], zoom: 12 },
  kozhikode: { label: "Kozhikode", center: [75.795, 11.262] as [number, number], zoom: 12.2 },
};
type CityKey = keyof typeof CITIES;

const LAYER_DEFS = [
  { key: "price", label: "Price heat", color: "#3ee58e" },
  { key: "density", label: "Listing density", color: "#8b9cff" },
  { key: "metro", label: "Metro lines", color: "#2dd4bf" },
  { key: "water", label: "Water Metro", color: "#38bdf8" },
  { key: "it", label: "IT parks", color: "#8b9cff" },
  { key: "hospitals", label: "Hospitals", color: "#ff6b61" },
  { key: "schools", label: "Schools", color: "#e3b95c" },
  { key: "flood", label: "Flood risk (demo)", color: "#ff6b61" },
] as const;
type LayerKey = (typeof LAYER_DEFS)[number]["key"];

const LINK_COLORS: Record<string, [number, number, number, number]> = {
  metro: [45, 212, 191, 255],
  it_park: [139, 156, 255, 255],
  hospital: [255, 107, 97, 255],
  water_metro: [56, 189, 248, 255],
};

export function MapExplorer() {
  const params = useSearchParams();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const { currency } = usePrefs();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const markersRef = useRef(new Map<string, { marker: maplibregl.Marker; el: HTMLButtonElement }>());

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [is3d, setIs3d] = useState(true);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    price: true,
    density: false,
    metro: true,
    water: false,
    it: true,
    hospitals: false,
    schools: false,
    flood: false,
  });
  const [purpose, setPurpose] = useState<Purpose>("buy");
  const [type, setType] = useState<PropertyType | "any">("any");
  const [budgetMax, setBudgetMax] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("listing"));
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [area, setArea] = useState<[number, number][] | null>(null);
  const [bounds, setBounds] = useState<maplibregl.LngLatBounds | null>(null);
  const [time, setTime] = useState(0);
  const [zoom, setZoom] = useState(10);
  const [font, setFont] = useState("system-ui, sans-serif");
  useEffect(() => setFont(getComputedStyle(document.body).fontFamily), []);
  const [panelOpen, setPanelOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [city, setCity] = useState<CityKey>(() => {
    const c = params.get("city");
    if (c && c in CITIES) return c as CityKey;
    const l = listings.find((x) => x.id === params.get("listing"));
    if (l?.city === "Thiruvananthapuram") return "trivandrum";
    if (l?.city === "Kozhikode") return "kozhikode";
    return "kochi";
  });

  /* ── Derived data ── */
  const filtered = useMemo(() => {
    const base = filterListings(listings, { ...DEFAULT_FILTERS, purpose, type, budgetMax });
    return area ? base.filter((l) => inPolygon(l.coords, area)) : base;
  }, [purpose, type, budgetMax, area]);

  const inView = useMemo(() => {
    const visible = bounds ? filtered.filter((l) => bounds.contains(l.coords)) : filtered;
    return rankListings(visible, { ...DEFAULT_FILTERS, purpose, type, budgetMax }).map((r) => r.listing);
  }, [filtered, bounds, purpose, type, budgetMax]);

  const selected = useMemo(() => listings.find((l) => l.id === selectedId) ?? null, [selectedId]);

  const links = useMemo(() => {
    if (!selected) return [];
    return (["metro", "it_park", "hospital", "water_metro"] as const).flatMap((cat) => {
      let best: { p: (typeof pois)[number]; d: number } | null = null;
      for (const p of pois) {
        if (p.category !== cat || (cat === "hospital" && !p.major)) continue;
        const d = km(selected.coords, p.coords);
        if (!best || d < best.d) best = { p, d };
      }
      if (!best || best.d > 6) return [];
      const base = best.p.name.replace(/ Station$/i, "");
      const name =
        cat === "metro"
          ? `${base} metro${best.p.status === "under_construction" ? " (u/c)" : ""}`
          : cat === "water_metro" && !/water metro/i.test(base)
            ? `${base} Water Metro`
            : base;
      return [{ from: selected.coords, to: best.p.coords, color: LINK_COLORS[cat], label: `${name} · ${best.d.toFixed(1)} km` }];
    });
  }, [selected]);

  /* ── Responsive defaults ── */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      setIsMobile(mq.matches);
      if (mq.matches) setIs3d(false);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /* ── Map init ── */
  useEffect(() => {
    let cancelled = false;
    const markers = markersRef.current;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    loadStyle(dark ? "dark" : "light")
      .then((style) => {
        if (cancelled || !containerRef.current) return;
        const c = CITIES[city];
        const map = new maplibregl.Map({
          container: containerRef.current,
          style,
          center: c.center,
          zoom: c.zoom - 2.2,
          pitch: mobile ? 0 : 20,
          bearing: 0,
          maxPitch: 70,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        const overlay = new MapboxOverlay({
          interleaved: false,
          layers: [],
          getTooltip: ({ object, layer }) => {
            if (!object || !layer) return null;
            const id = layer.id;
            let text: string | null = null;
            if (id.startsWith("poi-")) text = `${object.name}\n${POI_STYLE[object.category]?.label ?? ""}`;
            else if (id.startsWith("metro-stations")) text = `${object.name} metro`;
            else if (id.startsWith("metro-core")) text = object.name + (object.status === "under_construction" ? " (under construction, approx. route)" : "");
            else if (id === "price-columns") text = `≈ ${formatPrice(object[2], currency, { compact: false })} / sq.ft`;
            else if (id === "flood") text = `${object.properties.name}\n${object.properties.risk} risk (demo data)`;
            return text
              ? { text, style: { background: "rgba(8,14,11,0.92)", color: "#eef5f0", borderRadius: "10px", fontSize: "12px", padding: "8px 10px", whiteSpace: "pre-line", border: "1px solid rgba(255,255,255,0.1)" } }
              : null;
          },
        });
        map.addControl(overlay);
        overlayRef.current = overlay;

        map.on("load", () => {
          setReady(true);
          setBounds(map.getBounds());
          const sel = listings.find((l) => l.id === params.get("listing"));
          map.flyTo({
            center: sel?.coords ?? c.center,
            zoom: sel ? 14 : c.zoom,
            pitch: mobile ? 0 : 55,
            bearing: mobile ? 0 : -18,
            duration: 2600,
            essential: true,
          });
        });
        map.on("moveend", () => {
          setBounds(map.getBounds());
          setZoom(map.getZoom());
        });
        map.on("error", (e) => console.warn("map:", e.error?.message));
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      overlayRef.current = null;
      setReady(false);
    };
    // The map is created once; theme and city changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Theme switch: restyle base map in place ── */
  const firstTheme = useRef(true);
  useEffect(() => {
    if (firstTheme.current) {
      firstTheme.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    loadStyle(dark ? "dark" : "light").then((style) => map.setStyle(style));
  }, [dark]);

  /* ── Animation clock for metro pulses ── */
  useEffect(() => {
    if (!layers.metro || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      setTime((t) => t + ((now - last) / 1000) * 3.2);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [layers.metro]);

  /* ── Deck layers ── */
  useEffect(() => {
    overlayRef.current?.setProps({
      layers: buildLayers({
        dark,
        zoom,
        font,
        is3d,
        time,
        layers,
        priceGrid,
        listings: filtered,
        pois,
        metroLines,
        floodZones: floodZones as GeoJSON.FeatureCollection,
        selected,
        links,
        draft,
        area,
      }),
    });
  }, [dark, zoom, font, is3d, time, layers, filtered, selected, links, draft, area, ready]);

  /* ── Price-pill markers ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const store = markersRef.current;
    const keep = new Set(filtered.map((l) => l.id));
    for (const [id, m] of store) {
      if (!keep.has(id)) {
        m.marker.remove();
        store.delete(id);
      }
    }
    for (const l of filtered) {
      let entry = store.get(l.id);
      if (!entry) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "map-pill";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          focusRef.current(l);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(l.coords).addTo(map);
        entry = { marker, el };
        store.set(l.id, entry);
      }
      entry.el.textContent = formatPrice(l.price, currency) + (l.purpose === "rent" ? "/mo" : "");
      entry.el.setAttribute("aria-label", `${l.title}, ${formatPrice(l.price, currency)}`);
      entry.el.dataset.selected = String(l.id === selectedId);
      // Below street level, pills collapse to dots so dense areas stay readable.
      entry.el.dataset.compact = String(zoom < 13.2 && l.id !== selectedId);
      entry.el.dataset.tier = l.isLuxury ? "luxury" : l.flood.level !== "low" ? "flood" : "default";
    }
  }, [filtered, currency, selectedId, ready, zoom]);

  /* ── Drawing ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (drawing) setDraft((d) => [...d, [e.lngLat.lng, e.lngLat.lat]]);
      else setSelectedId(null);
    };
    map.on("click", onClick);
    map.getCanvas().style.cursor = drawing ? "crosshair" : "";
    if (drawing) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
    return () => {
      map.off("click", onClick);
    };
  }, [drawing, ready]);

  /* ── Camera helpers ── */
  const flyToCity = useCallback(
    (k: CityKey) => {
      setCity(k);
      setArea(null);
      mapRef.current?.flyTo({ center: CITIES[k].center, zoom: CITIES[k].zoom, pitch: is3d ? 55 : 0, bearing: is3d ? -18 : 0, duration: 2200 });
    },
    [is3d],
  );

  const toggle3d = () => {
    const next = !is3d;
    setIs3d(next);
    mapRef.current?.easeTo({ pitch: next ? 55 : 0, bearing: next ? -18 : 0, duration: 900 });
  };

  const focus = (l: Listing) => {
    setSelectedId(l.id);
    setPanelOpen(false);
    mapRef.current?.flyTo({ center: l.coords, zoom: Math.max(mapRef.current.getZoom(), 14), duration: 1400, padding: isMobile ? { top: 0, right: 0, bottom: 260, left: 0 } : { top: 0, right: 0, bottom: 0, left: 380 } });
  };

  // Marker click handlers are created once, so they call the latest `focus` through a ref.
  const focusRef = useRef(focus);
  useEffect(() => {
    focusRef.current = focus;
  });

  const finishDrawing = () => {
    if (draft.length >= 3) setArea(draft);
    setDraft([]);
    setDrawing(false);
  };

  const budgets = BUDGETS[purpose];

  /* ─────────────────────────── UI ─────────────────────────── */
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05080a]">
      <div ref={containerRef} className="h-full w-full" aria-label="Interactive property map" role="application" />

      {!ready && !error && (
        <div className="absolute inset-0 grid place-items-center bg-bg">
          <div className="flex flex-col items-center gap-3 text-ink-3">
            <span className="h-10 w-10 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
            <p className="text-sm">Loading the map…</p>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-bg p-6 text-center">
          <div>
            <p className="font-display text-lg font-semibold">The map couldn&apos;t load</p>
            <p className="mt-1 text-sm text-ink-3">{error}. Check your connection and refresh.</p>
          </div>
        </div>
      )}

      {/* City switcher */}
      <div className="glass-bar absolute left-3 top-3 z-10 flex gap-0.5 rounded-full p-1 shadow-float md:left-[396px] md:gap-1">
        {(Object.keys(CITIES) as CityKey[]).map((k) => (
          <button
            key={k}
            onClick={() => flyToCity(k)}
            aria-pressed={city === k}
            className={clsx(
              "rounded-full px-2.5 py-1.5 text-xs font-medium transition md:px-3 md:text-[13px]",
              city === k ? "bg-brand text-brand-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {CITIES[k].label}
          </button>
        ))}
      </div>

      {/* Layer panel */}
      <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
        <button
          onClick={() => setLayersOpen((v) => !v)}
          className="glass-bar grid h-10 w-10 place-items-center rounded-xl text-ink shadow-float md:hidden"
          aria-expanded={layersOpen}
          aria-label="Map layers"
        >
          <LayersIcon className="h-4 w-4" />
        </button>
        <div className={clsx("glass w-60 rounded-2xl p-3 shadow-float", !layersOpen && "max-md:hidden")}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-3">Layers</p>
            <button
              onClick={toggle3d}
              disabled={isMobile}
              className={clsx(
                "flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition",
                is3d ? "border-brand bg-brand-soft text-brand" : "border-line-strong text-ink-2",
                isMobile && "opacity-40",
              )}
              aria-pressed={is3d}
              title={isMobile ? "3D is off on small screens" : "Toggle 3D"}
            >
              {is3d ? <Box className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />} {is3d ? "3D" : "2D"}
            </button>
          </div>
          <ul className="space-y-0.5">
            {LAYER_DEFS.map((d) => (
              <li key={d.key}>
                <button
                  onClick={() => setLayers((s) => ({ ...s, [d.key]: !s[d.key] }))}
                  aria-pressed={layers[d.key]}
                  className={clsx(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition hover:bg-muted",
                    layers[d.key] ? "text-ink" : "text-ink-3",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full transition"
                    style={{ background: d.color, opacity: layers[d.key] ? 1 : 0.3, boxShadow: layers[d.key] ? `0 0 10px ${d.color}` : "none" }}
                  />
                  <span className="flex-1">{d.label}</span>
                  <span
                    className={clsx("h-4 w-7 rounded-full p-0.5 transition", layers[d.key] ? "bg-brand" : "bg-muted")}
                    aria-hidden
                  >
                    <span className={clsx("block h-3 w-3 rounded-full bg-white transition", layers[d.key] && "translate-x-3")} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {layers.price && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-1.5 text-[11px] text-ink-3">Asking price / sq.ft (demo)</p>
              <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${PRICE_RAMP.map((c) => `rgb(${c.join(" ")})`).join(",")})` }} />
              <div className="mt-1 flex justify-between text-[10.5px] tabular-nums text-ink-3">
                <span>{formatPrice(PRICE_DOMAIN[0], currency, { compact: false })}</span>
                <span>{formatPrice(PRICE_DOMAIN[1], currency, { compact: false })}+</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Map controls */}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+132px)] right-3 z-10 flex flex-col gap-2 md:bottom-6">
        <div className="glass flex flex-col overflow-hidden rounded-xl shadow-float">
          <IconBtn label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><Plus className="h-4 w-4" /></IconBtn>
          <IconBtn label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><Minus className="h-4 w-4" /></IconBtn>
          <IconBtn label="Reset north" onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: is3d ? 55 : 0 })}><Compass className="h-4 w-4" /></IconBtn>
        </div>
      </div>

      {/* Draw area */}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+132px)] left-1/2 z-10 -translate-x-1/2 md:bottom-6">
        {drawing ? (
          <div className="glass flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 shadow-float">
            <span className="text-[13px] text-ink-2">
              {draft.length < 3 ? `Tap the map to add corners (${draft.length}/3+)` : `${draft.length} corners`}
            </span>
            <button onClick={finishDrawing} disabled={draft.length < 3} className={buttonClass("primary", "sm")}>
              Search area
            </button>
            <button onClick={() => { setDrawing(false); setDraft([]); }} className={buttonClass("ghost", "sm")} aria-label="Cancel drawing">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : area ? (
          <div className="glass flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 shadow-float">
            <span className="text-[13px] font-medium text-ink">{filtered.length} homes in your area</span>
            <button onClick={() => setArea(null)} className={buttonClass("outline", "sm")}>
              <Trash2 className="h-4 w-4" /> Clear
            </button>
          </div>
        ) : (
          <button onClick={() => { setDrawing(true); setSelectedId(null); }} className={clsx(buttonClass("primary", "md"), "rounded-full shadow-float")}>
            <PenLine className="h-4 w-4" /> Draw search area
          </button>
        )}
      </div>

      {/* Results panel: side panel on desktop, bottom sheet on mobile */}
      <aside
        className={clsx(
          "glass-bar absolute z-20 flex flex-col shadow-float transition-[height] duration-300",
          "inset-x-0 bottom-0 rounded-t-3xl md:inset-x-auto md:bottom-3 md:left-3 md:top-3 md:w-[372px] md:rounded-3xl",
          panelOpen ? "max-md:h-[68dvh]" : "max-md:h-[118px]",
        )}
        aria-label="Homes in view"
      >
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="flex w-full flex-col items-center pt-2 md:hidden"
          aria-expanded={panelOpen}
          aria-label={panelOpen ? "Collapse list" : "Expand list"}
        >
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </button>

        <div className="border-b border-line p-4 max-md:pt-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-display text-lg font-semibold leading-tight">{inView.length} homes in view</p>
              <p className="text-xs text-ink-3">
                {area ? "Inside your drawn area" : `Move the map to explore ${CITIES[city].label}`}
              </p>
            </div>
            <button onClick={() => setPanelOpen((v) => !v)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:bg-muted md:hidden" aria-hidden tabIndex={-1}>
              <ChevronUp className={clsx("h-4 w-4 transition", panelOpen && "rotate-180")} />
            </button>
          </div>
          <div className={clsx("mt-3 grid grid-cols-3 gap-2", !panelOpen && "max-md:hidden")}>
            <div className="col-span-3 flex rounded-xl bg-muted p-1">
              {(["buy", "rent"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPurpose(p); setBudgetMax(null); }}
                  aria-pressed={purpose === p}
                  className={clsx("flex-1 rounded-lg py-1.5 text-[13px] font-semibold capitalize transition", purpose === p ? "bg-surface-strong text-ink shadow-card" : "text-ink-3")}
                >
                  {p}
                </button>
              ))}
            </div>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PropertyType | "any")}
              aria-label="Property type"
              className="col-span-1 h-9 rounded-lg border border-line-strong bg-transparent px-2 text-[13px] text-ink"
            >
              <option value="any" className="bg-elevated">All types</option>
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v} className="bg-elevated">{l}</option>
              ))}
            </select>
            <select
              value={String(budgetMax)}
              onChange={(e) => setBudgetMax(e.target.value === "null" ? null : Number(e.target.value))}
              aria-label="Budget"
              className="col-span-2 h-9 rounded-lg border border-line-strong bg-transparent px-2 text-[13px] text-ink"
            >
              {budgets.map((b) => (
                <option key={String(b.value)} value={String(b.value)} className="bg-elevated">{b.label}</option>
              ))}
            </select>
          </div>
        </div>

        <ul
          className={clsx(
            "flex-1 overflow-y-auto p-2",
            !panelOpen && "max-md:flex max-md:gap-2 max-md:overflow-x-auto max-md:overflow-y-hidden max-md:px-3 max-md:pt-0 no-scrollbar",
          )}
        >
          {inView.length === 0 && (
            <li className="p-6 text-center text-sm text-ink-3">No homes here with these filters. Zoom out or try another area.</li>
          )}
          {inView.map((l) => (
            <li key={l.id} className={clsx(!panelOpen && "max-md:hidden")}>
              <MiniCard listing={l} active={l.id === selectedId} onClick={() => focus(l)} />
            </li>
          ))}
        </ul>
      </aside>

      {/* Selected listing */}
      {selected && (
        <div className="rise absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+128px)] z-30 md:bottom-6 md:left-auto md:right-[68px] md:w-[340px]">
          <SelectedCard listing={selected} links={links.map((x) => x.label)} onClose={() => setSelectedId(null)} />
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="grid h-10 w-10 place-items-center text-ink-2 transition hover:bg-muted hover:text-ink">
      {children}
    </button>
  );
}

function MiniCard({ listing: l, active, onClick }: { listing: Listing; active: boolean; onClick: () => void }) {
  const { currency } = usePrefs();
  const h = l.highlights[0];
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex w-full gap-3 rounded-2xl p-2 text-left transition",
        active ? "bg-brand-soft ring-1 ring-brand" : "hover:bg-muted",
      )}
    >
      <span className="relative h-[76px] w-[92px] shrink-0 overflow-hidden rounded-xl">
        <Image src={l.images[0]} alt="" fill sizes="92px" className="object-cover" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[15px] font-semibold">
          {formatPrice(l.price, currency)}
          {l.purpose === "rent" && <span className="text-xs font-normal text-ink-3"> /mo</span>}
        </span>
        <span className="block truncate text-[13px] text-ink">{l.title}</span>
        <span className="flex items-center gap-1 truncate text-xs text-ink-3">
          <MapPin className="h-3 w-3 shrink-0" /> {l.locality} · {TYPE_LABEL[l.type]}
        </span>
        {h && h.category !== "school" && (
          <span className="mt-0.5 block truncate text-[11.5px] text-water">
            {h.km} km · {h.label}
          </span>
        )}
      </span>
    </button>
  );
}

function SelectedCard({ listing: l, links, onClose }: { listing: Listing; links: string[]; onClose: () => void }) {
  const { currency } = usePrefs();
  const wa = encodeURIComponent(`Hi, I'm interested in "${l.title}" (${l.id}) in ${l.locality}. Is it available?`);
  return (
    <article className="glass overflow-hidden rounded-3xl shadow-float">
      <div className="relative h-28">
        <Image src={l.images[0]} alt={l.title} fill sizes="360px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur">
          <X className="h-4 w-4" />
        </button>
        <div className="absolute bottom-3 left-4 text-white">
          <p className="font-display text-2xl font-semibold">
            {formatPrice(l.price, currency)}
            {l.purpose === "rent" && <span className="text-sm font-normal text-white/70"> /mo</span>}
          </p>
          <p className="text-[13px] text-white/80">{l.title}</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <ul className="space-y-1 text-[12.5px] text-ink-2">
          {links.map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {t}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#e3b95c]" /> {l.counts.schools2km} schools within 2 km
          </li>
        </ul>
        {l.flood.level !== "low" && (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-[11.5px] font-medium text-danger">
            <Waves className="h-3.5 w-3.5" /> {l.flood.zone} · demo flood layer
          </p>
        )}
        <a
          href={`https://wa.me/${site.whatsapp}?text=${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          className={clsx(buttonClass("whatsapp", "md"), "w-full")}
        >
          <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
        </a>
      </div>
    </article>
  );
}
