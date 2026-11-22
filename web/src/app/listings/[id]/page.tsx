import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Footer, MobileTabBar } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { ListingView } from "@/components/listing/listing-view";
import { site } from "@/config/site";
import { listings as generated, type Listing } from "@/data/listings";
import { apiFetch } from "@/lib/server-api";

/**
 * Live listing from the API. If the API can't be reached (for example while the
 * free server wakes up), the generated demo data is used; a listing that only
 * exists in the database shows the "try again" error page instead of a false 404.
 */
const getListing = cache(async (id: string): Promise<Listing | null> => {
  try {
    const res = await apiFetch(`/listings/${encodeURIComponent(id)}`, { next: { revalidate: 60 } });
    if (res.ok) return (await res.json()) as Listing;
    if (res.status === 404) return null;
  } catch {
    /* API down or slow: fall through */
  }
  const fallback = generated.find((l) => l.id === id);
  if (fallback) return fallback;
  throw new Error("Listings are temporarily unavailable");
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const l = await getListing((await params).id);
  if (!l) return { title: `Listing not found · ${site.name}` };
  return {
    title: `${l.title}, ${l.locality} · ${site.name}`,
    description: `${l.purpose === "rent" ? "For rent" : "For sale"} in ${l.locality}, ${l.city}. ${l.highlights?.map((h) => `${h.km} km to ${h.label}`).join(", ") ?? ""}`,
    alternates: { canonical: `/listings/${l.id}` },
    openGraph: { images: l.images?.[0] ? [l.images[0]] : undefined },
  };
}

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const l = await getListing((await params).id);
  if (!l) notFound();
  return (
    <>
      <Navbar solid active="" />
      <main className="pb-24 pt-20 md:pt-24">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(l) }} />
        <ListingView listing={l} />
      </main>
      <Footer />
      <MobileTabBar />
    </>
  );
}

/** schema.org data for search engines. `<` is escaped so listing text can't close the script tag. */
function jsonLd(l: Listing) {
  const data = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: l.title,
    url: `${site.url}/listings/${l.id}`,
    image: l.images?.map((src) => new URL(src, site.url).toString()),
    datePosted: l.postedAt,
    offers: { "@type": "Offer", price: l.price, priceCurrency: "INR", businessFunction: l.purpose === "rent" ? "http://purl.org/goodrelations/v1#LeaseOut" : "http://purl.org/goodrelations/v1#Sell" },
    contentLocation: {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: l.locality, addressRegion: "Kerala", addressCountry: "IN" },
      geo: { "@type": "GeoCoordinates", latitude: l.coords[1], longitude: l.coords[0] },
    },
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
