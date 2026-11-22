"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { listings as generated, type Listing } from "@/data/listings";

/**
 * Listings for the whole site. Starts with the generated data (instant, works
 * offline), then swaps in the live published listings from the API, which
 * include homes owners and agents have added through the portal.
 */
const ListingsContext = createContext<Listing[]>(generated);

export function ListingsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Listing[]>(generated);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/listings?limit=500", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: Listing[] } | null) => {
        if (!cancelled && d?.items?.length) setItems(d.items);
      })
      .catch(() => {
        /* keep generated data */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return <ListingsContext.Provider value={items}>{children}</ListingsContext.Provider>;
}

export const useListings = () => useContext(ListingsContext);

/** Uploaded photos are already resized by the portal; skip Next's optimiser for them. */
export const isUpload = (src?: string) => !!src?.startsWith("/api/");
