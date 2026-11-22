"use client";

import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, ImagePlus, Loader2, Navigation, Plus, Send, Star, Trash2, Waves, X } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localities } from "@/data/localities";
import { api, ApiError, uploadFile } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { resizeImage } from "@/lib/image";
import { isUpload } from "../listings-provider";
import { usePrefs } from "../providers";
import { buttonClass } from "../ui/primitives";
import { DocList, type DocRow, DocUploader } from "./portal-home";
import { AMENITY_SUGGESTIONS, type PortalListing, Spinner, StatusBadge, usePortalGuard } from "./shared";

const PinPicker = dynamic(() => import("./pin-picker"), { ssr: false, loading: () => <div className="h-[340px] animate-pulse rounded-2xl bg-muted" /> });

const STEPS = ["Basics", "Location", "Details", "Photos & video", "Documents", "Review"] as const;
const FIELD_STEP: Record<string, number> = {
  title: 0,
  purpose: 0,
  type: 0,
  description: 0,
  city: 1,
  locality: 1,
  coords: 1,
  price: 2,
  beds: 2,
  baths: 2,
  builtUpSqft: 2,
  landCents: 2,
  furnishing: 2,
  rera: 2,
  "rera.number": 2,
  amenities: 2,
  images: 3,
  videoUrl: 3,
};
const CITY: Record<string, { district: string; center: [number, number] }> = {
  Kochi: { district: "Ernakulam", center: [76.315, 10.005] },
  Thiruvananthapuram: { district: "Thiruvananthapuram", center: [76.905, 8.545] },
  Kozhikode: { district: "Kozhikode", center: [75.795, 11.262] },
};
const PROPERTY_DOCS = ["title_deed", "tax_receipt", "encumbrance", "building_permit", "rera_certificate", "other"];

type Form = Partial<PortalListing>;

export function ListingEditor({ id }: { id?: string }) {
  const { ready, session } = usePortalGuard();
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState(Math.min(5, Math.max(0, Number(params.get("step") ?? 1) - 1)));
  const [server, setServer] = useState<PortalListing | null>(null);
  const [form, setForm] = useState<Form>({ purpose: "buy", type: "apartment", images: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const isNew = !id;

  useEffect(() => {
    if (!id || !ready) return;
    api<PortalListing>(`/portal/listings/${id}`)
      .then((l) => {
        setServer(l);
        setForm({ ...l, coords: l.pinned === false ? undefined : l.coords });
      })
      .catch(() => router.replace("/portal"));
  }, [id, ready, router]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  /** Save what changed, then move to `to`. Resolves false when the save was rejected. */
  const save = useCallback(
    async (to?: number): Promise<boolean> => {
      setBusy(true);
      setErrors({});
      setNotice(null);
      try {
        if (isNew) {
          const created = await api<PortalListing>("/portal/listings", {
            method: "POST",
            body: { title: form.title, purpose: form.purpose, type: form.type, description: form.description || undefined },
          });
          router.replace(`/portal/listings/${created.id}?step=2`);
          return true;
        }
        const patch: Record<string, unknown> = {};
        for (const k of Object.keys(form) as (keyof Form)[]) {
          if (["id", "status", "missing", "stats", "nearby", "highlights", "flood", "reviewNote", "pinned"].includes(k)) continue;
          // A cleared field is sent as null (JSON drops undefined), so the server removes it.
          if (JSON.stringify(form[k]) !== JSON.stringify(server?.[k as keyof PortalListing])) patch[k] = form[k] === "" || form[k] === undefined ? null : form[k];
        }
        if (Object.keys(patch).length) {
          const updated = await api<PortalListing & { reReview?: boolean }>(`/portal/listings/${id}`, { method: "PATCH", body: patch });
          setServer(updated);
          setForm((f) => ({ ...f, nearby: updated.nearby, highlights: updated.highlights, flood: updated.flood, status: updated.status }));
          if (updated.reReview) setNotice("Saved. Because the location or details changed, the listing is back in review.");
        }
        if (to !== undefined) setStep(to);
        return true;
      } catch (e) {
        const err = e as ApiError;
        const fields = Object.fromEntries(Object.entries(err.fields ?? {}).map(([k, v]) => [k, v[0]]));
        setErrors(Object.keys(fields).length ? fields : { _: err.message });
        const first = Object.keys(fields).map((k) => FIELD_STEP[k]).filter((n) => n !== undefined);
        if (first.length) setStep(Math.min(...first));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [form, id, isNew, router, server],
  );

  const submit = async () => {
    if (!(await save())) return; // never submit an older version than the owner sees
    setBusy(true);
    try {
      await api(`/portal/listings/${id}/submit`, { method: "POST" });
      router.push("/portal?submitted=1");
    } catch (e) {
      const err = e as ApiError;
      setErrors(Object.fromEntries(Object.entries(err.fields ?? {}).map(([k, v]) => [k, v[0]])));
      if (!err.fields) setErrors({ _: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (!ready || !session || (!isNew && !server)) return <Spinner />;
  const live = server && ["published", "sold", "rented", "unavailable"].includes(server.status);
  const canSubmit = server && ["draft", "rejected"].includes(server.status);
  const basicsOk = (form.title?.trim().length ?? 0) >= 5;

  return (
    <div className="mx-auto max-w-4xl px-4 md:px-6">
      <Link href="/portal" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Portal
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{isNew ? "Add a listing" : form.title || "Edit listing"}</h1>
        {server && <StatusBadge status={server.status} />}
      </div>
      {server?.status === "rejected" && server.reviewNote && (
        <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">Reviewer: {server.reviewNote}</p>
      )}

      {/* Stepper */}
      <ol className="mt-6 flex gap-1 overflow-x-auto pb-1 no-scrollbar">
        {STEPS.map((s, i) => (
          <li key={s} className="shrink-0">
            <button
              onClick={() => !isNew && save(i)}
              disabled={isNew && i > 0}
              aria-current={step === i ? "step" : undefined}
              className={clsx(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium transition",
                step === i ? "bg-brand text-brand-ink" : "text-ink-3 hover:bg-muted hover:text-ink disabled:opacity-40",
              )}
            >
              <span className={clsx("grid h-5 w-5 place-items-center rounded-full text-[11px]", step === i ? "bg-brand-ink/15" : "bg-muted")}>{i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-3xl border border-line bg-surface-strong p-5 shadow-card md:p-7">
        {errors._ && <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{errors._}</p>}
        {notice && <p className="mb-4 rounded-xl bg-gold-soft px-3 py-2 text-sm text-gold">{notice}</p>}

        {step === 0 && <Basics form={form} set={set} errors={errors} />}
        {step === 1 && <LocationStep form={form} set={set} errors={errors} />}
        {step === 2 && <Details form={form} set={set} errors={errors} isAgent={session.user.role === "agent"} />}
        {step === 3 && <Media form={form} set={set} errors={errors} />}
        {step === 4 && id && <Documents id={id} />}
        {step === 5 && server && <Review form={form} missing={server.missing ?? {}} errors={errors} goTo={(i) => save(i)} />}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button onClick={() => (step > 0 ? save(step - 1) : router.push("/portal"))} disabled={busy} className={buttonClass("ghost", "md")}>
          <ChevronLeft className="h-4 w-4" /> {step > 0 ? "Back" : "Cancel"}
        </button>
        <div className="flex gap-2">
          {!isNew && step < 5 && (
            <button onClick={() => save()} disabled={busy} className={buttonClass("outline", "md")}>
              Save draft
            </button>
          )}
          {step < 5 ? (
            <button onClick={() => save(step + 1)} disabled={busy || (isNew && !basicsOk)} className={buttonClass("primary", "md")}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {isNew ? "Create and continue" : "Save and continue"} <ChevronRight className="h-4 w-4" />
            </button>
          ) : canSubmit ? (
            <button onClick={submit} disabled={busy} className={buttonClass("primary", "md")}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit for review
            </button>
          ) : (
            <button onClick={() => save().then((ok) => ok && router.push("/portal"))} disabled={busy} className={buttonClass("primary", "md")}>
              <Check className="h-4 w-4" /> {live ? "Save changes" : "Done"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Field helpers ───────────── */

/**
 * A labelled field. Single inputs use <label>; groups of controls (choice
 * buttons, photos, the map) use role="group" so each control keeps its own name.
 */
function Field({ label, error, hint, children, className, group }: { label: string; error?: string; hint?: string; children: React.ReactNode; className?: string; group?: boolean }) {
  const body = (
    <>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </>
  );
  return group ? (
    <div role="group" aria-label={label} className={clsx("block", className)}>
      {body}
    </div>
  ) : (
    <label className={clsx("block", className)}>{body}</label>
  );
}
const inputCls = (err?: string) =>
  clsx("h-11 w-full rounded-xl border bg-transparent px-3 text-[15px] text-ink outline-none transition placeholder:text-ink-3 focus:border-brand focus:ring-2 focus:ring-brand/20", err ? "border-danger" : "border-line-strong");

type StepProps = { form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void; errors: Record<string, string> };

function Segmented<T extends string>({ value, options, onChange, label }: { value?: T; options: { v: T; t: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={clsx("rounded-xl border px-3.5 py-2 text-sm font-medium transition", value === o.v ? "border-brand bg-brand-soft text-ink" : "border-line-strong text-ink-2 hover:border-brand")}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}

const num = (v: string) => (v === "" ? undefined : Number(v));

/* ───────────── Steps ───────────── */

function Basics({ form, set, errors }: StepProps) {
  return (
    <div className="space-y-5">
      <Field group label="Selling or renting?">
        <Segmented label="Purpose" value={form.purpose} onChange={(v) => set("purpose", v)} options={[{ v: "buy", t: "Sell" }, { v: "rent", t: "Rent out" }]} />
      </Field>
      <Field group label="Property type">
        <Segmented
          label="Property type"
          value={form.type}
          onChange={(v) => set("type", v)}
          options={[
            { v: "apartment", t: "Apartment" },
            { v: "villa", t: "Villa" },
            { v: "house", t: "House" },
            { v: "plot", t: "Plot" },
            { v: "commercial", t: "Commercial" },
          ]}
        />
      </Field>
      <Field label="Listing title" error={errors.title} hint="e.g. 3BHK villa with garden near Edappally metro">
        <input value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} maxLength={90} className={inputCls(errors.title)} />
      </Field>
      <Field label="Description" error={errors.description} hint={`${form.description?.length ?? 0}/2000. Mention light, views, water supply, road access and what's nearby.`}>
        <textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={6} maxLength={2000} className={clsx(inputCls(errors.description), "h-auto py-2.5")} />
      </Field>
    </div>
  );
}

function LocationStep({ form, set, errors }: StepProps) {
  const city = form.city ?? "Kochi";
  const options = localities.filter((l) => l.city === city);
  const loc = localities.find((l) => l.name === form.locality);
  const center = useMemo<[number, number]>(() => loc?.coords ?? CITY[city].center, [loc, city]);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" error={errors.city}>
          <select
            value={city}
            onChange={(e) => {
              const c = e.target.value as Form["city"];
              set("city", c);
              set("district", CITY[c!].district);
            }}
            className={inputCls(errors.city)}
          >
            {Object.keys(CITY).map((c) => (
              <option key={c} value={c} className="bg-elevated">
                {c === "Thiruvananthapuram" ? "Thiruvananthapuram (Trivandrum)" : c === "Kozhikode" ? "Kozhikode (Calicut)" : c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Locality" error={errors.locality} hint="Pick from the list or type your own">
          <input
            list="portal-localities"
            value={form.locality ?? ""}
            onChange={(e) => {
              set("locality", e.target.value);
              if (!form.city) {
                set("city", city);
                set("district", CITY[city].district);
              }
            }}
            className={inputCls(errors.locality)}
          />
          <datalist id="portal-localities">
            {options.map((l) => (
              <option key={l.name} value={l.name} />
            ))}
          </datalist>
        </Field>
      </div>
      <Field group label="Exact location" error={errors.coords} hint="Click the map or drag the pin onto the property. Buyers see distances from this point.">
        <PinPicker value={form.coords} center={center} onChange={(c) => set("coords", c)} />
      </Field>
      {form.highlights && form.highlights.length > 0 && form.coords && (
        <div className="rounded-2xl bg-muted p-4 text-sm">
          <p className="mb-2 font-medium">What buyers will see</p>
          <ul className="space-y-1 text-ink-2">
            {form.highlights.map((h) => (
              <li key={h.label} className="flex items-center gap-2">
                <Navigation className="h-3.5 w-3.5 text-water" /> {h.km} km · {h.label}
              </li>
            ))}
          </ul>
          {form.flood && form.flood.level !== "low" && (
            <p className="mt-2 flex items-center gap-2 text-danger">
              <Waves className="h-4 w-4" /> Inside the {form.flood.zone} (demo flood layer). Buyers will see a flood-risk note.
            </p>
          )}
          <p className="mt-2 text-xs text-ink-3">Updated each time you save the location.</p>
        </div>
      )}
    </div>
  );
}

function Details({ form, set, errors, isAgent }: StepProps & { isAgent: boolean }) {
  const { currency } = usePrefs();
  const [custom, setCustom] = useState("");
  const isPlot = form.type === "plot";
  const homes = ["villa", "house", "apartment"].includes(form.type ?? "");
  const suggestions = AMENITY_SUGGESTIONS[form.type === "house" ? "house" : form.type ?? "apartment"] ?? [];
  const amen = form.amenities ?? [];
  const toggle = (a: string) => set("amenities", amen.includes(a) ? amen.filter((x) => x !== a) : [...amen, a]);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={form.purpose === "rent" ? "Rent per month (₹)" : "Price (₹)"}
          error={errors.price}
          hint={form.price ? `${formatPrice(form.price, "INR")}${currency !== "INR" ? ` · ${formatPrice(form.price, currency)}` : ""}` : "Enter the full amount, e.g. 8500000"}
        >
          <input type="number" inputMode="numeric" min={0} value={form.price || ""} onChange={(e) => set("price", num(e.target.value))} className={inputCls(errors.price)} />
        </Field>
        {!isPlot && (
          <Field label="Built-up area (sq.ft)" error={errors.builtUpSqft}>
            <input type="number" inputMode="numeric" min={0} value={form.builtUpSqft ?? ""} onChange={(e) => set("builtUpSqft", num(e.target.value))} className={inputCls(errors.builtUpSqft)} />
          </Field>
        )}
        {(isPlot || form.type === "villa" || form.type === "house") && (
          <Field label="Land area (cents)" error={errors.landCents} hint="1 cent = 435.6 sq.ft">
            <input type="number" inputMode="decimal" min={0} step="0.5" value={form.landCents ?? ""} onChange={(e) => set("landCents", num(e.target.value))} className={inputCls(errors.landCents)} />
          </Field>
        )}
        {homes && (
          <>
            <Field label="Bedrooms" error={errors.beds}>
              <input type="number" inputMode="numeric" min={0} max={20} value={form.beds ?? ""} onChange={(e) => set("beds", num(e.target.value))} className={inputCls(errors.beds)} />
            </Field>
            <Field label="Bathrooms" error={errors.baths}>
              <input type="number" inputMode="numeric" min={0} max={20} value={form.baths ?? ""} onChange={(e) => set("baths", num(e.target.value))} className={inputCls(errors.baths)} />
            </Field>
          </>
        )}
      </div>
      {!isPlot && (
        <Field group label="Furnishing">
          <Segmented
            label="Furnishing"
            value={form.furnishing}
            onChange={(v) => set("furnishing", v)}
            options={[
              { v: "furnished", t: "Furnished" },
              { v: "semi", t: "Semi-furnished" },
              { v: "unfurnished", t: "Unfurnished" },
            ]}
          />
        </Field>
      )}
      <Field group label="Amenities">
        <div className="flex flex-wrap gap-2">
          {[...new Set([...suggestions, ...amen])].map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => toggle(a)}
              aria-pressed={amen.includes(a)}
              className={clsx("rounded-full border px-3 py-1.5 text-[13px] transition", amen.includes(a) ? "border-brand bg-brand-soft text-ink" : "border-line-strong text-ink-2 hover:border-brand")}
            >
              {amen.includes(a) && <Check className="mr-1 inline h-3.5 w-3.5" />}
              {a}
            </button>
          ))}
          <span className="inline-flex items-center gap-1">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom.trim().length > 1) {
                  e.preventDefault();
                  toggle(custom.trim());
                  setCustom("");
                }
              }}
              placeholder="Add another"
              aria-label="Add an amenity"
              className="h-8 w-32 rounded-full border border-dashed border-line-strong bg-transparent px-3 text-[13px] text-ink outline-none focus:border-brand"
            />
          </span>
        </div>
      </Field>
      <Field group label="K-RERA" error={errors.rera ?? errors["rera.number"]} hint="Required for new projects and agents; usually not for resale homes and plots.">
        <Segmented
          label="K-RERA status"
          value={form.rera?.status}
          onChange={(v) => set("rera", { status: v, number: v === "registered" ? form.rera?.number ?? "" : undefined })}
          options={[
            { v: "not_required", t: "Not required" },
            { v: "registered", t: "Registered" },
            { v: "pending", t: "Applied / pending" },
          ]}
        />
        {form.rera?.status === "registered" && (
          <input
            value={form.rera.number ?? ""}
            onChange={(e) => set("rera", { status: "registered", number: e.target.value.toUpperCase() })}
            placeholder="K-RERA/PRJ/ERN/123/2024"
            aria-label="K-RERA number"
            className={clsx(inputCls(errors["rera.number"]), "mt-2 font-mono")}
          />
        )}
      </Field>
      {isAgent && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field group label="New project?">
            <Segmented label="New project" value={form.isNewProject ? "yes" : "no"} onChange={(v) => set("isNewProject", v === "yes")} options={[{ v: "no", t: "Resale / ready" }, { v: "yes", t: "New launch" }]} />
          </Field>
          {form.isNewProject && (
            <Field label="Possession" hint="e.g. Dec 2028">
              <input value={form.possession ?? ""} onChange={(e) => set("possession", e.target.value)} maxLength={20} className={inputCls()} />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

function Media({ form, set, errors }: StepProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const images = form.images ?? [];
  const move = (i: number, d: number) => {
    const next = [...images];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set("images", next);
  };
  const add = async (files: FileList) => {
    setError(null);
    const list = [...files].slice(0, 20 - images.length);
    setUploading(list.length);
    const urls: string[] = [];
    for (const f of list) {
      try {
        const blob = await resizeImage(f);
        const r = await uploadFile<{ url: string }>("/media", blob, { "X-File-Name": f.name });
        urls.push(r.url);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : `Couldn't read ${f.name}. Use a JPEG, PNG or WebP photo.`);
      }
      setUploading((n) => n - 1);
    }
    set("images", [...images, ...urls]);
  };
  return (
    <div className="space-y-5">
      <Field group label={`Photos (${images.length}/20)`} error={errors.images ?? error ?? undefined} hint="The first photo is the cover. Landscape photos in daylight work best; we resize them for you.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((src, i) => (
            <div key={src} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-muted">
              <Image src={src} unoptimized={isUpload(src)} alt={`Photo ${i + 1}`} fill sizes="200px" className="object-cover" />
              {i === 0 && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10.5px] font-semibold text-brand-ink">
                  <Star className="h-3 w-3" /> Cover
                </span>
              )}
              <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1">
                <span className="flex gap-1">
                  {i > 0 && (
                    <button type="button" onClick={() => move(i, -1)} aria-label="Move earlier" className="grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white">
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {i < images.length - 1 && (
                    <button type="button" onClick={() => move(i, 1)} aria-label="Move later" className="grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
                <button type="button" onClick={() => set("images", images.filter((x) => x !== src))} aria-label="Remove photo" className="grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white hover:bg-danger">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {[...Array(uploading)].map((_, i) => (
            <div key={`u${i}`} className="grid aspect-[4/3] place-items-center rounded-xl border border-line bg-muted">
              <Loader2 className="h-5 w-5 animate-spin text-ink-3" />
            </div>
          ))}
          {images.length < 20 && (
            <button type="button" onClick={() => ref.current?.click()} className="grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-line-strong text-sm text-ink-3 transition hover:border-brand hover:text-ink">
              <span className="flex flex-col items-center gap-1">
                <ImagePlus className="h-6 w-6" /> Add photos
              </span>
            </button>
          )}
        </div>
        <input ref={ref} type="file" accept="image/*" multiple className="sr-only" aria-label="Choose photos" onChange={(e) => e.target.files && add(e.target.files).finally(() => (e.target.value = ""))} />
      </Field>
      <Field label="Video link (optional)" error={errors.videoUrl} hint="A YouTube or Vimeo walk-through. Videos are linked, not uploaded, to keep the site fast.">
        <input value={form.videoUrl ?? ""} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className={inputCls(errors.videoUrl)} />
      </Field>
    </div>
  );
}

function Documents({ id }: { id: string }) {
  const [items, setItems] = useState<DocRow[] | null>(null);
  const load = useCallback(() => {
    api<{ items: DocRow[] }>("/documents").then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-2">
        Add ownership papers so our team can verify the listing. They stay private: buyers only see a &ldquo;verified&rdquo; badge.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {PROPERTY_DOCS.map((k) => (
          <DocUploader key={k} kind={k} listingId={id} onDone={load} />
        ))}
      </div>
      <DocList items={items} onChange={load} filterListing={id} />
    </div>
  );
}

const MISSING_LABEL: Record<string, string> = {
  price: "Price",
  coords: "Map pin",
  locality: "Locality",
  city: "City",
  images: "Photos",
  description: "Description",
  landCents: "Land area",
  builtUpSqft: "Built-up area",
  beds: "Bedrooms",
  rera: "K-RERA",
};

function Review({ form, missing, errors, goTo }: { form: Form; missing: Record<string, string>; errors: Record<string, string>; goTo: (i: number) => void }) {
  const { currency } = usePrefs();
  const all = { ...missing, ...errors };
  delete (all as Record<string, string>)._;
  const keys = Object.keys(all);
  return (
    <div className="space-y-5">
      {keys.length ? (
        <div className="rounded-2xl bg-gold-soft p-4">
          <p className="font-medium text-gold">A few things before you can submit</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {keys.map((k) => (
              <li key={k} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-ink-2">
                  <X className="h-4 w-4 text-gold" /> {all[k]}
                </span>
                <button onClick={() => goTo(FIELD_STEP[k] ?? 0)} className="text-xs font-medium text-brand hover:underline">
                  Fix: {MISSING_LABEL[k] ?? k}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-2xl bg-brand-soft p-4 text-sm text-brand">
          <Check className="h-5 w-5" /> Everything is in place. Our team usually reviews within one working day.
        </p>
      )}
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {[
          ["Title", form.title],
          ["Type", `${form.type} for ${form.purpose === "rent" ? "rent" : "sale"}`],
          ["Price", form.price ? `${formatPrice(form.price, currency)}${form.purpose === "rent" ? "/mo" : ""}` : "—"],
          ["Location", [form.locality, form.city].filter(Boolean).join(", ") || "—"],
          ["Area", [form.builtUpSqft && `${form.builtUpSqft} sq.ft`, form.landCents && `${form.landCents} cents`].filter(Boolean).join(" · ") || "—"],
          ["Bedrooms", form.beds ?? "—"],
          ["Photos", String(form.images?.length ?? 0)],
          ["K-RERA", form.rera ? (form.rera.status === "registered" ? form.rera.number : form.rera.status.replace("_", " ")) : "—"],
        ].map(([k, v]) => (
          <div key={k as string} className="flex justify-between gap-3 border-b border-line pb-2">
            <dt className="text-ink-3">{k}</dt>
            <dd className="text-right font-medium">{v as string}</dd>
          </div>
        ))}
      </dl>
      <p className="flex items-center gap-2 text-xs text-ink-3">
        <Plus className="h-3.5 w-3.5" /> After approval, price, description and amenities can be changed any time. New or changed photos, location and type go back to a quick review.
      </p>
    </div>
  );
}
