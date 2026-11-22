"use client";

import clsx from "clsx";
import {
  Bath,
  BedDouble,
  Bus,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Cpu,
  GraduationCap,
  Heart,
  Hospital,
  LandPlot,
  Map,
  MapPin,
  MessageCircle,
  Phone,
  Plane,
  Ruler,
  School,
  Ship,
  ShieldCheck,
  ShoppingBag,
  Sofa,
  TrainFront,
  TramFront,
  Waves,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { site } from "@/config/site";
import { localities } from "@/data/localities";
import { TYPE_LABEL, type Listing, type PoiCategory } from "@/data/listings";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { LeadForm } from "../leads/lead-form";
import { ReportListing } from "./report-listing";
import { isUpload } from "../listings-provider";
import { usePrefs } from "../providers";
import { buttonClass, ReraBadge } from "../ui/primitives";
import { VisitDialog } from "../visits/visit-dialog";

const ICON: Record<PoiCategory, React.ElementType> = {
  metro: TramFront,
  water_metro: Ship,
  rail: TrainFront,
  it_park: Cpu,
  hospital: Hospital,
  school: School,
  college: GraduationCap,
  mall: ShoppingBag,
  bus: Bus,
  airport: Plane,
};
const NEARBY_LABEL: Record<PoiCategory, string> = {
  metro: "Metro",
  water_metro: "Water Metro",
  rail: "Railway",
  it_park: "IT park",
  hospital: "Hospital",
  school: "School",
  college: "College",
  mall: "Mall",
  bus: "Bus station",
  airport: "Airport",
};

type FullListing = Listing & { description?: string; videoUrl?: string; possession?: string; status?: string };

function youTubeId(url?: string) {
  const m = url?.match(/(?:v=|youtu\.be\/)([\w-]{6,})/);
  return m?.[1];
}

export function ListingView({ listing }: { listing: Listing }) {
  const l = listing as FullListing;
  const { currency, saved, toggleSaved } = usePrefs();
  const [photo, setPhoto] = useState(0);
  const [booking, setBooking] = useState(false);
  const [callback, setCallback] = useState(false);
  const isRent = l.purpose === "rent";
  const isSaved = saved.has(l.id);
  const area = localities.find((x) => x.name === l.locality);
  const psf = !isRent && l.builtUpSqft ? Math.round(l.price / l.builtUpSqft) : null;
  const yt = youTubeId(l.videoUrl);
  const wa = encodeURIComponent(`Hi, I'm interested in "${l.title}" (${l.id}) in ${l.locality}. Is it available?`);

  // Count the view (once per visitor per day, server-side).
  useEffect(() => {
    api(`/listings/${l.id}/view`, { method: "POST" }).catch(() => {});
  }, [l.id]);

  const specs = [
    l.beds && { icon: BedDouble, k: "Bedrooms", v: `${l.beds} BHK` },
    l.baths && { icon: Bath, k: "Bathrooms", v: String(l.baths) },
    l.builtUpSqft && { icon: Ruler, k: "Built-up", v: `${l.builtUpSqft.toLocaleString("en-IN")} sq.ft` },
    l.landCents && { icon: LandPlot, k: "Land", v: `${l.landCents} cents` },
    l.furnishing && { icon: Sofa, k: "Furnishing", v: l.furnishing === "semi" ? "Semi-furnished" : l.furnishing[0].toUpperCase() + l.furnishing.slice(1) },
  ].filter(Boolean) as { icon: React.ElementType; k: string; v: string }[];

  const nearby = (Object.entries(l.nearby ?? {}) as [PoiCategory, { name: string; km: number; status?: string }][])
    .filter(([, n]) => n.km <= 15)
    .sort((a, b) => a[1].km - b[1].km);

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6">
      <nav className="mb-4 text-xs text-ink-3" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-ink">Home</Link> / <span>{l.city}</span> / <span>{l.locality}</span>
      </nav>

      {/* Gallery */}
      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-muted">
          <Image
            src={l.images[photo]}
            unoptimized={isUpload(l.images[photo])}
            alt={`${l.title}, photo ${photo + 1} of ${l.images.length}`}
            fill
            priority
            sizes="(min-width:1024px) 70vw, 100vw"
            className="object-cover"
          />
          <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">
            {l.rera.status === "registered" && <ReraBadge number={l.rera.number} />}
            {l.isNewProject && <span className="rounded-full bg-[#2dd4bf] px-2 py-1 text-[10.5px] font-bold uppercase text-[#032521]">New launch</span>}
          </div>
          {l.images.length > 1 && (
            <>
              <button onClick={() => setPhoto((p) => (p - 1 + l.images.length) % l.images.length)} aria-label="Previous photo" className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/60">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button onClick={() => setPhoto((p) => (p + 1) % l.images.length)} aria-label="Next photo" className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/60">
                <ChevronRight className="h-5 w-5" />
              </button>
              <span className="absolute bottom-3 right-3 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white">
                {photo + 1} / {l.images.length}
              </span>
            </>
          )}
        </div>
        <div className="hidden grid-rows-2 gap-3 lg:grid">
          {[1, 2].map((i) =>
            l.images[i] ? (
              <button key={i} onClick={() => setPhoto(i)} className="relative overflow-hidden rounded-3xl" aria-label={`Show photo ${i + 1}`}>
                <Image src={l.images[i]} unoptimized={isUpload(l.images[i])} alt="" fill sizes="300px" className="object-cover transition hover:scale-105" />
              </button>
            ) : (
              <Link key={i} href={`/map?listing=${l.id}`} className="grid place-items-center rounded-3xl border border-line bg-surface-strong text-sm text-ink-2 hover:border-brand">
                <span className="flex flex-col items-center gap-2">
                  <Map className="h-6 w-6 text-brand" /> See the neighbourhood map
                </span>
              </Link>
            ),
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              For {isRent ? "rent" : "sale"} · {TYPE_LABEL[l.type]}
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight md:text-4xl">{l.title}</h1>
            <p className="mt-2 flex items-center gap-1.5 text-ink-3">
              <MapPin className="h-4 w-4" /> {l.locality}, {l.city}, {l.district}
            </p>
          </header>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {specs.map(({ icon: I, k, v }) => (
              <li key={k} className="rounded-2xl border border-line bg-surface-strong p-3">
                <I className="h-5 w-5 text-ink-3" />
                <p className="mt-2 text-xs text-ink-3">{k}</p>
                <p className="font-medium">{v}</p>
              </li>
            ))}
          </ul>

          {l.description && (
            <section>
              <h2 className="font-display text-xl font-semibold">About this home</h2>
              <p className="mt-2 whitespace-pre-line leading-relaxed text-ink-2">{l.description}</p>
            </section>
          )}

          {l.amenities?.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-semibold">Amenities</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {l.amenities.map((a) => (
                  <li key={a} className="rounded-full border border-line-strong px-3 py-1.5 text-sm text-ink-2">
                    {a}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {yt && (
            <section>
              <h2 className="font-display text-xl font-semibold">Video walk-through</h2>
              <div className="mt-3 aspect-video overflow-hidden rounded-2xl border border-line">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${yt}`}
                  title={`Video of ${l.title}`}
                  loading="lazy"
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                />
              </div>
            </section>
          )}

          <section>
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-display text-xl font-semibold">What&apos;s nearby</h2>
              <Link href={`/map?listing=${l.id}`} className="text-sm text-brand hover:underline">
                Open on the map
              </Link>
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {nearby.map(([cat, n]) => {
                const I = ICON[cat];
                return (
                  <li key={cat} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-strong px-3 py-2.5">
                    <I className="h-5 w-5 shrink-0 text-water" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-ink-3">{NEARBY_LABEL[cat]}</span>
                      <span className="block truncate text-sm">
                        {n.name}
                        {n.status === "under_construction" && " (under construction)"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">{n.km} km</span>
                  </li>
                );
              })}
              <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface-strong px-3 py-2.5">
                <School className="h-5 w-5 shrink-0 text-gold" />
                <span className="flex-1 text-sm">{l.counts.schools2km} schools within 2 km</span>
              </li>
            </ul>
            {l.flood.level !== "low" && (
              <p className="mt-3 flex items-start gap-2 rounded-2xl bg-danger/10 px-3 py-2.5 text-sm text-danger">
                <Waves className="mt-0.5 h-4 w-4 shrink-0" /> In the {l.flood.zone} ({l.flood.level} monsoon flood risk). Demo flood layer, not official data.
              </p>
            )}
            <p className="mt-2 text-[11px] text-ink-3">Places © OpenStreetMap contributors. Straight-line distances.</p>
          </section>
        </div>

        {/* Action column */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-line bg-surface-strong p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-3xl font-semibold tracking-tight">
                  {formatPrice(l.price, currency)}
                  {isRent && <span className="text-base font-normal text-ink-3"> /month</span>}
                </p>
                {psf && <p className="text-sm text-ink-3">{formatPrice(psf, currency, { compact: false })} / sq.ft</p>}
              </div>
              <button onClick={() => toggleSaved(l.id)} aria-label={isSaved ? "Remove from saved" : "Save property"} aria-pressed={isSaved} className="grid h-11 w-11 place-items-center rounded-full border border-line-strong hover:border-brand">
                <Heart className={clsx("h-5 w-5", isSaved ? "fill-[#ff5a6e] text-[#ff5a6e]" : "text-ink-2")} />
              </button>
            </div>
            {psf && area && (
              <p className={clsx("mt-3 rounded-xl px-3 py-2 text-xs", psf > area.psf * 1.15 ? "bg-gold-soft text-gold" : "bg-brand-soft text-brand")}>
                {psf > area.psf * 1.15 ? "Above" : psf < area.psf * 0.85 ? "Below" : "Close to"} the {area.name} average of{" "}
                {formatPrice(area.psf, currency, { compact: false })}/sq.ft (indicative).
              </p>
            )}
            {l.possession && <p className="mt-2 text-xs text-ink-3">Possession: {l.possession}</p>}
            <div className="mt-4 grid gap-2">
              <button onClick={() => setBooking(true)} className={buttonClass("primary", "lg")}>
                <CalendarPlus className="h-4 w-4" /> Book a visit or video tour
              </button>
              <a href={`https://wa.me/${site.whatsapp}?text=${wa}`} target="_blank" rel="noopener noreferrer" className={buttonClass("whatsapp", "lg")}>
                <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
              </a>
              <button onClick={() => setCallback((v) => !v)} className={buttonClass("outline", "md")} aria-expanded={callback}>
                <Phone className="h-4 w-4" /> Request a call back
              </button>
            </div>
            {callback && (
              <div className="mt-3">
                <LeadForm listingIds={[l.id]} source="listing" />
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-line bg-surface-strong p-5 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4 text-brand" /> {l.verified ? "Verified listing" : "Verification in progress"}
            </p>
            <p className="mt-1 text-ink-3">
              Posted by {l.postedBy.kind === "owner" ? "the owner (no brokerage)" : `${l.postedBy.name} (${l.postedBy.kind})`}
            </p>
            <p className="mt-1 text-ink-3">
              K-RERA: {l.rera.status === "registered" ? <span className="font-mono text-xs text-ink">{l.rera.number}</span> : l.rera.status === "not_required" ? "not required for this property" : "registration pending"}
            </p>
            <p className="mt-1 text-xs text-ink-3">Listing {l.id}</p>
            <div className="mt-3 border-t border-line pt-3">
              <ReportListing listingId={l.id} />
            </div>
          </div>
        </aside>
      </div>
      {booking && <VisitDialog listing={l} onClose={() => setBooking(false)} />}
    </div>
  );
}
