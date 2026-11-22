"use client";

import clsx from "clsx";
import {
  ArrowLeftRight,
  ArrowRight,
  Briefcase,
  Building2,
  Check,
  Cpu,
  ChevronDown,
  Gem,
  Globe2,
  Headset,
  Home,
  KeyRound,
  LandPlot,
  MapPin,
  Scale,
  School,
  Search,
  ShieldCheck,
  Sparkles,
  Train,
  UserCheck,
  Wallet,
  Waves,
  X,
} from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { LOCALITIES, listings, TYPE_LABEL, type PropertyType } from "@/data/listings";
import { CURRENCIES, formatPrice, regionFromTimeZone } from "@/lib/currency";
import { localities } from "@/data/places";
import {
  BUDGETS,
  DEFAULT_FILTERS,
  describeFilters,
  filterListings,
  isActive,
  rankListings,
  REFINE_LABEL,
  suggestNext,
  type Filters,
  type Refinements,
  type Suggestion,
} from "@/lib/search";
import { PropertyCard } from "../property/property-card";
import { usePrefs } from "../providers";
import { buttonClass, ReraBadge, SectionHeading } from "../ui/primitives";

/** Starter prompts. In stage 5 the AI bot personalises these from location and device. */
const QUICK_PROMPTS: { label: string; filters: Partial<Filters> }[] = [
  { label: "₹50 L flat in Kakkanad", filters: { purpose: "buy", type: "apartment", query: "Kakkanad", budgetMax: 5_000_000 } },
  { label: "Villas in Kochi under ₹2 Cr", filters: { purpose: "buy", type: "villa", query: "Kochi", budgetMax: 20_000_000 } },
  { label: "Waterfront plots", filters: { purpose: "buy", type: "plot", query: "Vypin" } },
  { label: "Rent near Edappally metro", filters: { purpose: "rent", query: "Edappally" } },
  { label: "Near Technopark", filters: { purpose: "buy", query: "Technopark" } },
];

const CATEGORIES: { label: string; icon: React.ElementType; filters: Partial<Filters> }[] = [
  { label: "Buy", icon: KeyRound, filters: { purpose: "buy" } },
  { label: "Rent", icon: Home, filters: { purpose: "rent" } },
  { label: "Villas & Houses", icon: Home, filters: { purpose: "buy", type: "villa" } },
  { label: "Apartments", icon: Building2, filters: { purpose: "buy", type: "apartment" } },
  { label: "Plots", icon: LandPlot, filters: { purpose: "buy", type: "plot" } },
  { label: "Commercial", icon: Briefcase, filters: { type: "commercial" } },
  { label: "New Projects", icon: Sparkles, filters: { purpose: "buy", segment: "new" } },
  { label: "Luxury", icon: Gem, filters: { purpose: "buy", segment: "luxury" } },
];

export function HomeExperience() {
  const [draft, setDraft] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
  const resultsRef = useRef<HTMLDivElement>(null);

  const apply = (next: Filters) => {
    setDraft(next);
    setApplied(next);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const applyPartial = (p: Partial<Filters>) => apply({ ...DEFAULT_FILTERS, purpose: draft.purpose, ...p });

  return (
    <>
      <Hero draft={draft} setDraft={setDraft} onSearch={() => apply(draft)} onPrompt={applyPartial} />
      <CategoryRail applied={applied} onPick={applyPartial} />
      <div ref={resultsRef} className="scroll-mt-20">
        <Results
          filters={applied}
          onReset={() => apply({ ...DEFAULT_FILTERS })}
          onRefine={(patch) => {
            const refine = { ...applied.refine, ...patch };
            (Object.keys(refine) as (keyof Refinements)[]).forEach((k) => refine[k] === undefined && delete refine[k]);
            apply({ ...applied, refine });
          }}
        />
      </div>
    </>
  );
}

/* ───────────────────────────── Hero ───────────────────────────── */

function Hero({
  draft,
  setDraft,
  onSearch,
  onPrompt,
}: {
  draft: Filters;
  setDraft: (f: Filters) => void;
  onSearch: () => void;
  onPrompt: (p: Partial<Filters>) => void;
}) {
  const showcase = listings.find((l) => l.id === "L001")!;
  const { currency } = usePrefs();

  return (
    <section className="relative isolate overflow-hidden bg-[#060a08] pb-10 pt-24 md:pb-14 md:pt-32">
      <Image
        src="/img/hero-backwater.jpg"
        alt="Kerala backwaters with a houseboat among coconut palms"
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover object-[60%_center]"
      />
      <div className="absolute inset-0 -z-10" style={{ background: "var(--hero-veil)" }} />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-[#060a08] to-transparent dark:from-bg" />

      <div className="mx-auto grid max-w-7xl gap-10 px-4 md:px-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
        <div className="rise max-w-2xl text-white">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[#3ee58e] shadow-[0_0_10px_#3ee58e]" />
            K-RERA checked · Direct owners · NRI friendly
          </p>
          <h1 className="font-display text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[64px]">
            Find verified homes in <span className="text-gradient">God&apos;s Own Country</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] text-white/70 md:mt-5 md:text-lg">
            Villas, flats, plots and new projects across Kochi, Trivandrum and Calicut. Every listing is checked
            before it goes live.
          </p>

          <ul className="mt-7 hidden gap-2.5 sm:flex sm:flex-wrap">
            {[
              { icon: ShieldCheck, t: "100% verified", s: "K-RERA checked" },
              { icon: UserCheck, t: "Direct owner", s: "No brokerage" },
              { icon: Headset, t: "NRI concierge", s: "In your time zone" },
              { icon: Wallet, t: "Document vault", s: "Tamper-evident" },
            ].map(({ icon: I, t, s }) => (
              <li key={t} className="glass-dark flex items-center gap-2.5 rounded-xl px-3 py-2.5">
                <I className="h-5 w-5 shrink-0 text-[#3ee58e]" />
                <span className="leading-tight">
                  <span className="block text-[13px] font-semibold">{t}</span>
                  <span className="block text-[11px] text-white/55">{s}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Showcase card: desktop only */}
        <div className="rise hidden justify-self-end lg:block" style={{ animationDelay: "120ms" }}>
          <div className="glass-dark w-[340px] overflow-hidden rounded-3xl shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]">
            <div className="relative aspect-[16/10]">
              <Image src={showcase.images[0]} alt={showcase.title} fill sizes="340px" className="object-cover" />
              <div className="absolute left-3 top-3">
                <ReraBadge number={showcase.rera.number} />
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-baseline justify-between">
                <p className="font-display text-2xl font-semibold">{formatPrice(showcase.price, currency)}</p>
                <span className="text-xs text-white/55">Featured today</span>
              </div>
              <p className="text-sm text-white/80">
                {showcase.title} · {showcase.locality}
              </p>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                <span className="font-mono tracking-tight">{showcase.rera.number}</span>
                <span className="inline-flex items-center gap-1 text-[#3ee58e]">
                  <Check className="h-3.5 w-3.5" /> Verified
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-7 max-w-7xl px-4 md:mt-10 md:px-6">
        <SearchPanel draft={draft} setDraft={setDraft} onSearch={onSearch} />

        <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <span className="shrink-0 text-xs font-medium text-white/55">Try:</span>
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p.label}
              onClick={() => onPrompt(p.filters)}
              className="shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[13px] text-white/85 backdrop-blur transition hover:border-[#3ee58e]/60 hover:bg-[#3ee58e]/10 hover:text-white"
            >
              {p.label}
            </button>
          ))}
        </div>

        <CurrencySuggestion />
      </div>
    </section>
  );
}

function CurrencySuggestion() {
  const { suggestedCurrency, setCurrency, dismissSuggestion, timeZone } = usePrefs();
  if (!suggestedCurrency) return null;
  const region = regionFromTimeZone(timeZone);
  return (
    <div className="glass-dark rise mt-4 flex w-fit max-w-full items-center gap-3 rounded-full py-1.5 pl-3 pr-1.5 text-[13px]">
      <Globe2 className="h-4 w-4 shrink-0 text-[#e3b95c]" />
      <span className="text-white/80">
        Browsing from {region ?? "abroad"}? Show prices in <b className="text-white">{suggestedCurrency}</b>
      </span>
      <button onClick={() => setCurrency(suggestedCurrency)} className="rounded-full bg-[#e3b95c] px-3 py-1 text-xs font-semibold text-[#1a1203]">
        Switch
      </button>
      <button onClick={dismissSuggestion} aria-label="Dismiss" className="grid h-6 w-6 place-items-center rounded-full text-white/60 hover:bg-white/10">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ─────────────────────────── Search panel ─────────────────────────── */

function SearchPanel({
  draft,
  setDraft,
  onSearch,
}: {
  draft: Filters;
  setDraft: (f: Filters) => void;
  onSearch: () => void;
}) {
  const { currency, setCurrency, landUnit, setLandUnit } = usePrefs();
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setDraft({ ...draft, [k]: v });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
      className="glass-dark rounded-2xl p-2 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)]"
      role="search"
    >
      <div className="flex items-center gap-1 p-1 pb-2">
        {(["buy", "rent"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setDraft({ ...draft, purpose: p, budgetMax: null })}
            aria-pressed={draft.purpose === p}
            className={clsx(
              "rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition",
              draft.purpose === p ? "bg-[#3ee58e] text-[#03140a]" : "text-white/70 hover:text-white",
            )}
          >
            {p}
          </button>
        ))}
        <span className="ml-auto hidden items-center gap-1.5 pr-2 text-[11px] text-white/50 sm:flex">
          <ShieldCheck className="h-3.5 w-3.5 text-[#3ee58e]" /> Only verified listings are shown
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/10 lg:grid-cols-[1.5fr_1fr_1fr_0.9fr_0.8fr_auto]">
        <Field label="Location" icon={MapPin} className="col-span-2 lg:col-span-1">
          <input
            list="localities"
            value={draft.query}
            onChange={(e) => set("query", e.target.value)}
            placeholder="Kakkanad, Edappally, Technopark…"
            className="w-full bg-transparent text-[15px] font-medium text-white placeholder:text-white/35 focus:outline-none"
            aria-label="Location"
          />
          <datalist id="localities">
            {LOCALITIES.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>

        <Field label="Property type" icon={Building2}>
          <SelectBare
            ariaLabel="Property type"
            value={draft.type}
            onChange={(v) => set("type", v as PropertyType | "any")}
            options={[{ value: "any", label: "All types" }, ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))]}
          />
        </Field>

        <Field label="Budget" icon={Wallet}>
          <SelectBare
            ariaLabel="Budget"
            value={String(draft.budgetMax)}
            onChange={(v) => set("budgetMax", v === "null" ? null : Number(v))}
            options={BUDGETS[draft.purpose].map((b) => ({ value: String(b.value), label: b.label }))}
          />
        </Field>

        <Field label="Land unit" icon={ArrowLeftRight}>
          <button
            type="button"
            onClick={() => setLandUnit(landUnit === "cents" ? "sqft" : "cents")}
            className="flex w-full items-center gap-2 text-[15px] font-medium text-white"
            aria-label={`Land unit: ${landUnit}. Click to switch.`}
          >
            <span className={landUnit === "cents" ? "text-white" : "text-white/40"}>Cents</span>
            <ArrowLeftRight className="h-3.5 w-3.5 text-white/40" />
            <span className={landUnit === "sqft" ? "text-white" : "text-white/40"}>Sq.ft</span>
          </button>
        </Field>

        <Field label="Currency" icon={Globe2}>
          <SelectBare
            ariaLabel="Currency"
            value={currency}
            onChange={(v) => setCurrency(v as typeof currency)}
            options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.flag} ${c.code}` }))}
          />
        </Field>

        <div className="col-span-2 bg-[#0b120e]/80 p-2 lg:col-span-1">
          <button type="submit" className={clsx(buttonClass("primary", "lg"), "h-full min-h-12 w-full px-7")}>
            <Search className="h-[18px] w-[18px]" /> Search
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  icon: Icon,
  children,
  className,
}: {
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("flex items-center gap-3 bg-[#0b120e]/80 px-3.5 py-3 sm:px-4 transition focus-within:bg-[#0f1a14]", className)}>
      <Icon className="h-5 w-5 shrink-0 text-white/45 max-sm:hidden" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium uppercase tracking-wider text-white/45">{label}</span>
        {children}
      </span>
    </label>
  );
}

function SelectBare({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  return (
    <span className="relative block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="w-full cursor-pointer appearance-none bg-transparent pr-6 text-[15px] font-medium text-white focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#0f1713] text-white">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
    </span>
  );
}

/* ─────────────────────────── Category rail ─────────────────────────── */

function CategoryRail({ applied, onPick }: { applied: Filters; onPick: (p: Partial<Filters>) => void }) {
  const activeIndex = CATEGORIES.findIndex((c) =>
    Object.entries(c.filters).every(([k, v]) => applied[k as keyof Filters] === v) && Object.keys(c.filters).length > 1,
  );
  return (
    <section className="mx-auto max-w-7xl px-4 pt-10 md:px-6" aria-label="Browse by category">
      <div className="flex gap-2.5 overflow-x-auto pb-2 no-scrollbar md:grid md:grid-cols-8 md:overflow-visible">
        {CATEGORIES.map(({ label, icon: I, filters }, i) => (
          <button
            key={label}
            onClick={() => onPick(filters)}
            className={clsx(
              "group flex min-w-[104px] shrink-0 flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition",
              i === activeIndex
                ? "border-brand bg-brand-soft"
                : "border-line bg-surface-strong hover:border-line-strong hover:shadow-card",
            )}
          >
            <span
              className={clsx(
                "grid h-10 w-10 place-items-center rounded-xl transition",
                i === activeIndex ? "bg-brand text-brand-ink" : "bg-muted text-ink-2 group-hover:text-brand",
              )}
            >
              <I className="h-5 w-5" />
            </span>
            <span className="text-[13px] font-medium text-ink">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────────── Results ───────────────────────────── */

function Results({
  filters,
  onReset,
  onRefine,
}: {
  filters: Filters;
  onReset: () => void;
  onRefine: (r: Refinements) => void;
}) {
  const active = isActive(filters);
  const results = useMemo(() => filterListings(listings, filters), [filters]);
  const ranked = useMemo(() => rankListings(results, filters), [results, filters]);
  const suggestions = useMemo(() => suggestNext(filters, listings), [filters]);
  const budgetLabel = BUDGETS[filters.purpose].find((b) => b.value === filters.budgetMax)?.label;

  if (!active) {
    const featured = rankListings(listings.filter((l) => l.purpose === filters.purpose), filters).slice(0, 8);
    return (
      <section id="featured" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-14 md:px-6">
        <SectionHeading
          eyebrow="Featured"
          title="Handpicked verified properties"
          sub={`${listings.length} listings across Kochi, Trivandrum and Kozhikode, each checked by our team.`}
        />
        <Grid>
          {featured.map((r, i) => (
            <PropertyCard key={r.listing.id} listing={r.listing} priority={i < 4} />
          ))}
        </Grid>
      </section>
    );
  }

  const picks = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const activeRefinements = Object.entries(filters.refine) as [keyof Refinements, number | boolean][];

  return (
    <section id="featured" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-14 md:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
            {results.length} {results.length === 1 ? "match" : "matches"}
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight md:text-[30px]">
            {capitalize(describeFilters(filters, budgetLabel))}
          </h2>
          {activeRefinements.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {activeRefinements.map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => onRefine({ [k]: undefined })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[13px] font-medium text-brand transition hover:bg-brand hover:text-brand-ink"
                  aria-label={`Remove filter: ${REFINE_LABEL[k](v)}`}
                >
                  {REFINE_LABEL[k](v)} <X className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={onReset} className={buttonClass("outline", "sm")}>
          <X className="h-4 w-4" /> Clear search
        </button>
      </div>

      {results.length === 0 ? (
        <div className="grid place-items-center rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
          <p className="font-display text-xl font-semibold">Nothing verified matches yet</p>
          <p className="mt-2 max-w-md text-sm text-ink-3">
            Try a wider budget or a nearby locality. Soon you&apos;ll be able to ask our assistant to alert you when a match
            is listed.
          </p>
          <button onClick={onReset} className={clsx(buttonClass("primary", "md"), "mt-6")}>
            Show all properties
          </button>
        </div>
      ) : (
        <>
          <div className="relative mb-10 overflow-hidden rounded-3xl border border-brand/30 bg-gradient-to-br from-brand-soft via-transparent to-transparent p-4 md:p-6">
            <div className="mb-5 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-ink">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="font-display text-lg font-semibold">Our recommendation</p>
                <p className="text-xs text-ink-3">Ranked on budget fit, verification, commute, flood risk and freshness</p>
              </div>
            </div>
            <Grid cols3>
              {picks.map((r, i) => (
                <PropertyCard key={r.listing.id} listing={r.listing} reasons={r.reasons} priority={i < 3} />
              ))}
            </Grid>
          </div>

          {rest.length > 0 && (
            <>
              <h3 className="mb-4 font-display text-lg font-semibold">All matching listings</h3>
              <Grid>
                {rest.map((r) => (
                  <PropertyCard key={r.listing.id} listing={r.listing} />
                ))}
              </Grid>
            </>
          )}

          <NextQuestions suggestions={suggestions} onRefine={onRefine} />
        </>
      )}
    </section>
  );
}

const SUGGESTION_ICON = { metro: Train, flood: Waves, it: Cpu, school: School } as const;

/** Follow-up questions computed from OpenStreetMap facts about the current results. */
function NextQuestions({ suggestions, onRefine }: { suggestions: Suggestion[]; onRefine: (r: Refinements) => void }) {
  const [compare, setCompare] = useState<{ a: string; b: string } | null>(null);
  if (suggestions.length === 0) return null;
  return (
    <div className="mt-10 rounded-2xl border border-line bg-surface-strong p-5">
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-brand" /> Refine with a question
      </p>
      <p className="mb-4 text-xs text-ink-3">Based on metro, IT park, school and flood data around these homes.</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => {
          const Icon = s.kind === "compare" ? Scale : SUGGESTION_ICON[s.icon];
          return (
            <button
              key={s.id}
              onClick={() => (s.kind === "compare" ? setCompare(compare ? null : { a: s.a, b: s.b }) : onRefine(s.patch))}
              aria-pressed={s.kind === "compare" ? compare !== null : undefined}
              className="inline-flex items-center gap-2 rounded-full border border-line-strong px-3.5 py-2 text-left text-[13px] text-ink-2 transition hover:border-brand hover:text-ink"
            >
              <Icon className="h-4 w-4 shrink-0 text-water" /> {s.label}
              {s.kind === "refine" && <span className="whitespace-nowrap rounded-full bg-muted px-1.5 text-[11px] font-semibold text-ink-3">{s.count} left</span>}
              <ArrowRight className="h-3.5 w-3.5 opacity-50" />
            </button>
          );
        })}
      </div>
      {compare && <ComparePanel a={compare.a} b={compare.b} />}
    </div>
  );
}

function ComparePanel({ a, b }: { a: string; b: string }) {
  const { currency } = usePrefs();
  const rows = [a, b].map((name) => localities.find((l) => l.name === name)!);
  const near = (n?: { name: string; km: number; status?: string } | null) =>
    n ? `${n.name}${n.status ? " (u/c)" : ""} · ${n.km} km` : "—";
  const metrics: { k: string; v: (r: (typeof rows)[number]) => string }[] = [
    { k: "Avg. price / sq.ft", v: (r) => formatPrice(r.psf, currency, { compact: false }) },
    { k: "Yearly change", v: (r) => `+${r.yoy}%` },
    { k: "Nearest metro", v: (r) => near(r.nearby.metro) },
    { k: "Nearest IT park", v: (r) => near(r.nearby.it_park) },
    { k: "Schools within 2 km", v: (r) => String(r.schools2km) },
    { k: "Verified listings", v: (r) => String(r.listingCount) },
  ];
  return (
    <div className="rise mt-5 overflow-hidden rounded-xl border border-line">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-muted text-ink-2">
          <tr>
            <th className="px-3 py-2 font-medium" scope="col">
              <span className="sr-only">Metric</span>
            </th>
            {rows.map((r) => (
              <th key={r.name} className="px-3 py-2 font-semibold text-ink" scope="col">
                {r.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.k} className="border-t border-line">
              <th className="px-3 py-2 font-normal text-ink-3" scope="row">
                {m.k}
              </th>
              {rows.map((r) => (
                <td key={r.name} className="px-3 py-2 tabular-nums text-ink">
                  {m.v(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-3 py-2 text-[11px] text-ink-3">Prices are indicative demo figures. Places © OpenStreetMap contributors.</p>
    </div>
  );
}

function Grid({ children, cols3 = false }: { children: React.ReactNode; cols3?: boolean }) {
  return (
    <div className={clsx("grid gap-5 sm:grid-cols-2", cols3 ? "lg:grid-cols-3" : "lg:grid-cols-3 xl:grid-cols-4")}>
      {children}
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
