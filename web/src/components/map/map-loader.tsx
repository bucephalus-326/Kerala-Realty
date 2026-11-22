"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

// MapLibre and deck.gl need the browser (WebGL), so the explorer is loaded client-side only.
const MapExplorer = dynamic(() => import("./map-explorer").then((m) => m.MapExplorer), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-bg text-sm text-ink-3">
      <span className="flex items-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand/30 border-t-brand" /> Loading the map…
      </span>
    </div>
  ),
});

export function MapLoader() {
  return (
    <Suspense>
      <MapExplorer />
    </Suspense>
  );
}
