"use client";

import clsx from "clsx";
import {
  Activity,
  BadgeCheck,
  Building2,
  Check,
  ClipboardCheck,
  ExternalLink,
  Flag,
  Hourglass,
  LayoutDashboard,
  Loader2,
  MessagesSquare,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  Star,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, ROLE_LABEL, type Role, type User } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { AssistantStats, LeadsPanel } from "../account/account-view";
import { isUpload } from "../listings-provider";
import { DOC_LABEL, type DocRow } from "../portal/portal-home";
import { Spinner, type ListingStatus } from "../portal/shared";
import { usePrefs } from "../providers";
import { buttonClass } from "../ui/primitives";
import { BarList, DailyBars, Stat } from "./charts";

const SECTIONS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "review", label: "Listing review", icon: ClipboardCheck },
  { key: "verification", label: "Verification", icon: BadgeCheck },
  { key: "reports", label: "Reports", icon: Flag },
  { key: "listings", label: "Listings", icon: Building2 },
  { key: "users", label: "Users", icon: Users },
  { key: "leads", label: "Leads", icon: MessagesSquare },
  { key: "activity", label: "Activity log", icon: Activity },
  { key: "settings", label: "Settings", icon: SettingsIcon },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

export function AdminConsole() {
  const { session, authLoading, can } = usePrefs();
  const router = useRouter();
  const params = useSearchParams();
  const section = (params.get("s") as Section) ?? "overview";
  const go = (s: Section) => router.replace(`/admin?s=${s}`, { scroll: false });
  const allowed = can("users:manage");

  useEffect(() => {
    if (authLoading) return;
    if (!session) router.replace("/signin?next=/admin");
    else if (!allowed) router.replace("/account");
  }, [authLoading, session, allowed, router]);
  if (authLoading || !session || !allowed) return <Spinner />;

  return (
    <div className="mx-auto flex max-w-[1400px] gap-6 px-4 md:px-6">
      <nav className="sticky top-28 hidden h-fit w-56 shrink-0 lg:block" aria-label="Admin sections">
        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-3">Admin</p>
        <ul className="space-y-0.5">
          {SECTIONS.map(({ key, label, icon: I }) => (
            <li key={key}>
              <button
                onClick={() => go(key)}
                aria-current={section === key ? "page" : undefined}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                  section === key ? "bg-brand-soft text-ink" : "text-ink-3 hover:bg-muted hover:text-ink",
                )}
              >
                <I className={clsx("h-4 w-4", section === key && "text-brand")} /> {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">
        <div className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 no-scrollbar lg:hidden">
          {SECTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => go(key)}
              aria-current={section === key ? "page" : undefined}
              className={clsx("-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium", section === key ? "border-brand text-ink" : "border-transparent text-ink-3")}
            >
              {label}
            </button>
          ))}
        </div>
        <h1 className="mb-5 font-display text-2xl font-semibold tracking-tight md:text-3xl">{SECTIONS.find((s) => s.key === section)?.label}</h1>
        {section === "overview" && <Overview go={go} />}
        {section === "review" && <ReviewQueue />}
        {section === "verification" && <Verification />}
        {section === "reports" && <Reports />}
        {section === "listings" && <LiveListings />}
        {section === "users" && <UsersSection selfId={session.user.id} />}
        {section === "leads" && <LeadsPanel path="/admin/leads" />}
        {section === "activity" && <ActivityLog />}
        {section === "settings" && <SettingsSection />}
      </div>
    </div>
  );
}

/* ───────────── shared bits ───────────── */

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<T>(path)
      .then(setData)
      .catch((e: ApiError) => setError(e.message));
  }, [path]);
  useEffect(load, [load]);
  return { data, error, reload: load };
}

function Card({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-2xl border border-line bg-surface-strong p-4 md:p-5", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="font-display text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-ink-3">{text}</p>;
}

/** Inline "reason / note" prompt used for reject, takedown and report decisions. */
function NoteAction({ label, placeholder, danger, required = true, onSubmit }: { label: string; placeholder: string; danger?: boolean; required?: boolean; onSubmit: (note: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className={clsx(buttonClass(danger ? "ghost" : "outline", "sm"), danger && "text-danger hover:text-danger")}>
        {label}
      </button>
    );
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit(note.trim());
          setOpen(false);
          setNote("");
        } catch (err) {
          setError((err as ApiError).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-9 min-w-0 flex-1 rounded-xl border border-line-strong bg-transparent px-3 text-sm text-ink outline-none focus:border-brand"
      />
      <button disabled={busy || (required && note.trim().length < 3)} className={buttonClass(danger ? "primary" : "primary", "sm")}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {label}
      </button>
      <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")} aria-label="Cancel">
        <X className="h-4 w-4" />
      </button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </form>
  );
}

function VerificationPill({ v }: { v?: string }) {
  if (!v || v === "not_required") return null;
  return (
    <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium", v === "verified" ? "bg-brand-soft text-brand" : v === "rejected" ? "bg-danger/10 text-danger" : "bg-gold-soft text-gold")}>
      {v === "verified" ? "Verified" : v === "rejected" ? "Rejected" : "Unverified"}
    </span>
  );
}

/* ───────────── Overview ───────────── */

interface Analytics {
  totals: { users: number; live: number; pendingReview: number; pendingVerification: number; openReports: number };
  usersByRole: { _id: Role; n: number }[];
  listingsByStatus: { _id: ListingStatus; n: number }[];
  listingsByCity: { _id: string; n: number }[];
  series: Record<"newUsers" | "leads" | "visits" | "views", { day: string; n: number }[]>;
  topListings: { id: string; title: string; locality: string; views: number }[];
}

function Overview({ go }: { go: (s: Section) => void }) {
  const [days, setDays] = useState(30);
  const { data, error } = useLoad<Analytics>(`/admin/analytics?days=${days}`);
  if (error) return <Empty text={error} />;
  if (!data) return <Spinner />;
  const t = data.totals;
  const STATUS: Record<string, string> = { published: "Live", pending: "In review", draft: "Draft", rejected: "Rejected / taken down", sold: "Sold", rented: "Rented", unavailable: "Paused", removed: "Deleted" };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Users" value={t.users} icon={Users} onClick={() => go("users")} />
        <Stat label="Live listings" value={t.live} icon={Building2} onClick={() => go("listings")} />
        <Stat label="Awaiting review" value={t.pendingReview} icon={ClipboardCheck} attention={t.pendingReview > 0} onClick={() => go("review")} />
        <Stat label="To verify" value={t.pendingVerification} icon={Hourglass} attention={t.pendingVerification > 0} onClick={() => go("verification")} />
        <Stat label="Open reports" value={t.openReports} icon={ShieldAlert} attention={t.openReports > 0} onClick={() => go("reports")} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink-2">Activity</p>
        <div className="flex rounded-xl bg-muted p-1" role="radiogroup" aria-label="Time range">
          {[7, 30, 90].map((d) => (
            <button key={d} role="radio" aria-checked={days === d} onClick={() => setDays(d)} className={clsx("rounded-lg px-3 py-1 text-xs font-semibold", days === d ? "bg-surface-strong text-ink shadow-card" : "text-ink-3")}>
              {d} days
            </button>
          ))}
        </div>
      </div>
      {/* Small multiples: each metric on its own axis (their scales differ a lot). */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DailyBars title="Listing views" data={data.series.views} unit="views" />
        <DailyBars title="Visits booked" data={data.series.visits} unit="visits" />
        <DailyBars title="Call-back leads" data={data.series.leads} unit="leads" />
        <DailyBars title="New accounts" data={data.series.newUsers} unit="sign-ups" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Most viewed listings">
          <BarList rows={data.topListings.map((l) => ({ label: l.title, hint: l.locality, value: l.views }))} />
        </Card>
        <Card title="Listings by status">
          <BarList rows={[...data.listingsByStatus].sort((a, b) => b.n - a.n).map((r) => ({ label: STATUS[r._id] ?? r._id, value: r.n }))} />
        </Card>
        <Card title="Users by role">
          <BarList rows={[...data.usersByRole].sort((a, b) => b.n - a.n).map((r) => ({ label: ROLE_LABEL[r._id] ?? r._id, value: r.n }))} />
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2 text-sm font-medium text-ink-2">Live listings by city</p>
            <BarList rows={data.listingsByCity.map((r) => ({ label: r._id === "Thiruvananthapuram" ? "Trivandrum" : r._id, value: r.n }))} />
          </div>
        </Card>
      </div>
      <AssistantStats />
    </div>
  );
}

/* ───────────── Listing review ───────────── */

interface AdminListing {
  id: string;
  title: string;
  purpose: "buy" | "rent";
  type: string;
  price: number;
  status: ListingStatus;
  locality?: string;
  city?: string;
  images: string[];
  description?: string;
  beds?: number;
  builtUpSqft?: number;
  landCents?: number;
  rera?: { status: string; number?: string };
  highlights?: { label: string; km: number }[];
  flood?: { level: string; zone: string | null };
  featured?: boolean;
  owner: { id: string; name: string; role: string; verification: string } | null;
  documents: number;
  openReports: number;
  submittedAt?: string;
}

function ReviewQueue() {
  const { data, error, reload } = useLoad<{ items: AdminListing[] }>("/admin/listings?status=pending");
  const { currency } = usePrefs();
  if (error) return <Empty text={error} />;
  if (!data) return <Spinner />;
  if (!data.items.length) return <Empty text="Nothing waiting for review." />;
  return (
    <ul className="space-y-4">
      {data.items.map((l) => (
        <li key={l.id}>
          <Card>
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="grid shrink-0 grid-cols-3 gap-1.5 md:w-72 md:grid-cols-2">
                {l.images.slice(0, 4).map((src, i) => (
                  <span key={src} className={clsx("relative aspect-[4/3] overflow-hidden rounded-lg bg-muted", i === 0 && "md:col-span-2")}>
                    <Image src={src} unoptimized={isUpload(src)} alt={`${l.title} photo ${i + 1}`} fill sizes="280px" className="object-cover" />
                  </span>
                ))}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                  <span>{l.id}</span>
                  <span>·</span>
                  <span>
                    {l.type} for {l.purpose === "rent" ? "rent" : "sale"}
                  </span>
                  {l.submittedAt && <span>· submitted {new Date(l.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
                </div>
                <h2 className="font-display text-lg font-semibold">{l.title}</h2>
                <p className="text-sm text-ink-2">
                  {formatPrice(l.price, currency)}
                  {l.purpose === "rent" && "/mo"} · {l.locality}, {l.city}
                  {l.beds ? ` · ${l.beds} BHK` : ""}
                  {l.builtUpSqft ? ` · ${l.builtUpSqft} sq.ft` : ""}
                  {l.landCents ? ` · ${l.landCents} cents` : ""}
                </p>
                {l.description && <p className="line-clamp-3 text-sm text-ink-3">{l.description}</p>}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-ink-3">Owner: {l.owner?.name ?? "Unknown"}</span>
                  <VerificationPill v={l.owner?.verification} />
                  <span className="rounded-full bg-muted px-2 py-0.5 text-ink-2">{l.documents} document{l.documents === 1 ? "" : "s"}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-ink-2">
                    K-RERA: {l.rera?.status === "registered" ? <span className="font-mono">{l.rera.number}</span> : l.rera?.status?.replace("_", " ") ?? "—"}
                  </span>
                  {l.flood?.level && l.flood.level !== "low" && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">{l.flood.level} flood risk</span>}
                </div>
                {l.owner?.verification !== "verified" && (
                  <p className="text-xs text-gold">The owner isn&apos;t verified yet. Approving publishes it without the verified badge.</p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={async () => {
                      await api(`/admin/listings/${l.id}/review`, { method: "POST", body: { decision: "approve" } });
                      reload();
                    }}
                    className={buttonClass("primary", "sm")}
                  >
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <NoteAction
                    label="Send back"
                    placeholder="What should the owner change? e.g. photos are blurry"
                    onSubmit={async (note) => {
                      await api(`/admin/listings/${l.id}/review`, { method: "POST", body: { decision: "reject", note } });
                      reload();
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/* ───────────── Verification ───────────── */

function Verification() {
  const { data, error, reload } = useLoad<{ items: { user: User; createdAt: string; documents: DocRow[] }[] }>("/admin/verifications");
  if (error) return <Empty text={error} />;
  if (!data) return <Spinner />;
  if (!data.items.length) return <Empty text="No owners or agents waiting for verification." />;
  const setUser = async (id: string, verification: "verified" | "rejected") => {
    await api(`/admin/users/${id}`, { method: "PATCH", body: { verification } });
    reload();
  };
  const reviewDoc = async (id: string, decision: "verified" | "rejected") => {
    await api(`/admin/documents/${id}/review`, { method: "POST", body: { decision } });
    reload();
  };
  return (
    <ul className="space-y-4">
      {data.items.map(({ user, createdAt, documents }) => (
        <li key={user.id}>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {user.company ?? user.name} <span className="text-sm font-normal text-ink-3">· {ROLE_LABEL[user.role]}</span>
                </p>
                <p className="text-xs text-ink-3">
                  {user.email}
                  {user.phone ? ` · ${user.phone}` : ""} · joined {new Date(createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setUser(user.id, "verified")} disabled={!documents.length} className={buttonClass("primary", "sm")} title={documents.length ? undefined : "No documents uploaded yet"}>
                  <BadgeCheck className="h-4 w-4" /> Verify
                </button>
                <button onClick={() => setUser(user.id, "rejected")} className={clsx(buttonClass("ghost", "sm"), "text-danger hover:text-danger")}>
                  Reject
                </button>
              </div>
            </div>
            {documents.length === 0 ? (
              <p className="mt-3 text-sm text-ink-3">No documents uploaded yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                {documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">{DOC_LABEL[d.kind] ?? d.kind}</span>
                      <span className="text-ink-3"> · {d.name}</span>
                      {d.listingId && <span className="text-ink-3"> · {d.listingId}</span>}
                      <span className="block font-mono text-[11px] text-ink-3">sha256 {d.sha256.slice(0, 16)}…</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
                        <ExternalLink className="h-4 w-4" /> Open
                      </a>
                      {d.review === "pending" ? (
                        <>
                          <button onClick={() => reviewDoc(d.id, "verified")} className={buttonClass("outline", "sm")}>
                            Looks genuine
                          </button>
                          <button onClick={() => reviewDoc(d.id, "rejected")} className={clsx(buttonClass("ghost", "sm"), "text-danger")}>
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className={clsx("rounded-full px-2 py-0.5 text-xs", d.review === "verified" ? "bg-brand-soft text-brand" : "bg-danger/10 text-danger")}>{d.review}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-ink-3">Opening a document is recorded in the activity log.</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/* ───────────── Reports ───────────── */

const REASON: Record<string, string> = {
  fake: "Fake or doesn't exist",
  wrong_price: "Wrong price",
  already_sold: "Already sold or rented",
  wrong_location: "Wrong location",
  duplicate: "Duplicate listing",
  scam: "Scam or asked for money",
  other: "Other",
};

function Reports() {
  const [status, setStatus] = useState<"open" | "dismissed" | "actioned">("open");
  const { data, error, reload } = useLoad<{
    items: { id: string; listingId: string; listing: { title: string; status: string; locality: string; image?: string } | null; reason: string; details: string | null; reporter: string; status: string; resolution: string | null; createdAt: string }[];
  }>(`/admin/reports?status=${status}`);
  return (
    <div className="space-y-4">
      <div className="flex rounded-xl bg-muted p-1 sm:w-fit" role="radiogroup" aria-label="Report status">
        {(["open", "actioned", "dismissed"] as const).map((s) => (
          <button key={s} role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={clsx("flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize", status === s ? "bg-surface-strong text-ink shadow-card" : "text-ink-3")}>
            {s}
          </button>
        ))}
      </div>
      {error ? (
        <Empty text={error} />
      ) : !data ? (
        <Spinner />
      ) : !data.items.length ? (
        <Empty text={status === "open" ? "No open reports. Visitors can report a listing from its page." : `No ${status} reports.`} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {r.listing?.image && (
                    <span className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <Image src={r.listing.image} unoptimized={isUpload(r.listing.image)} alt="" fill sizes="112px" className="object-cover" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">{REASON[r.reason] ?? r.reason}</span>
                      <Link href={`/listings/${r.listingId}`} className="font-medium hover:text-brand" target="_blank">
                        {r.listing?.title ?? r.listingId}
                      </Link>
                      <span className="text-xs text-ink-3">{r.listing?.locality}</span>
                    </p>
                    {r.details && <p className="text-sm text-ink-2">“{r.details}”</p>}
                    <p className="text-xs text-ink-3">
                      {r.reporter} · {new Date(r.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                      {r.resolution && ` · resolution: ${r.resolution}`}
                    </p>
                    {r.status === "open" && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <NoteAction
                          label="Take down"
                          danger
                          placeholder="Why? The owner sees this note"
                          onSubmit={async (note) => {
                            await api(`/admin/reports/${r.id}`, { method: "POST", body: { action: "takedown", note } });
                            reload();
                          }}
                        />
                        <NoteAction
                          label="Dismiss"
                          placeholder="e.g. Checked with owner, still available"
                          onSubmit={async (note) => {
                            await api(`/admin/reports/${r.id}`, { method: "POST", body: { action: "dismiss", note } });
                            reload();
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────── Live listings: featured + takedown ───────────── */

function LiveListings() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [onlyFeatured, setOnlyFeatured] = useState(false);
  const { currency } = usePrefs();
  const path = `/admin/listings?status=published${query ? `&q=${encodeURIComponent(query)}` : ""}${onlyFeatured ? "&featured=true" : ""}`;
  const { data, error, reload } = useLoad<{ items: AdminListing[] }>(path);
  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by id, title or locality" aria-label="Search listings" className="h-10 w-full rounded-xl border border-line-strong bg-transparent pl-9 pr-3 text-sm text-ink outline-none focus:border-brand" />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={onlyFeatured} onChange={(e) => setOnlyFeatured(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" /> Featured only
        </label>
      </form>
      {error ? (
        <Empty text={error} />
      ) : !data ? (
        <Spinner />
      ) : !data.items.length ? (
        <Empty text="No live listings match." />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface-strong">
          {data.items.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                {l.images[0] && <Image src={l.images[0]} unoptimized={isUpload(l.images[0])} alt="" fill sizes="80px" className="object-cover" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <Link href={`/listings/${l.id}`} target="_blank" className="truncate font-medium hover:text-brand">
                    {l.title}
                  </Link>
                  {l.openReports > 0 && <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] text-danger">{l.openReports} report{l.openReports > 1 ? "s" : ""}</span>}
                </span>
                <span className="block text-xs text-ink-3">
                  {l.id} · {formatPrice(l.price, currency)} · {l.locality} · {l.owner?.name}
                </span>
              </span>
              <button
                onClick={async () => {
                  await api(`/admin/listings/${l.id}/feature`, { method: "POST", body: { featured: !l.featured } });
                  reload();
                }}
                aria-pressed={!!l.featured}
                className={clsx(buttonClass(l.featured ? "gold" : "outline", "sm"))}
              >
                <Star className={clsx("h-4 w-4", l.featured && "fill-current")} /> {l.featured ? "Featured" : "Feature"}
              </button>
              <div className="w-full sm:w-auto">
                <NoteAction
                  label="Take down"
                  danger
                  placeholder="Reason (the owner sees this)"
                  onSubmit={async (reason) => {
                    await api(`/admin/listings/${l.id}/takedown`, { method: "POST", body: { reason } });
                    reload();
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────── Users ───────────── */

interface AdminUser extends User {
  status: "active" | "suspended";
  createdAt: string;
  lastLoginAt: string | null;
  listings: number;
  suspendedReason: string | null;
}

function UsersSection({ selfId }: { selfId: string }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const path = `/admin/users?${new URLSearchParams({ ...(query && { q: query }), ...(role && { role }), ...(status && { status }) })}`;
  const { data, error, reload } = useLoad<{ items: AdminUser[]; total: number }>(path);
  const [msg, setMsg] = useState<string | null>(null);
  const patch = async (id: string, body: Record<string, unknown>) => {
    setMsg(null);
    try {
      await api(`/admin/users/${id}`, { method: "PATCH", body });
      reload();
    } catch (e) {
      setMsg((e as ApiError).message);
    }
  };
  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
        className="flex flex-wrap gap-2"
      >
        <label className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or company" aria-label="Search users" className="h-10 w-full rounded-xl border border-line-strong bg-transparent pl-9 pr-3 text-sm text-ink outline-none focus:border-brand" />
        </label>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" className="h-10 rounded-xl border border-line-strong bg-transparent px-2 text-sm text-ink">
          <option value="" className="bg-elevated">All roles</option>
          {Object.entries(ROLE_LABEL).map(([v, l]) => (
            <option key={v} value={v} className="bg-elevated">{l}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="h-10 rounded-xl border border-line-strong bg-transparent px-2 text-sm text-ink">
          <option value="" className="bg-elevated">Any status</option>
          <option value="active" className="bg-elevated">Active</option>
          <option value="suspended" className="bg-elevated">Suspended</option>
        </select>
      </form>
      {msg && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
      {error ? (
        <Empty text={error} />
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface-strong">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-3">
              <tr>
                <th className="px-3 py-2.5 font-medium">User</th>
                <th className="px-3 py-2.5 font-medium">Role</th>
                <th className="px-3 py-2.5 font-medium">Listings</th>
                <th className="px-3 py-2.5 font-medium">Last sign-in</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((u) => {
                const self = u.id === selfId;
                return (
                  <tr key={u.id} className={clsx(u.status === "suspended" && "bg-danger/5")}>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{u.company ?? u.name}</span>
                        <VerificationPill v={u.verification} />
                        {self && <span className="text-xs text-ink-3">(you)</span>}
                      </span>
                      <span className="block text-xs text-ink-3">{u.email}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={u.role}
                        disabled={self}
                        onChange={(e) => {
                          if (confirm(`Change ${u.name} to ${ROLE_LABEL[e.target.value as Role]}? They'll be signed out.`)) patch(u.id, { role: e.target.value });
                        }}
                        aria-label={`Role for ${u.name}`}
                        className="h-8 rounded-lg border border-line-strong bg-transparent px-1.5 text-[13px] text-ink disabled:opacity-60"
                      >
                        {Object.entries(ROLE_LABEL).map(([v, l]) => (
                          <option key={v} value={v} className="bg-elevated">{l}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{u.listings}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-3">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Never"}</td>
                    <td className="px-3 py-2.5">
                      {u.status === "suspended" ? (
                        <span className="flex items-center gap-2">
                          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger" title={u.suspendedReason ?? undefined}>
                            Suspended
                          </span>
                          <button onClick={() => patch(u.id, { status: "active" })} className="text-xs text-brand hover:underline">
                            Reactivate
                          </button>
                        </span>
                      ) : self ? (
                        <span className="text-xs text-ink-3">Active</span>
                      ) : (
                        <NoteAction label="Suspend" danger placeholder="Reason (kept in the log)" onSubmit={(reason) => patch(u.id, { status: "suspended", suspendedReason: reason })} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-line px-3 py-2 text-xs text-ink-3">{data.total} users</p>
        </div>
      )}
    </div>
  );
}

/* ───────────── Activity log ───────────── */

const ACTION_GROUPS = [
  { v: "", t: "All actions" },
  { v: "auth.", t: "Sign-ins" },
  { v: "admin.", t: "Admin changes" },
  { v: "listing.", t: "Listings" },
  { v: "document.", t: "Documents" },
  { v: "visit.", t: "Visits" },
  { v: "lead.", t: "Leads" },
  { v: "report.", t: "Reports" },
];

function ActivityLog() {
  const [action, setAction] = useState("");
  const [pageNo, setPage] = useState(1);
  const { data, error } = useLoad<{ total: number; items: { _id: string; action: string; actorRole: string; actor: { name: string; email: string } | null; target?: string; meta?: Record<string, unknown>; createdAt: string }[] }>(
    `/admin/audit?page=${pageNo}${action ? `&action=${action}` : ""}`,
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ACTION_GROUPS.map((g) => (
          <button
            key={g.v}
            onClick={() => {
              setAction(g.v);
              setPage(1);
            }}
            aria-pressed={action === g.v}
            className={clsx("rounded-full border px-3 py-1.5 text-xs font-medium", action === g.v ? "border-brand bg-brand-soft text-ink" : "border-line-strong text-ink-3 hover:text-ink")}
          >
            {g.t}
          </button>
        ))}
      </div>
      {error ? (
        <Empty text={error} />
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface-strong">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-3">
              <tr>
                <th className="px-3 py-2.5 font-medium">When</th>
                <th className="px-3 py-2.5 font-medium">Who</th>
                <th className="px-3 py-2.5 font-medium">Action</th>
                <th className="px-3 py-2.5 font-medium">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((a) => (
                <tr key={a._id}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-ink-3">{new Date(a.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" })}</td>
                  <td className="px-3 py-2 text-xs">
                    {a.actor ? a.actor.name : <span className="text-ink-3">Visitor</span>} <span className="text-ink-3">· {a.actorRole}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{a.action}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-xs text-ink-3" title={a.meta ? JSON.stringify(a.meta) : undefined}>
                    {a.target ?? "—"}
                    {a.meta && Object.keys(a.meta).length > 0 && <span> · {Object.entries(a.meta).slice(0, 2).map(([k, v]) => `${k}: ${typeof v === "object" ? "…" : String(v)}`).join(", ")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-ink-3">
            <span>{data.total} entries</span>
            <span className="flex gap-2">
              <button disabled={pageNo === 1} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-40">
                Newer
              </button>
              <button disabled={pageNo * 100 >= data.total} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-40">
                Older
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Settings ───────────── */

interface PlatformSettings {
  announcement: { text: string; active: boolean };
  ai: { dailyPerVisitor: number; globalDaily: number; enabled: boolean };
  uploads: { maxFiles: number; maxMB: number };
}

function SettingsSection() {
  const { data, error } = useLoad<PlatformSettings>("/admin/settings");
  const [form, setForm] = useState<PlatformSettings | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  if (error) return <Empty text={error} />;
  if (!form) return <Spinner />;
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const input = "h-10 w-full rounded-xl border border-line-strong bg-transparent px-3 text-sm text-ink outline-none focus:border-brand";
  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("saving");
        setErr(null);
        try {
          setForm(await api<PlatformSettings>("/admin/settings", { method: "PUT", body: form }));
          setState("saved");
          setTimeout(() => setState("idle"), 1600);
        } catch (e2) {
          setErr((e2 as ApiError).message);
          setState("idle");
        }
      }}
    >
      <Card title="Site announcement">
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">Message shown at the top of every page</span>
          <input value={form.announcement.text} maxLength={200} onChange={(e) => setForm({ ...form, announcement: { ...form.announcement, text: e.target.value } })} placeholder="e.g. Office closed for Onam, 4–5 September" className={input} />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.announcement.active} onChange={(e) => setForm({ ...form, announcement: { ...form.announcement, active: e.target.checked } })} className="h-4 w-4 accent-[var(--brand)]" /> Show it
        </label>
      </Card>
      <Card title="AI assistant">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.ai.enabled} onChange={(e) => setForm({ ...form, ai: { ...form.ai, enabled: e.target.checked } })} className="h-4 w-4 accent-[var(--brand)]" /> Use the AI model
          <span className="text-ink-3">(off: the assistant answers with rules only, still free)</span>
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-ink-2">AI answers per visitor per day</span>
            <input type="number" min={0} max={500} value={form.ai.dailyPerVisitor} onChange={(e) => setForm({ ...form, ai: { ...form.ai, dailyPerVisitor: num(e.target.value) } })} className={input} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-2">AI answers per day, whole site</span>
            <input type="number" min={0} max={100000} value={form.ai.globalDaily} onChange={(e) => setForm({ ...form, ai: { ...form.ai, globalDaily: num(e.target.value) } })} className={input} />
          </label>
        </div>
      </Card>
      <Card title="Uploads per account">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-ink-2">Max files</span>
            <input type="number" min={1} max={1000} value={form.uploads.maxFiles} onChange={(e) => setForm({ ...form, uploads: { ...form.uploads, maxFiles: num(e.target.value) } })} className={input} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-2">Max storage (MB)</span>
            <input type="number" min={1} max={500} value={form.uploads.maxMB} onChange={(e) => setForm({ ...form, uploads: { ...form.uploads, maxMB: num(e.target.value) } })} className={input} />
          </label>
        </div>
        <p className="mt-2 text-xs text-ink-3">The free database holds 512 MB in total. Keep the per-account cap well below that.</p>
      </Card>
      {err && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      <button disabled={state === "saving"} className={buttonClass("primary", "md")}>
        {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {state === "saved" ? "Saved" : "Save settings"}
      </button>
      <p className="text-xs text-ink-3">Changes apply within 30 seconds. Every change is recorded in the activity log.</p>
    </form>
  );
}
