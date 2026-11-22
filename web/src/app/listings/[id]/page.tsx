import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer, MobileTabBar } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { ListingView } from "@/components/listing/listing-view";
import { site } from "@/config/site";
import { listings as generated, type Listing } from "@/data/listings";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** Live listing from the API; falls back to generated data only if the API can't be reached. */
async function getListing(id: string): Promise<Listing | null> {
  try {
    const res = await fetch(`${API_URL}/listings/${encodeURIComponent(id)}`, { next: { revalidate: 60 } });
    if (res.ok) return (await res.json()) as Listing;
    if (res.status === 404) return null;
  } catch {
    /* API down: use generated data */
  }
  return generated.find((l) => l.id === id) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const l = await getListing((await params).id);
  if (!l) return { title: `Listing not found · ${site.name}` };
  return {
    title: `${l.title}, ${l.locality} · ${site.name}`,
    description: `${l.purpose === "rent" ? "For rent" : "For sale"} in ${l.locality}, ${l.city}. ${l.highlights?.map((h) => `${h.km} km to ${h.label}`).join(", ") ?? ""}`,
    openGraph: { images: l.images?.[0] && !l.images[0].startsWith("/api/") ? [l.images[0]] : undefined },
  };
}

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const l = await getListing((await params).id);
  if (!l) notFound();
  return (
    <>
      <Navbar solid active="" />
      <main className="pb-24 pt-20 md:pt-24">
        <ListingView listing={l} />
      </main>
      <Footer />
      <MobileTabBar />
    </>
  );
}
