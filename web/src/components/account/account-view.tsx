"use client";

import clsx from "clsx";
import {
  BadgeCheck,
  CalendarClock,
  Clock,
  Footprints,
  Heart,
  Hourglass,
  Loader2,
  LogOut,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
  ShieldCheck,
  Users,
  Video,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { site } from "@/config/site";
import { isUpload, useListings } from "../listings-provider";
import { api, ApiError, ROLE_LABEL, type User, type Visit } from "@/lib/api";
import { CURRENCIES, formatPrice, type Currency } from "@/lib/currency";
import { sameAsIST } from "@/lib/time";
import { PropertyCard } from "../property/property-card";
import { usePrefs } from "../providers";
import { buttonClass } from "../ui/primitives";

const TIME_ZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Qatar",
  "Asia/Riyadh",
  "Asia/Kuwait",
  "Asia/Muscat",
  "Asia/Bahrain",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
];

export function AccountView() {
  const { session, authLoading, signOut } = usePrefs();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !session && !leaving) router.replace("/signin?next=/account");
  }, [authLoading, session, leaving, router]);

  if (authLoading || !session) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-ink-3">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  const { user } = session;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand font-display text-xl font-semibold text-brand-ink">
            {user.name.charAt(0)}
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Hello, {user.name.split(" ")[0]}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-ink-2">{ROLE_LABEL[user.role]}</span>
              <VerificationBadge v={user.verification} />
              <span className="text-ink-3">{user.email}</span>
            </div>
          </div>
        </div>
        <button
          onClick={async () => {
            setLeaving(true);
            await signOut();
            router.replace("/");
          }}
          className={buttonClass("outline", "sm")}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </header>

      <div className="mt-10">
        {user.role === "nri" ? (
          <NriDashboard />
        ) : user.role === "buyer" ? (
          <BuyerDashboard />
        ) : user.role === "admin" ? (
          <AdminDashboard />
        ) : (
          <PortalDashboard user={user} />
        )}
      </div>
    </div>
  );
}

function VerificationBadge({ v }: { v: User["verification"] }) {
  if (v === "not_required") return null;
  const map = {
    pending: { t: "Verification pending", c: "bg-gold-soft text-gold", i: Hourglass },
    verified: { t: "Verified", c: "bg-brand-soft text-brand", i: BadgeCheck },
    rejected: { t: "Verification rejected", c: "bg-danger/10 text-danger", i: ShieldCheck },
  } as const;
  const { t, c, i: I } = map[v];
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium", c)}>
      <I className="h-3.5 w-3.5" /> {t}
    </span>
  );
}

function Panel({ title, icon: I, action, children, className }: { title: string; icon: React.ElementType; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-3xl border border-line bg-surface-strong p-5 shadow-card md:p-6", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <I className="h-5 w-5 text-brand" /> {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ───────────── Buyer ───────────── */

function BuyerDashboard() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <SavedHomes />
      <div className="space-y-6">
        <VisitsPanel />
        <PreferencesPanel />
      </div>
    </div>
  );
}

function SavedHomes({ title = "Saved homes" }: { title?: string }) {
  const { saved } = usePrefs();
  const items = useListings().filter((l) => saved.has(l.id));
  return (
    <Panel title={title} icon={Heart} action={<span className="text-sm text-ink-3">{items.length}</span>}>
      {items.length === 0 ? (
        <Empty text="Tap the heart on any home to save it here." href="/#featured" cta="Browse homes" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((l) => (
            <PropertyCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function useVisits() {
  const [items, setItems] = useState<Visit[] | null>(null);
  const load = useCallback(() => {
    api<{ items: Visit[] }>("/me/visits")
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);
  return { items, reload: load };
}

function VisitsPanel({ visits }: { visits?: Visit[] }) {
  const own = useVisits();
  const items = visits ?? own.items;
  const { session } = usePrefs();
  const showLocal = !sameAsIST(session?.user.preferences.timeZone);
  const cancel = async (id: string) => {
    await api(`/me/visits/${id}/cancel`, { method: "POST" }).catch(() => {});
    own.reload();
  };
  const upcoming = (items ?? []).filter((v) => v.status !== "cancelled");

  return (
    <Panel title="Visits and video tours" icon={CalendarClock}>
      {items === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-ink-3" />
      ) : upcoming.length === 0 ? (
        <Empty text="Book a visit or a live video tour from any home's Visit button." />
      ) : (
        <ul className="space-y-3">
          {upcoming.map((v) => (
            <li key={v.id} className="flex gap-3 rounded-2xl border border-line p-3">
              {v.listing?.image && (
                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                  <Image unoptimized={isUpload(v.listing.image)} src={v.listing.image} alt="" fill sizes="64px" className="object-cover" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
                  {v.mode === "video" ? <Video className="h-3.5 w-3.5" /> : <Footprints className="h-3.5 w-3.5" />}
                  {v.mode === "video" ? "Video tour" : "In person"} ·{" "}
                  <span className={clsx(v.status === "confirmed" ? "text-brand" : "text-gold")}>{v.status === "requested" ? "Awaiting confirmation" : v.status}</span>
                </p>
                <p className="truncate text-sm font-medium">{v.listing?.title}</p>
                <p className="text-[13px] tabular-nums text-ink-2">{v.ist} IST</p>
                {showLocal && <p className="text-xs tabular-nums text-ink-3">{v.local} your time</p>}
              </div>
              {!visits && (
                <button onClick={() => cancel(v.id)} className="self-start text-xs text-ink-3 underline-offset-2 hover:text-danger hover:underline">
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function PreferencesPanel() {
  const { session, updateProfile } = usePrefs();
  const [status, setStatus] = useState<string | null>(null);
  if (!session) return null;
  const p = session.user.preferences;
  const save = async (patch: Parameters<typeof updateProfile>[0]) => {
    setStatus("Saving…");
    try {
      await updateProfile(patch);
      setStatus("Saved");
    } catch (e) {
      setStatus((e as ApiError).message);
    }
    setTimeout(() => setStatus(null), 1800);
  };
  return (
    <Panel title="Preferences" icon={Clock} action={status && <span className="text-xs text-ink-3">{status}</span>}>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[13px] text-ink-2">
          Currency
          <select
            value={p.currency}
            onChange={(e) => save({ currency: e.target.value as Currency })}
            className="mt-1 h-10 w-full rounded-xl border border-line-strong bg-transparent px-2 text-sm text-ink"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code} className="bg-elevated">
                {c.flag} {c.code}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[13px] text-ink-2">
          Time zone
          <select
            value={p.timeZone}
            onChange={(e) => save({ timeZone: e.target.value })}
            className="mt-1 h-10 w-full rounded-xl border border-line-strong bg-transparent px-2 text-sm text-ink"
          >
            {[...new Set([p.timeZone, ...TIME_ZONES])].map((z) => (
              <option key={z} value={z} className="bg-elevated">
                {z.replace(/_/g, " ").replace("Asia/Kolkata", "India (IST)")}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Panel>
  );
}

/* ───────────── NRI ───────────── */

interface NriData {
  advisor: { name: string; title: string; languages: string[]; whatsapp: string };
  visits: Visit[];
  requests: { id: string; service: string; message: string; status: string; createdAt: string }[];
}

const SERVICES = [
  { v: "shortlist", t: "Shortlist homes for me" },
  { v: "legal", t: "Legal / title check" },
  { v: "visit", t: "Plan visits for my trip" },
  { v: "documents", t: "Documents (POA, registration)" },
  { v: "after_sales", t: "After-sales (tenancy, upkeep)" },
  { v: "other", t: "Something else" },
] as const;

function NriDashboard() {
  const { session, saved } = usePrefs();
  const [data, setData] = useState<NriData | null>(null);
  const load = useCallback(() => {
    api<NriData>("/nri/dashboard").then(setData).catch(() => {});
  }, []);
  useEffect(load, [load]);
  const tz = session!.user.preferences.timeZone;
  const shortlist = useListings().filter((l) => saved.has(l.id));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <AdvisorCard advisor={data?.advisor} />
        <ClocksCard tz={tz} />
        <PreferencesPanel />
      </div>

      <Panel title="Shortlist in every currency" icon={Heart} action={<span className="text-sm text-ink-3">{shortlist.length}</span>}>
        {shortlist.length === 0 ? (
          <Empty text="Save homes with the heart, or ask your advisor to shortlist for you." href="/#featured" cta="Browse homes" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-ink-3">
                <tr>
                  <th className="pb-2 font-medium">Home</th>
                  {CURRENCIES.map((c) => (
                    <th key={c.code} className="pb-2 text-right font-medium">
                      {c.flag} {c.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shortlist.map((l) => (
                  <tr key={l.id} className="border-t border-line">
                    <td className="py-3 pr-3">
                      <Link href={`/map?listing=${l.id}`} className="flex items-center gap-3 hover:text-brand">
                        <span className="relative h-11 w-14 shrink-0 overflow-hidden rounded-lg">
                          <Image unoptimized={isUpload(l.images[0])} src={l.images[0]} alt="" fill sizes="56px" className="object-cover" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{l.title}</span>
                          <span className="block text-xs text-ink-3">{l.locality}, {l.city}</span>
                        </span>
                      </Link>
                    </td>
                    {CURRENCIES.map((c) => (
                      <td key={c.code} className="py-3 text-right tabular-nums">
                        {formatPrice(l.price, c.code)}
                        {l.purpose === "rent" && <span className="text-xs text-ink-3">/mo</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-ink-3">Indicative exchange rates.</p>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <VisitsPanel />
        <ConciergePanel requests={data?.requests ?? null} onSent={load} />
      </div>
    </div>
  );
}

function AdvisorCard({ advisor }: { advisor?: NriData["advisor"] }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[#e3b95c]/30 bg-[linear-gradient(135deg,rgba(227,185,92,0.16),transparent_60%)] p-5 md:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Your NRI advisor</p>
      <p className="mt-3 font-display text-xl font-semibold">{advisor?.name ?? "…"}</p>
      <p className="text-sm text-ink-3">{advisor ? `${advisor.title} · ${advisor.languages.join(", ")}` : ""}</p>
      <a
        href={`https://wa.me/${advisor?.whatsapp ?? site.whatsapp}?text=${encodeURIComponent("Hi, I'm an NRI buyer and need help with my shortlist.")}`}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(buttonClass("whatsapp", "md"), "mt-5 w-full")}
      >
        <MessageCircle className="h-4 w-4" /> WhatsApp your advisor
      </a>
    </section>
  );
}

function ClocksCard({ tz }: { tz: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const f = (z: string) => (now ? new Intl.DateTimeFormat("en-GB", { timeZone: z, hour: "2-digit", minute: "2-digit" }).format(now) : "--:--");
  const h = now ? Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(now)) : 12;
  const open = h >= 9 && h < 21;
  return (
    <Panel title="Two clocks" icon={Clock}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-muted p-3">
          <p className="text-xs text-ink-3">Your time</p>
          <p className="font-display text-3xl font-semibold tabular-nums">{f(tz)}</p>
          <p className="truncate text-[11px] text-ink-3">{tz.replace(/_/g, " ")}</p>
        </div>
        <div className="rounded-2xl bg-muted p-3">
          <p className="text-xs text-ink-3">Kerala (IST)</p>
          <p className="font-display text-3xl font-semibold tabular-nums">{f("Asia/Kolkata")}</p>
          <p className={clsx("text-[11px]", open ? "text-brand" : "text-ink-3")}>{open ? "Support open now" : `Support ${site.supportHours}`}</p>
        </div>
      </div>
    </Panel>
  );
}

function ConciergePanel({ requests, onSent }: { requests: NriData["requests"] | null; onSent: () => void }) {
  const [service, setService] = useState<(typeof SERVICES)[number]["v"]>("shortlist");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { saved } = usePrefs();

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/nri/requests", { method: "POST", body: { service, message, listingIds: [...saved].slice(0, 20) } });
      setMessage("");
      onSent();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Concierge requests" icon={Send}>
      <form onSubmit={send} className="space-y-3">
        <select
          value={service}
          onChange={(e) => setService(e.target.value as typeof service)}
          aria-label="Service"
          className="h-10 w-full rounded-xl border border-line-strong bg-transparent px-2 text-sm text-ink"
        >
          {SERVICES.map((s) => (
            <option key={s.v} value={s.v} className="bg-elevated">
              {s.t}
            </option>
          ))}
        </select>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={1000}
          required
          aria-label="Message"
          placeholder="e.g. Looking for a 3BHK near Infopark under ₹1 Cr. I'm home 12 to 26 December."
          className="w-full rounded-xl border border-line-strong bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-brand"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={busy || message.trim().length < 5} className={clsx(buttonClass("primary", "md"), "w-full")}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send to my advisor
        </button>
      </form>
      {requests && requests.length > 0 && (
        <ul className="mt-5 space-y-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-xl border border-line p-3 text-sm">
              <p className="flex items-center justify-between gap-2 text-xs text-ink-3">
                {SERVICES.find((s) => s.v === r.service)?.t}
                <span className={clsx("rounded-full px-2 py-0.5", r.status === "done" ? "bg-brand-soft text-brand" : "bg-gold-soft text-gold")}>{r.status.replace("_", " ")}</span>
              </p>
              <p className="mt-1 text-ink-2">{r.message}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ───────────── Owner / Agent ───────────── */

function PortalDashboard({ user }: { user: User }) {
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-brand/30 bg-brand-soft p-6">
        <div>
          <p className="font-display text-xl font-semibold">{user.role === "agent" ? "Agent & builder portal" : "Owner portal"}</p>
          <p className="mt-1 text-sm text-ink-2">Add and edit listings, answer visit requests and enquiries, upload documents and see how each home performs.</p>
        </div>
        <Link href="/portal" className={buttonClass("primary", "md")}>
          Open the portal
        </Link>
      </section>
      <LeadsPanel path="/leads/mine" />
      <PreferencesPanel />
    </div>
  );
}

interface Lead {
  _id: string;
  name: string;
  phone: string;
  preferredTime?: string;
  timeZone?: string;
  listingIds: string[];
  source: string;
  status: string;
  createdAt: string;
}

function LeadsPanel({ path }: { path: string }) {
  const [items, setItems] = useState<Lead[] | null>(null);
  useEffect(() => {
    api<{ items: Lead[] }>(path).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [path]);
  return (
    <Panel title="Leads" icon={Phone} action={<span className="text-sm text-ink-3">{items?.length ?? ""}</span>}>
      {items === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-ink-3" />
      ) : items.length === 0 ? (
        <Empty text="No call-back requests yet. They arrive from the assistant and listing pages." />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((l) => (
            <li key={l._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">{l.name}</span>
                <span className="block text-xs text-ink-3">
                  <a href={`tel:${l.phone.replace(/[^+\d]/g, "")}`} className="text-brand">{l.phone}</a> · {l.preferredTime ?? "Any time"}
                  {l.timeZone && l.timeZone !== "Asia/Kolkata" ? ` · ${l.timeZone.split("/").pop()?.replace(/_/g, " ")}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs text-ink-3">
                <span className="block">{l.listingIds.length ? `${l.listingIds.length} home${l.listingIds.length > 1 ? "s" : ""}` : "General"}</span>
                <span className="block">{new Date(l.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {l.source}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

interface AiStats {
  byMode: { _id: string; n: number }[];
  latency: { _id: string; avgMs: number; tokens: number; zeroResults: number }[];
  tools: { _id: string; n: number }[];
  errors: { _id: string; error: string; createdAt: string }[];
}

const MODE_LABEL: Record<string, string> = { rule: "Rules (free)", llm: "AI (Gemini)", cache: "Cache", fallback: "Fallback" };

function AssistantStats() {
  const [d, setD] = useState<AiStats | null>(null);
  useEffect(() => {
    api<AiStats>("/admin/ai-stats").then(setD).catch(() => {});
  }, []);
  const total = d?.byMode.reduce((a, m) => a + m.n, 0) ?? 0;
  return (
    <Panel title="Assistant, last 7 days" icon={Sparkles} action={<span className="text-sm text-ink-3">{total} answers</span>}>
      {!d ? (
        <Loader2 className="h-5 w-5 animate-spin text-ink-3" />
      ) : (
        <div className="space-y-4 text-sm">
          <ul className="space-y-2">
            {["rule", "llm", "cache", "fallback"].map((m) => {
              const n = d.byMode.find((x) => x._id === m)?.n ?? 0;
              const lat = d.latency.find((x) => x._id === m);
              return (
                <li key={m}>
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-2">{MODE_LABEL[m]}</span>
                    <span className="tabular-nums text-ink-3">
                      {n}
                      {lat ? ` · ${Math.round(lat.avgMs)} ms avg` : ""}
                      {lat?.tokens ? ` · ${lat.tokens.toLocaleString("en-IN")} tokens` : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div className={clsx("h-full rounded-full", m === "llm" ? "bg-gold" : m === "fallback" ? "bg-danger" : "bg-brand")} style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {d.tools.length > 0 && (
            <p className="text-xs text-ink-3">
              Agent tools used: {d.tools.map((t) => `${t._id} ×${t.n}`).join(", ")}
            </p>
          )}
          {d.errors.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-ink-2">Recent provider errors</p>
              <ul className="space-y-1">
                {d.errors.slice(0, 4).map((e) => (
                  <li key={e._id} className="truncate font-mono text-[11px] text-danger" title={e.error}>
                    {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

/* ───────────── Admin ───────────── */

function AdminDashboard() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [audit, setAudit] = useState<{ _id: string; action: string; actorRole: string; target?: string; createdAt: string }[] | null>(null);
  useEffect(() => {
    api<{ items: User[] }>("/admin/users").then((r) => setUsers(r.items)).catch(() => setUsers([]));
    api<{ items: typeof audit }>("/admin/audit").then((r) => setAudit(r.items)).catch(() => setAudit([]));
  }, []);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Users" icon={Users} action={<span className="text-sm text-ink-3">{users?.length ?? ""}</span>}>
        <ul className="divide-y divide-line">
          {(users ?? []).map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{u.name}</span>
                <span className="block truncate text-xs text-ink-3">{u.email}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs">
                <VerificationBadge v={u.verification} />
                <span className="rounded-full bg-muted px-2 py-0.5 text-ink-2">{ROLE_LABEL[u.role]}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Audit trail" icon={ShieldCheck}>
        <ul className="max-h-[480px] divide-y divide-line overflow-y-auto">
          {(audit ?? []).map((a) => (
            <li key={a._id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <span className="font-mono text-xs text-ink">{a.action}</span>
              <span className="text-xs text-ink-3">
                {a.actorRole} · {new Date(a.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <AssistantStats />
      <LeadsPanel path="/admin/leads" />
      <p className="text-xs text-ink-3 lg:col-span-2">Approvals, verification and moderation arrive with the full admin console.</p>
    </div>
  );
}

function Empty({ text, href, cta }: { text: string; href?: string; cta?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong p-6 text-center">
      <p className="text-sm text-ink-3">{text}</p>
      {href && cta && (
        <Link href={href} className={clsx(buttonClass("outline", "sm"), "mt-3")}>
          {cta}
        </Link>
      )}
    </div>
  );
}
