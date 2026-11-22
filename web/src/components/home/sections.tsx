"use client";

import clsx from "clsx";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Clock,
  Cpu,
  FileCheck2,
  Hospital,
  Layers,
  ListChecks,
  MessageCircle,
  Plane,
  Scale,
  ShieldCheck,
  TrendingUp,
  Upload,
  UserCheck,
  Video,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { site } from "@/config/site";
import { listings } from "@/data/listings";
import { localities } from "@/data/places";
import { CURRENCIES, formatPrice } from "@/lib/currency";
import { usePrefs } from "../providers";
import { buttonClass, SectionHeading } from "../ui/primitives";

/* ─────────────────────────── Localities ─────────────────────────── */

// Presentation only (photo + one-liner). Prices and counts come from generated data.
const LOCALITY_CARDS = [
  { name: "Kakkanad", img: "/img/villa-6.jpg", note: "IT corridor · Infopark · SmartCity" },
  { name: "Edappally", img: "/img/apt-1.jpg", note: "Metro · Lulu · hospitals" },
  { name: "Vyttila", img: "/img/villa-7.jpg", note: "Mobility hub · Water Metro" },
  { name: "Fort Kochi", img: "/img/villa-8.jpg", note: "Heritage · waterfront" },
  { name: "Kazhakkoottam", img: "/img/house-2.jpg", note: "Technopark · airport" },
  { name: "Mavoor Road", img: "/img/villa-3.jpg", note: "Cyberpark · medical college" },
];
const LOCALITY_STATS = LOCALITY_CARDS.map((c) => ({ ...localities.find((l) => l.name === c.name)!, ...c }));

export function LocalityGrid() {
  const { currency } = usePrefs();
  return (
    <section id="projects" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-14 md:px-6">
      <SectionHeading
        eyebrow="Explore Kerala"
        title="Where Kerala is buying"
        sub="Average asking price per sq.ft and yearly change. Indicative figures from demo data."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LOCALITY_STATS.map((l, i) => {
          const count = l.listingCount;
          return (
            <Link
              key={l.name}
              href="/#featured"
              className={clsx(
                "group relative isolate flex min-h-[220px] flex-col justify-end overflow-hidden rounded-3xl p-5 text-white",
                (i === 0 || i === 3 || i === 5) && "lg:col-span-2",
              )}
            >
              <Image src={l.img} alt="" fill sizes="(min-width:1024px) 33vw, 100vw" className="-z-20 object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/30 to-black/5" />
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-white/60">{l.city}</p>
                  <h3 className="font-display text-2xl font-semibold">{l.name}</h3>
                  <p className="mt-1 text-[13px] text-white/70">{l.note}</p>
                </div>
                <div className="glass-dark shrink-0 rounded-2xl px-3 py-2 text-right">
                  <p className="text-[15px] font-semibold">{formatPrice(l.psf, currency, { compact: false })}<span className="text-xs font-normal text-white/60">/sq.ft</span></p>
                  <p className="flex items-center justify-end gap-1 text-xs text-[#3ee58e]">
                    <TrendingUp className="h-3.5 w-3.5" /> +{l.yoy}% YoY
                  </p>
                </div>
              </div>
              <span className="absolute right-4 top-4 rounded-full bg-white/15 px-2.5 py-1 text-xs backdrop-blur">
                {count} verified {count === 1 ? "listing" : "listings"}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────────── Map preview ─────────────────────────── */

// Simple linear projection for the Kochi bounding box onto a 600×600 viewBox.
const BBOX = { w: 76.2, e: 76.4, n: 10.12, s: 9.92 };
const px = (lng: number, lat: number) => ({
  x: ((lng - BBOX.w) / (BBOX.e - BBOX.w)) * 600,
  y: ((BBOX.n - lat) / (BBOX.n - BBOX.s)) * 600,
});
const METRO_L1: [number, number][] = [
  [76.357, 10.1004], [76.3218, 10.0567], [76.3083, 10.0261], [76.292, 9.9973], [76.2828, 9.9783], [76.3181, 9.969], [76.3456, 9.9481],
];
const METRO_L2: [number, number][] = [[76.292, 9.9973], [76.3076, 10.0047], [76.3419, 10.0159], [76.3633, 10.0098]];
const path = (pts: [number, number][]) =>
  pts.map(([lng, lat], i) => {
    const p = px(lng, lat);
    return `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }).join(" ");

const LAYERS = [
  { key: "price", label: "Price heat", color: "#3ee58e" },
  { key: "metro", label: "Metro lines", color: "#2dd4bf" },
  { key: "it", label: "IT parks", color: "#8b9cff" },
  { key: "flood", label: "Flood risk", color: "#ff6b61" },
] as const;

export function MapPreview() {
  const [on, setOn] = useState<Record<string, boolean>>({ price: true, metro: true, it: true, flood: false });
  const kochi = listings.filter((l) => l.city === "Kochi");
  const infopark = px(76.3633, 10.0098);
  const smartcity = px(76.3735, 10.0005);

  return (
    <section id="map" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-14 md:px-6">
      <div className="grid items-center gap-8 overflow-hidden rounded-[28px] border border-line bg-[#05080a] p-5 text-white md:p-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#2dd4bf]">Live map</p>
          <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            See the city, <span className="text-gradient">not just the listing</span>
          </h2>
          <p className="mt-3 text-[15px] text-white/60">
            Price heat, metro lines, IT parks, hospitals, schools and flood zones, layered over every verified home.
            Built on OpenStreetMap.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2">
            {LAYERS.map((l) => (
              <button
                key={l.key}
                onClick={() => setOn((s) => ({ ...s, [l.key]: !s[l.key] }))}
                aria-pressed={on[l.key]}
                className={clsx(
                  "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition",
                  on[l.key] ? "border-white/20 bg-white/[0.06]" : "border-white/[0.06] text-white/45",
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color, boxShadow: on[l.key] ? `0 0 12px ${l.color}` : "none", opacity: on[l.key] ? 1 : 0.35 }} />
                {l.label}
              </button>
            ))}
          </div>
          <Link href="/#map" className={clsx(buttonClass("primary", "md"), "mt-6")}>
            <Layers className="h-4 w-4" /> Open full map
          </Link>
        </div>

        <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#070c0e] sm:aspect-[4/3] lg:aspect-square">
          <svg viewBox="40 20 540 560" className="absolute inset-0 h-full w-full" role="img" aria-label="Stylised map of Kochi showing listings, metro lines and price heat">
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M24 0H0V24" fill="none" stroke="#14302a" strokeWidth=".6" />
              </pattern>
              <radialGradient id="heat-hot"><stop offset="0" stopColor="#3ee58e" stopOpacity=".55" /><stop offset="1" stopColor="#3ee58e" stopOpacity="0" /></radialGradient>
              <radialGradient id="heat-gold"><stop offset="0" stopColor="#e3b95c" stopOpacity=".5" /><stop offset="1" stopColor="#e3b95c" stopOpacity="0" /></radialGradient>
              <radialGradient id="flood"><stop offset="0" stopColor="#ff6b61" stopOpacity=".45" /><stop offset="1" stopColor="#ff6b61" stopOpacity="0" /></radialGradient>
              <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <rect x="0" y="0" width="600" height="600" fill="url(#grid)" />
            {/* Arabian Sea and harbour backwaters (stylised) */}
            <path d="M0 0H52C40 120 30 260 44 380C56 470 70 540 86 600H0Z" fill="#0b2a33" />
            <path d="M150 0C170 90 196 170 200 250C204 330 186 400 196 470C204 530 232 570 250 600H160C150 560 140 520 138 470C134 400 150 340 140 270C132 200 110 110 104 0Z" fill="#0b2a33" opacity=".9" />
            <path d="M560 0C520 60 500 90 470 110C440 130 430 160 400 175" fill="none" stroke="#0e3a44" strokeWidth="10" strokeLinecap="round" />

            {on.flood && (
              <g>
                <ellipse cx="210" cy="330" rx="70" ry="110" fill="url(#flood)" />
                <ellipse cx="470" cy="120" rx="80" ry="50" fill="url(#flood)" />
              </g>
            )}
            {on.price && (
              <g>
                <circle cx={px(76.3419, 10.0159).x} cy={px(76.3419, 10.0159).y} r="95" fill="url(#heat-hot)" />
                <circle cx={px(76.3083, 10.0261).x} cy={px(76.3083, 10.0261).y} r="70" fill="url(#heat-hot)" />
                <circle cx={px(76.2953, 9.9568).x} cy={px(76.2953, 9.9568).y} r="80" fill="url(#heat-gold)" />
                <circle cx={px(76.2421, 9.9658).x} cy={px(76.2421, 9.9658).y} r="55" fill="url(#heat-gold)" />
              </g>
            )}
            {on.metro && (
              <g fill="none" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)">
                <path d={path(METRO_L1)} stroke="#2dd4bf" strokeWidth="3" />
                <path d={path(METRO_L1)} stroke="#b5fff2" strokeWidth="1" strokeDasharray="4 16" className="dash-flow" />
                <path d={path(METRO_L2)} stroke="#2dd4bf" strokeWidth="2" strokeDasharray="6 6" opacity=".7" />
              </g>
            )}
            {on.it && (
              <g>
                {[{ p: infopark, t: "INFOPARK" }, { p: smartcity, t: "SMARTCITY" }].map(({ p, t }) => (
                  <g key={t}>
                    <rect x={p.x - 7} y={p.y - 7} width="14" height="14" rx="3" fill="#8b9cff" transform={`rotate(45 ${p.x} ${p.y})`} opacity=".9" />
                    <text x={p.x + 12} y={p.y + 4} fill="#c7cfff" fontSize="10" fontWeight="600" letterSpacing="1">{t}</text>
                  </g>
                ))}
              </g>
            )}
            {kochi.map((l, i) => {
              const p = px(...l.coords);
              const c = l.isLuxury ? "#e3b95c" : "#3ee58e";
              return (
                <g key={l.id}>
                  <circle cx={p.x} cy={p.y} r="6" fill={c} opacity=".5" className="pulse-ring" style={{ animationDelay: `${i * 180}ms` }} />
                  <circle cx={p.x} cy={p.y} r="5" fill={c} stroke="#05080a" strokeWidth="2" />
                </g>
              );
            })}
            {[
              ["Aluva", 76.357, 10.1004],
              ["Edappally", 76.3083, 10.0261],
              ["Kakkanad", 76.3419, 10.0159],
              ["Vyttila", 76.3181, 9.969],
              ["Fort Kochi", 76.2421, 9.9658],
              ["Vypin", 76.2236, 10.0103],
            ].map(([n, lng, lat]) => {
              const p = px(lng as number, lat as number);
              return (
                <text key={n as string} x={p.x + 10} y={p.y - 10} fill="#e8f2ec" fontSize="12" fontWeight="600" opacity=".85">
                  {n}
                </text>
              );
            })}
          </svg>
          <div className="glass-dark absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs sm:right-auto">
            <span className="flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5 text-[#8b9cff]" /> Infopark 2.1 km</span>
            <span className="flex items-center gap-1.5"><Hospital className="h-3.5 w-3.5 text-[#ff8a80]" /> 4 hospitals</span>
            <span className="hidden items-center gap-1.5 sm:flex"><Plane className="h-3.5 w-3.5 text-white/60" /> CIAL 24 min</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── NRI concierge ─────────────────────────── */

const NRI_SERVICES = [
  { icon: ListChecks, t: "Property shortlist", s: "We filter to verified matches for you" },
  { icon: Video, t: "Live video tours", s: "Walk the home from Dubai or Doha" },
  { icon: Scale, t: "Legal assistance", s: "Title checks and documentation" },
  { icon: CalendarClock, t: "Visit management", s: "Visits planned for your trip home" },
  { icon: FileCheck2, t: "Document help", s: "POA, registration, utilities" },
  { icon: UserCheck, t: "After-sales care", s: "Tenancy, upkeep and resale" },
];

export function NriConcierge() {
  const { currency, setCurrency, timeZone } = usePrefs();
  const sample = listings.find((l) => l.id === "L015")!;
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const fmt = (tz: string) =>
    now ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(now) : "--:--";

  return (
    <section id="nri" className="relative isolate scroll-mt-20 overflow-hidden py-16 text-white md:py-24">
      <Image src="/img/nri-dubai.jpg" alt="" fill sizes="100vw" className="-z-20 object-cover" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(110deg,rgba(10,8,3,0.95)_0%,rgba(10,8,3,0.86)_50%,rgba(10,8,3,0.6)_100%)]" />

      <div className="mx-auto grid max-w-7xl gap-10 px-4 md:px-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#e3b95c]">NRI Concierge</p>
          <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight md:text-[44px]">
            Buy in Kerala <span className="text-[#e3b95c]">without flying home</span>
          </h2>
          <p className="mt-3 max-w-xl text-[15px] text-white/65">
            One dedicated advisor from the first shortlist to after-sales, on your clock in the Gulf, the US or Europe.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {NRI_SERVICES.map(({ icon: I, t, s }) => (
              <div key={t} className="rounded-2xl border border-[#e3b95c]/15 bg-white/[0.03] p-4 transition hover:border-[#e3b95c]/40 hover:bg-white/[0.06]">
                <I className="h-6 w-6 text-[#e3b95c]" />
                <p className="mt-3 text-[15px] font-semibold">{t}</p>
                <p className="mt-1 text-[13px] text-white/55">{s}</p>
              </div>
            ))}
          </div>

          <a
            href={`https://wa.me/${site.whatsapp}?text=${encodeURIComponent("Hi, I'm an NRI looking for property in Kerala.")}`}
            target="_blank"
            rel="noopener noreferrer"
            className={clsx(buttonClass("whatsapp", "lg"), "mt-8")}
          >
            <MessageCircle className="h-5 w-5" /> Chat with an NRI expert on WhatsApp
          </a>
        </div>

        <div className="space-y-4 self-end">
          <div className="rounded-3xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold">Prices in your currency</p>
              <p className="text-xs text-white/45">Indicative rates</p>
            </div>
            <p className="mb-3 text-[13px] text-white/60">
              {sample.title}, {sample.locality}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setCurrency(c.code)}
                  aria-pressed={currency === c.code}
                  className={clsx(
                    "rounded-2xl border p-3 text-left transition",
                    currency === c.code ? "border-[#e3b95c] bg-[#e3b95c]/10" : "border-white/10 hover:border-white/25",
                  )}
                >
                  <p className="text-xs text-white/55">
                    {c.flag} {c.label}
                  </p>
                  <p className="mt-1 font-display text-xl font-semibold">{formatPrice(sample.price, c.code)}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-3xl border border-white/10 bg-black/40 p-3 backdrop-blur-xl">
            <div className="rounded-2xl bg-white/[0.04] p-3">
              <p className="flex items-center gap-1.5 text-xs text-white/55"><Clock className="h-3.5 w-3.5" /> Your time</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{fmt(timeZone ?? "UTC")}</p>
              <p className="truncate text-[11px] text-white/45">{timeZone?.replace(/_/g, " ") ?? "Detecting…"}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] p-3">
              <p className="flex items-center gap-1.5 text-xs text-white/55"><Clock className="h-3.5 w-3.5" /> Kerala (IST)</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{fmt("Asia/Kolkata")}</p>
              <p className="text-[11px] text-white/45">Support {site.supportHours}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Owner / agent CTA ─────────────────────────── */

export function ListPropertyCta() {
  const steps = [
    { icon: BadgeCheck, t: "Verify your profile", s: "Owner, agent or builder. ID and K-RERA checked." },
    { icon: Upload, t: "Upload photos and documents", s: "Saved in the vault with a tamper-evident fingerprint." },
    { icon: ShieldCheck, t: "Get approved, get leads", s: "Track views, enquiries and visits in one place." },
  ];
  const bars = [32, 45, 38, 60, 52, 74, 88];
  return (
    <section id="list" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-14 md:px-6">
      <div className="grid gap-8 overflow-hidden rounded-[28px] border border-line bg-surface-strong p-6 shadow-card md:p-10 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand">For owners, agents &amp; builders</p>
          <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            List free. Get verified. <br className="hidden md:block" /> Reach buyers in 4 currencies.
          </h2>
          <ol className="mt-7 space-y-4">
            {steps.map(({ icon: I, t, s }, i) => (
              <li key={t} className="flex gap-4">
                <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                  <I className="h-5 w-5" />
                  <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] font-bold text-brand-ink">{i + 1}</span>
                </span>
                <span>
                  <span className="block font-medium">{t}</span>
                  <span className="block text-sm text-ink-3">{s}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/#signin" className={buttonClass("primary", "lg")}>
              Start listing <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/#signin" className={buttonClass("outline", "lg")}>
              I&apos;m an agent / builder
            </Link>
          </div>
        </div>

        {/* Portal preview */}
        <div className="rounded-2xl border border-line bg-bg p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold">Listing performance</p>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-ink-3">Last 7 days</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: "Views", v: "2,418", d: "+18%" },
              { k: "Enquiries", v: "64", d: "+9%" },
              { k: "Visits booked", v: "11", d: "+3" },
            ].map((m) => (
              <div key={m.k} className="rounded-xl border border-line bg-surface-strong p-3">
                <p className="text-[11px] text-ink-3">{m.k}</p>
                <p className="mt-1 font-display text-xl font-semibold">{m.v}</p>
                <p className="text-[11px] text-brand">{m.d}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex h-36 items-end gap-2 rounded-xl border border-line bg-surface-strong p-3" aria-label="Daily views chart">
            {bars.map((b, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <div
                  className={clsx("w-full rounded-md", i === bars.length - 1 ? "bg-brand" : "bg-brand/30")}
                  style={{ height: `${b}%` }}
                />
                <span className="text-[10px] text-ink-3">{"MTWTFSS"[i]}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {[
              { n: "Arun (Dubai)", t: "Asked for a video tour · Contemporary 4BHK Villa", s: "New" },
              { n: "Meera K.", t: "Visit Sat 11:00 · 2BHK near Infopark", s: "Scheduled" },
            ].map((l) => (
              <div key={l.n} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-strong px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{l.n}</p>
                  <p className="truncate text-xs text-ink-3">{l.t}</p>
                </div>
                <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", l.s === "New" ? "bg-brand text-brand-ink" : "bg-muted text-ink-2")}>{l.s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
