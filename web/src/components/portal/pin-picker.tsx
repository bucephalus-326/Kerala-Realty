"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { loadStyle } from "../map/map-style";

/**
 * Click or drag the pin to set the exact location. Distances to metro, IT parks,
 * schools and hospitals are computed from this point on save.
 */
export default function PinPicker({
  value,
  center,
  onChange,
}: {
  value?: [number, number];
  center: [number, number];
  onChange: (c: [number, number]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    loadStyle(resolvedTheme === "light" ? "light" : "dark").then((style) => {
      if (cancelled || !ref.current) return;
      const map = new maplibregl.Map({ container: ref.current, style, center: value ?? center, zoom: value ? 15 : 13.5, attributionControl: { compact: true } });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const el = document.createElement("div");
      el.className = "pin-marker";
      const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: "bottom" });
      const place = (c: [number, number]) => {
        marker.setLngLat(c).addTo(map);
        onChangeRef.current([+c[0].toFixed(5), +c[1].toFixed(5)]);
      };
      if (value) marker.setLngLat(value).addTo(map);
      map.on("click", (e) => place([e.lngLat.lng, e.lngLat.lat]));
      marker.on("dragend", () => {
        const p = marker.getLngLat();
        place([p.lng, p.lat]);
      });
      mapRef.current = map;
      markerRef.current = marker;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Created once; later centre changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the locality changes and no pin is set yet, move the view there.
  useEffect(() => {
    if (!value) mapRef.current?.flyTo({ center, zoom: 14, duration: 800 });
  }, [center, value]);

  return <div ref={ref} className="h-[340px] w-full overflow-hidden rounded-2xl border border-line" role="application" aria-label="Map: click to place the property pin" />;
}
