"use client";

import clsx from "clsx";
import { CalendarCheck, Footprints, Loader2, Video, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Listing } from "@/data/listings";
import { api, ApiError, type Visit } from "@/lib/api";
import { sameAsIST } from "@/lib/time";
import { usePrefs } from "../providers";
import { buttonClass } from "../ui/primitives";

const IST = "Asia/Kolkata";
const IST_OFFSET_MIN = 330;
const HOURS = { from: 9, to: 20 }; // matches the API rule

/** Calendar date (y, m, d) of "now + n days" in IST. */
function istDate(daysAhead: number) {
  const now = new Date(Date.now() + IST_OFFSET_MIN * 60_000 + daysAhead * 86_400_000);
  return { y: now.getUTCFullYear(), m: now.getUTCMonth(), d: now.getUTCDate() };
}
function istToUtc(y: number, m: number, d: number, hh: number, mm: number) {
  return new Date(Date.UTC(y, m, d, hh, mm) - IST_OFFSET_MIN * 60_000);
}
const fmt = (date: Date, tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...o }).format(date);

export function VisitDialog({ listing, onClose }: { listing: Pick<Listing, "id" | "title" | "locality">; onClose: () => void }) {
  const { session, can, timeZone } = usePrefs();
  const pathname = usePathname();
  // Prefer the account's time zone; fall back to the browser's.
  const pref = session?.user.preferences.timeZone;
  const tz = pref && !sameAsIST(pref) ? pref : (timeZone ?? IST);
  const showLocal = !sameAsIST(tz);
  const [mode, setMode] = useState<"in_person" | "video">(session?.user.role === "nri" ? "video" : "in_person");
  const [dayIdx, setDayIdx] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Visit | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Next 10 days with at least one slot 2+ hours away.
  const days = useMemo(() => {
    const out: { label: string; sub: string; slots: Date[] }[] = [];
    const minTime = Date.now() + 2 * 3_600_000;
    for (let i = 0; out.length < 10 && i < 14; i++) {
      const { y, m, d } = istDate(i);
      const slots: Date[] = [];
      for (let h = HOURS.from; h < HOURS.to; h++)
        for (const mm of [0, 30]) {
          const t = istToUtc(y, m, d, h, mm);
          if (t.getTime() >= minTime) slots.push(t);
        }
      if (!slots.length) continue;
      const ref = istToUtc(y, m, d, 12, 0);
      out.push({ label: fmt(ref, IST, { weekday: "short" }), sub: fmt(ref, IST, { day: "numeric", month: "short" }), slots });
    }
    return out;
  }, []);

  const submit = async () => {
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      const v = await api<Visit>("/me/visits", {
        method: "POST",
        body: { listingId: listing.id, mode, slot, timeZone: tz, note: note.trim() || undefined },
      });
      setDone(v);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  // Portal to <body>: cards use CSS transforms, which would otherwise trap a fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="visit-title"
        onClick={(e) => e.stopPropagation()}
        className="rise max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-elevated p-5 shadow-float outline-none md:rounded-3xl md:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="visit-title" className="font-display text-xl font-semibold">
              {done ? "Visit requested" : "Book a visit"}
            </h2>
            <p className="text-sm text-ink-3">
              {listing.title} · {listing.locality}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!session ? (
          <Gate
            text="Sign in to book a visit or a live video tour. Your saved homes come with you."
            href={`/signin?next=${encodeURIComponent(pathname)}`}
            cta="Sign in to book"
          />
        ) : !can("visits:request") ? (
          <Gate text="Visits are booked from buyer and NRI accounts. Sign in with one of those to book." href="/account" cta="Go to my account" />
        ) : done ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl bg-brand-soft p-4">
              <CalendarCheck className="h-8 w-8 shrink-0 text-brand" />
              <div className="text-sm">
                <p className="font-semibold">{done.mode === "video" ? "Live video tour" : "In-person visit"}</p>
                <p className="text-ink-2">{done.ist} IST</p>
                {showLocal && <p className="text-ink-3">{done.local} your time</p>}
              </div>
            </div>
            <p className="text-sm text-ink-3">
              The owner or agent will confirm shortly. You&apos;ll see the status in your account.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onClose} className={buttonClass("outline", "md")}>
                Done
              </button>
              <Link href="/account" className={buttonClass("primary", "md")}>
                My visits
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { v: "in_person", t: "In person", s: "Visit the property", i: Footprints },
                  { v: "video", t: "Live video tour", s: "From anywhere", i: Video },
                ] as const
              ).map(({ v, t, s, i: I }) => (
                <button
                  key={v}
                  onClick={() => setMode(v)}
                  aria-pressed={mode === v}
                  className={clsx("rounded-2xl border p-3 text-left transition", mode === v ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong")}
                >
                  <I className={clsx("h-5 w-5", mode === v ? "text-brand" : "text-ink-3")} />
                  <p className="mt-1.5 text-sm font-semibold">{t}</p>
                  <p className="text-xs text-ink-3">{s}</p>
                </button>
              ))}
            </div>

            <div>
              <p className="mb-2 text-[13px] font-medium text-ink-2">Day</p>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {days.map((d, i) => (
                  <button
                    key={d.sub}
                    onClick={() => {
                      setDayIdx(i);
                      setSlot(null);
                    }}
                    aria-pressed={dayIdx === i}
                    className={clsx(
                      "flex min-w-[64px] shrink-0 flex-col items-center rounded-xl border px-2 py-2 transition",
                      dayIdx === i ? "border-brand bg-brand text-brand-ink" : "border-line hover:border-line-strong",
                    )}
                  >
                    <span className="text-xs font-medium">{d.label}</span>
                    <span className="text-sm font-semibold">{d.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 flex items-baseline justify-between text-[13px] font-medium text-ink-2">
                Time (Kerala, IST)
                {showLocal && <span className="text-[11px] font-normal text-ink-3">Your time ({tz.split("/").pop()?.replace(/_/g, " ")}) below each</span>}
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {days[dayIdx]?.slots.map((t) => {
                  const iso = t.toISOString();
                  return (
                    <button
                      key={iso}
                      onClick={() => setSlot(iso)}
                      aria-pressed={slot === iso}
                      className={clsx(
                        "rounded-xl border px-2 py-2 text-center transition",
                        slot === iso ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong",
                      )}
                    >
                      <span className="block text-sm font-semibold tabular-nums">{fmt(t, IST, { hour: "2-digit", minute: "2-digit" })}</span>
                      {showLocal && <span className="block text-[11px] tabular-nums text-ink-3">{fmt(t, tz, { hour: "2-digit", minute: "2-digit" })}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Note for the owner (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder={mode === "video" ? "e.g. Please show the kitchen and the view from the balcony" : "e.g. Coming with family, need parking"}
                className="w-full rounded-xl border border-line-strong bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-brand"
              />
            </label>

            {error && (
              <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <button onClick={submit} disabled={!slot || busy} className={clsx(buttonClass("primary", "lg"), "w-full")}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {slot
                ? `Request ${mode === "video" ? "video tour" : "visit"} · ${fmt(new Date(slot), IST, { weekday: "short", hour: "2-digit", minute: "2-digit" })} IST`
                : "Pick a time"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Gate({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">{text}</p>
      <Link href={href} className={clsx(buttonClass("primary", "lg"), "w-full")}>
        {cta}
      </Link>
    </div>
  );
}
