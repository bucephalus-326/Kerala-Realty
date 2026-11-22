"use client";

import clsx from "clsx";
import {
  BarChart3,
  CalendarClock,
  Check,
  ExternalLink,
  Eye,
  FileText,
  Footprints,
  Heart,
  Hourglass,
  Loader2,
  MessagesSquare,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, uploadFile } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { isUpload } from "../listings-provider";
import { usePrefs } from "../providers";
import { buttonClass } from "../ui/primitives";
import { type PortalListing, Spinner, StatusBadge, usePortalGuard } from "./shared";

const TABS = [
  { key: "listings", label: "Listings", icon: BarChart3 },
  { key: "visits", label: "Visits", icon: CalendarClock },
  { key: "enquiries", label: "Enquiries", icon: MessagesSquare },
  { key: "documents", label: "Documents", icon: FileText },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function PortalHome() {
  const { ready, session } = usePortalGuard();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) ?? "listings");
  if (!ready || !session) return <Spinner />;
  const u = session.user;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">{u.role === "agent" ? "Agent & builder portal" : "Owner portal"}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{u.company ?? u.name}</h1>
        </div>
        <Link href="/portal/listings/new" className={buttonClass("primary", "md")}>
          <Plus className="h-4 w-4" /> Add a listing
        </Link>
      </header>

      {u.verification !== "verified" && u.role !== "admin" && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[#e3b95c]/40 bg-gold-soft p-4 text-sm">
          <Hourglass className="h-5 w-5 shrink-0 text-gold" />
          <p className="min-w-0 flex-1">
            <b>Profile verification pending.</b> Upload your ID{u.role === "agent" ? " and K-RERA agent registration" : ""} so our team can verify you.
            Listings stay in review until then.
          </p>
          <button onClick={() => setTab("documents")} className={buttonClass("outline", "sm")}>
            <Upload className="h-4 w-4" /> Upload documents
          </button>
        </div>
      )}

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-line no-scrollbar" role="tablist">
        {TABS.map(({ key, label, icon: I }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={clsx(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition",
              tab === key ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink",
            )}
          >
            <I className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="py-6">
        {tab === "listings" && <ListingsTab />}
        {tab === "visits" && <VisitsTab />}
        {tab === "enquiries" && <EnquiriesTab />}
        {tab === "documents" && <DocumentsTab role={u.role} />}
      </div>
    </div>
  );
}

/* ───────────── Listings ───────────── */

function ListingsTab() {
  const { currency } = usePrefs();
  const [items, setItems] = useState<PortalListing[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ items: PortalListing[] }>("/portal/listings").then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  if (!items) return <Spinner />;
  if (!items.length)
    return (
      <div className="rounded-3xl border border-dashed border-line-strong p-10 text-center">
        <p className="font-display text-xl font-semibold">No listings yet</p>
        <p className="mt-1 text-sm text-ink-3">Add your first property. It takes about five minutes, and you can save a draft at any step.</p>
        <Link href="/portal/listings/new" className={clsx(buttonClass("primary", "md"), "mt-5")}>
          <Plus className="h-4 w-4" /> Add a listing
        </Link>
      </div>
    );

  return (
    <div className="space-y-3">
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {items.map((l) => {
        const live = ["published", "sold", "rented", "unavailable"].includes(l.status);
        return (
          <article key={l.id} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-strong p-3 sm:flex-row sm:items-center">
            <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:w-36">
              {l.images[0] ? (
                <Image src={l.images[0]} unoptimized={isUpload(l.images[0])} alt="" fill sizes="144px" className="object-cover" />
              ) : (
                <span className="grid h-full place-items-center text-xs text-ink-3">No photo yet</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={l.status} />
                <span className="text-xs text-ink-3">{l.id}</span>
              </div>
              <p className="mt-1 truncate font-medium">{l.title}</p>
              <p className="text-sm text-ink-3">
                {l.price ? formatPrice(l.price, currency) : "No price yet"}
                {l.purpose === "rent" && l.price ? "/mo" : ""} · {l.locality ?? "No location yet"}
              </p>
              {l.status === "rejected" && l.reviewNote && <p className="mt-1 text-xs text-danger">Reviewer: {l.reviewNote}</p>}
              {l.status === "draft" && l.missing && Object.keys(l.missing).length > 0 && (
                <p className="mt-1 text-xs text-gold">{Object.keys(l.missing).length} details left before you can submit</p>
              )}
            </div>
            {l.stats && (
              <ul className="grid grid-cols-4 gap-3 text-center sm:w-64">
                {[
                  { i: Eye, v: l.stats.views30d, k: "Views 30d" },
                  { i: Heart, v: l.stats.saves, k: "Saves" },
                  { i: Footprints, v: l.stats.visits, k: "Visits" },
                  { i: Phone, v: l.stats.leads, k: "Leads" },
                ].map(({ i: I, v, k }) => (
                  <li key={k} title={k}>
                    <I className="mx-auto h-4 w-4 text-ink-3" />
                    <p className="font-display text-lg font-semibold tabular-nums">{v}</p>
                    <p className="text-[10px] text-ink-3">{k}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 sm:w-[220px] sm:justify-end">
              <Link href={`/portal/listings/${l.id}`} className={buttonClass("outline", "sm")}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
              {live && (
                <Link href={`/portal/listings/${l.id}/performance`} className={buttonClass("outline", "sm")}>
                  <BarChart3 className="h-4 w-4" /> Stats
                </Link>
              )}
              {l.status === "published" && (
                <Link href={`/listings/${l.id}`} className={buttonClass("ghost", "sm")} aria-label="View public page">
                  <ExternalLink className="h-4 w-4" />
                </Link>
              )}
              {live && (
                <select
                  aria-label="Availability"
                  value={l.status}
                  disabled={busy === l.id}
                  onChange={(e) => act(l.id, () => api(`/portal/listings/${l.id}/status`, { method: "POST", body: { status: e.target.value } }))}
                  className="h-9 rounded-xl border border-line-strong bg-transparent px-2 text-[13px] text-ink"
                >
                  <option value="published" className="bg-elevated">Live</option>
                  <option value={l.purpose === "rent" ? "rented" : "sold"} className="bg-elevated">
                    Mark {l.purpose === "rent" ? "rented" : "sold"}
                  </option>
                  <option value="unavailable" className="bg-elevated">Pause</option>
                </select>
              )}
              <button
                onClick={() => {
                  if (confirm(`Delete "${l.title}"? ${live ? "It will be hidden from buyers; visit history is kept." : "This can't be undone."}`))
                    act(l.id, () => api(`/portal/listings/${l.id}`, { method: "DELETE" }));
                }}
                disabled={busy === l.id}
                className={clsx(buttonClass("ghost", "sm"), "hover:text-danger")}
                aria-label={`Delete ${l.title}`}
              >
                {busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ───────────── Visits ───────────── */

interface VisitRow {
  id: string;
  listingId: string;
  listingTitle?: string;
  mode: "in_person" | "video";
  status: "requested" | "confirmed" | "cancelled" | "completed";
  note: string | null;
  ist: string;
  buyerTimeZone: string;
  buyer: { name: string; phone: string | null; email: string | null };
}

function VisitsTab() {
  const [items, setItems] = useState<VisitRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ items: VisitRow[] }>("/portal/visits").then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);
  const act = async (id: string, action: "confirm" | "decline" | "complete") => {
    setBusy(id);
    await api(`/portal/visits/${id}`, { method: "POST", body: { action } }).catch(() => {});
    setBusy(null);
    load();
  };
  if (!items) return <Spinner />;
  if (!items.length) return <Empty text="No visit requests yet. Buyers book visits and video tours from your listing pages." />;
  return (
    <ul className="space-y-3">
      {items.map((v) => (
        <li key={v.id} className={clsx("rounded-2xl border border-line bg-surface-strong p-4", v.status === "cancelled" && "opacity-60")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs text-ink-3">
                {v.mode === "video" ? <Video className="h-3.5 w-3.5" /> : <Footprints className="h-3.5 w-3.5" />}
                {v.mode === "video" ? "Live video tour" : "In-person visit"} · {v.listingTitle}
              </p>
              <p className="mt-1 font-medium">
                {v.buyer.name} · <span className="tabular-nums">{v.ist} IST</span>
              </p>
              {v.buyerTimeZone !== "Asia/Kolkata" && v.buyerTimeZone !== "Asia/Calcutta" && (
                <p className="text-xs text-ink-3">Buyer is in {v.buyerTimeZone.replace(/_/g, " ")}</p>
              )}
              {v.note && <p className="mt-1 text-sm text-ink-2">“{v.note}”</p>}
              {(v.buyer.phone || v.buyer.email) && (
                <p className="mt-2 text-sm">
                  {v.buyer.phone && (
                    <a href={`tel:${v.buyer.phone.replace(/[^+\d]/g, "")}`} className="text-brand">
                      {v.buyer.phone}
                    </a>
                  )}
                  {v.buyer.phone && v.buyer.email && " · "}
                  {v.buyer.email && (
                    <a href={`mailto:${v.buyer.email}`} className="text-brand">
                      {v.buyer.email}
                    </a>
                  )}
                </p>
              )}
              {v.status === "requested" && <p className="mt-1 text-xs text-ink-3">Contact details are shared once you confirm.</p>}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium capitalize", v.status === "confirmed" ? "bg-brand-soft text-brand" : v.status === "requested" ? "bg-gold-soft text-gold" : "bg-muted text-ink-3")}>
                {v.status === "requested" ? "New request" : v.status}
              </span>
              {v.status === "requested" && (
                <button disabled={busy === v.id} onClick={() => act(v.id, "confirm")} className={buttonClass("primary", "sm")}>
                  <Check className="h-4 w-4" /> Confirm
                </button>
              )}
              {v.status === "confirmed" && (
                <button disabled={busy === v.id} onClick={() => act(v.id, "complete")} className={buttonClass("outline", "sm")}>
                  Mark done
                </button>
              )}
              {(v.status === "requested" || v.status === "confirmed") && (
                <button disabled={busy === v.id} onClick={() => act(v.id, "decline")} className={buttonClass("ghost", "sm")} aria-label="Decline visit">
                  <X className="h-4 w-4" /> Decline
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ───────────── Enquiries ───────────── */

interface LeadRow {
  _id: string;
  name: string;
  phone: string;
  preferredTime?: string;
  timeZone?: string;
  message?: string;
  listingIds: string[];
  source: string;
  status: "new" | "contacted" | "closed";
  createdAt: string;
}

function EnquiriesTab() {
  const [items, setItems] = useState<LeadRow[] | null>(null);
  const load = useCallback(() => {
    api<{ items: LeadRow[] }>("/portal/leads").then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);
  if (!items) return <Spinner />;
  if (!items.length) return <Empty text="No enquiries yet. Call-back requests from your listing pages and the assistant show up here." />;
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface-strong">
      {items.map((l) => (
        <li key={l._id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="font-medium">{l.name}</p>
            <p className="text-sm">
              <a href={`tel:${l.phone.replace(/[^+\d]/g, "")}`} className="text-brand">
                {l.phone}
              </a>
              <span className="text-ink-3">
                {" "}
                · {l.preferredTime ?? "Any time"}
                {l.timeZone && !["Asia/Kolkata", "Asia/Calcutta"].includes(l.timeZone) ? ` · ${l.timeZone.split("/").pop()?.replace(/_/g, " ")}` : ""}
              </span>
            </p>
            <p className="text-xs text-ink-3">
              {l.listingIds.join(", ")} · via {l.source === "listing" ? "listing page" : l.source} · {new Date(l.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
          <select
            aria-label={`Status for ${l.name}`}
            value={l.status}
            onChange={async (e) => {
              await api(`/portal/leads/${l._id}`, { method: "POST", body: { status: e.target.value } }).catch(() => {});
              load();
            }}
            className="h-9 rounded-xl border border-line-strong bg-transparent px-2 text-[13px] text-ink"
          >
            <option value="new" className="bg-elevated">New</option>
            <option value="contacted" className="bg-elevated">Contacted</option>
            <option value="closed" className="bg-elevated">Closed</option>
          </select>
        </li>
      ))}
    </ul>
  );
}

/* ───────────── Documents ───────────── */

export interface DocRow {
  id: string;
  name: string;
  kind: string;
  listingId: string | null;
  sha256: string;
  size: number;
  review: string;
  uploadedAt: string;
}

export const DOC_LABEL: Record<string, string> = {
  title_deed: "Title deed",
  tax_receipt: "Land tax receipt",
  encumbrance: "Encumbrance certificate",
  building_permit: "Building permit",
  rera_certificate: "K-RERA certificate",
  id_proof: "ID proof",
  agent_licence: "K-RERA agent registration",
  other: "Other",
};

function DocumentsTab({ role }: { role: string }) {
  const [items, setItems] = useState<DocRow[] | null>(null);
  const load = useCallback(() => {
    api<{ items: DocRow[] }>("/documents").then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);
  const kinds = role === "agent" ? ["id_proof", "agent_licence"] : ["id_proof"];
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="rounded-3xl border border-line bg-surface-strong p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <ShieldCheck className="h-5 w-5 text-brand" /> Profile verification
        </h2>
        <p className="mt-1 text-sm text-ink-3">Our team checks these once. They&apos;re never shown to buyers.</p>
        <div className="mt-4 space-y-3">
          {kinds.map((k) => (
            <DocUploader key={k} kind={k} onDone={load} />
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-3">Property documents (title deed, tax receipt, permits) are added per listing in the listing editor.</p>
      </section>
      <DocList items={items} onChange={load} />
    </div>
  );
}

export function DocUploader({ kind, listingId, onDone }: { kind: string; listingId?: string; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={`Upload ${DOC_LABEL[kind]}`}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > 8 * 1024 * 1024) return setError("Files must be under 8 MB");
          setState("busy");
          setError(null);
          try {
            await uploadFile("/documents", f, { "X-Doc-Kind": kind, "X-File-Name": f.name, ...(listingId && { "X-Listing-Id": listingId }) });
            onDone();
          } catch (err) {
            setError((err as ApiError).message);
          } finally {
            setState("idle");
          }
        }}
      />
      <button onClick={() => ref.current?.click()} disabled={state === "busy"} className={clsx(buttonClass("outline", "sm"), "w-full justify-between")}>
        <span className="flex items-center gap-2">
          <FileText className="h-4 w-4" /> {DOC_LABEL[kind]}
        </span>
        {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function DocList({ items, onChange, filterListing }: { items: DocRow[] | null; onChange: () => void; filterListing?: string }) {
  const rows = (items ?? []).filter((d) => !filterListing || d.listingId === filterListing);
  if (!items) return <Spinner />;
  return (
    <section className="rounded-3xl border border-line bg-surface-strong p-5">
      <h2 className="font-display text-lg font-semibold">Document vault</h2>
      <p className="mt-1 text-sm text-ink-3">
        Private. Each file gets a SHA-256 fingerprint, so any later change to it can be detected. Every view is logged.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-ink-3">No documents yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{DOC_LABEL[d.kind] ?? d.kind}</p>
                <p className="truncate text-xs text-ink-3">
                  {d.name} · {(d.size / 1024).toFixed(0)} KB{d.listingId ? ` · ${d.listingId}` : ""}
                </p>
                <p className="font-mono text-[11px] text-ink-3" title={d.sha256}>
                  sha256 {d.sha256.slice(0, 16)}…
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={clsx("rounded-full px-2 py-0.5 text-xs", d.review === "verified" ? "bg-brand-soft text-brand" : "bg-gold-soft text-gold")}>
                  {d.review === "verified" ? "Verified" : "Awaiting review"}
                </span>
                <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")} aria-label={`Open ${d.name}`}>
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete ${d.name}?`)) return;
                    await api(`/documents/${d.id}`, { method: "DELETE" }).catch(() => {});
                    onChange();
                  }}
                  className={clsx(buttonClass("ghost", "sm"), "hover:text-danger")}
                  aria-label={`Delete ${d.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-3xl border border-dashed border-line-strong p-10 text-center text-sm text-ink-3">{text}</p>;
}
