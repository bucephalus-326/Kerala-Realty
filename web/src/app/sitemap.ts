import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { listings as generated } from "@/data/listings";
import { apiFetch } from "@/lib/server-api";

export const revalidate = 3600;

/** Public pages plus every live listing (from the API; the generated demo set if it's asleep). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let ids: { id: string; postedAt?: string }[] = generated;
  try {
    const res = await apiFetch("/listings?limit=500", { next: { revalidate: 3600 } });
    if (res.ok) ids = ((await res.json()) as { items: { id: string; postedAt?: string }[] }).items;
  } catch {
    /* keep the generated list */
  }
  const page = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({ url: `${site.url}${path}`, changeFrequency: "daily", priority });
  return [
    page("/", 1),
    page("/map", 0.8),
    page("/about", 0.5),
    page("/privacy", 0.3),
    ...ids.map((l) => ({ url: `${site.url}/listings/${l.id}`, lastModified: l.postedAt ? new Date(l.postedAt) : undefined, priority: 0.7 })),
  ];
}
