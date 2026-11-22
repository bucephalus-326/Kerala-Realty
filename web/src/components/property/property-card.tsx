"use client";

import clsx from "clsx";
import {
  Bath,
  BedDouble,
  Box,
  Bus,
  Cpu,
  GraduationCap,
  Heart,
  Hospital,
  LandPlot,
  MapPin,
  MessageCircle,
  Plane,
  Ruler,
  School,
  Ship,
  ShoppingBag,
  Sparkles,
  TrainFront,
  TramFront,
  Waves,
} from "lucide-react";
import Image from "next/image";
import { site } from "@/config/site";
import { TYPE_LABEL, type Listing, type PoiCategory } from "@/data/listings";
import { formatPrice } from "@/lib/currency";
import { usePrefs } from "../providers";
import { buttonClass, ReraBadge } from "../ui/primitives";

const SQFT_PER_CENT = 435.6;

const POI_ICON: Record<PoiCategory, React.ElementType> = {
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

export function PropertyCard({
  listing: l,
  reasons,
  priority = false,
}: {
  listing: Listing;
  reasons?: string[];
  priority?: boolean;
}) {
  const { currency, landUnit, saved, toggleSaved } = usePrefs();
  const isSaved = saved.has(l.id);
  const isRent = l.purpose === "rent";

  // Unit price: plots by land, everything else by built-up area.
  let unitPrice: string | null = null;
  if (!isRent) {
    if (l.type === "plot" && l.landCents) {
      unitPrice =
        landUnit === "cents"
          ? `${formatPrice(l.price / l.landCents, currency)} / cent`
          : `${formatPrice(l.price / (l.landCents * SQFT_PER_CENT), currency, { compact: false })} / sq.ft`;
    } else if (l.builtUpSqft) {
      unitPrice = `${formatPrice(l.price / l.builtUpSqft, currency, { compact: false })} / sq.ft`;
    }
  }

  const land =
    l.landCents &&
    (landUnit === "cents"
      ? `${l.landCents} cents`
      : `${Math.round(l.landCents * SQFT_PER_CENT).toLocaleString("en-IN")} sq.ft`);

  const waText = encodeURIComponent(`Hi, I'm interested in "${l.title}" (${l.id}) in ${l.locality}. Is it available?`);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-strong shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-float">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={l.images[0]}
          alt={`${l.title} in ${l.locality}`}
          fill
          priority={priority}
          sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 90vw"
          className="object-cover transition-transform duration-700 group-hover:scale-[1.05]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/30" />

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {l.rera.status === "registered" ? (
            <ReraBadge number={l.rera.number} />
          ) : l.verified ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/45 px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-white backdrop-blur-md">
              Verified owner
            </span>
          ) : null}
          {l.isNewProject && (
            <span className="rounded-full bg-[#2dd4bf] px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide text-[#032521]">
              New launch
            </span>
          )}
          {l.isLuxury && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e3b95c] px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide text-[#1a1203]">
              <Sparkles className="h-3 w-3" /> Luxury
            </span>
          )}
        </div>

        <button
          onClick={() => toggleSaved(l.id)}
          aria-label={isSaved ? "Remove from saved" : "Save property"}
          aria-pressed={isSaved}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md transition hover:scale-110"
        >
          <Heart className={clsx("h-[17px] w-[17px] transition", isSaved && "fill-[#ff5a6e] text-[#ff5a6e]")} />
        </button>

        <p className="absolute bottom-3 left-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
          For {isRent ? "rent" : "sale"} · {TYPE_LABEL[l.type]}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display text-[22px] font-semibold tracking-tight text-ink">
            {formatPrice(l.price, currency)}
            {isRent && <span className="text-sm font-normal text-ink-3"> /mo</span>}
          </p>
          {unitPrice && <p className="text-right text-xs text-ink-3">{unitPrice}</p>}
        </div>

        <div>
          <h3 className="line-clamp-1 font-medium text-ink">{l.title}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-3">
            <MapPin className="h-3.5 w-3.5 shrink-0" /> {l.locality}, {l.city}
          </p>
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-2">
          {l.beds && (
            <li className="flex items-center gap-1.5">
              <BedDouble className="h-4 w-4 text-ink-3" /> {l.beds} BHK
            </li>
          )}
          {l.baths && (
            <li className="flex items-center gap-1.5">
              <Bath className="h-4 w-4 text-ink-3" /> {l.baths}
            </li>
          )}
          {l.builtUpSqft && (
            <li className="flex items-center gap-1.5">
              <Ruler className="h-4 w-4 text-ink-3" /> {l.builtUpSqft.toLocaleString("en-IN")} sq.ft
            </li>
          )}
          {land && (
            <li className="flex items-center gap-1.5">
              <LandPlot className="h-4 w-4 text-ink-3" /> {land}
            </li>
          )}
        </ul>

        {reasons && reasons.length > 0 ? (
          <ul className="space-y-1 rounded-xl border border-brand/25 bg-brand-soft px-3 py-2 text-[12.5px] text-ink-2">
            {reasons.map((r) => (
              <li key={r} className="flex items-start gap-1.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" /> {r}
              </li>
            ))}
          </ul>
        ) : (
          l.highlights.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-ink-2">
              {l.highlights.map((h) => {
                const Icon = POI_ICON[h.category];
                return (
                  <li key={h.label} className="flex min-w-0 items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-water" />
                    <span className="truncate">
                      {h.category === "school" ? h.label : `${h.km} km · ${h.label}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        )}

        {l.flood.level !== "low" && (
          <p
            className="inline-flex w-fit items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-[11.5px] font-medium text-danger"
            title={`${l.flood.zone} (demo flood layer, not official data)`}
          >
            <Waves className="h-3.5 w-3.5" /> {l.flood.level === "high" ? "High" : "Moderate"} monsoon flood risk
          </p>
        )}

        <div className="mt-auto grid grid-cols-[auto_1fr] gap-2 pt-1">
          <button className={buttonClass("outline", "sm")} aria-label={`3D tour of ${l.title}`}>
            <Box className="h-4 w-4" /> Tour
          </button>
          <a
            href={`https://wa.me/${site.whatsapp}?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass("whatsapp", "sm")}
          >
            <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
          </a>
        </div>
      </div>
    </article>
  );
}
