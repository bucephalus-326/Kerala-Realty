"use client";

import clsx from "clsx";
import { ArrowRight, ArrowUp, Heart, LayoutGrid, Loader2, MapPin, Phone, RotateCcw, Sparkles, X, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { applySearchOnPage } from "@/lib/search";
import { usePrefs } from "../providers";
import { buttonClass } from "../ui/primitives";
import { type AssistantReply, type CardListing, type CompareRow, useAssistant } from "./use-assistant";

const HIDDEN_ON = ["/map", "/signin"];
const NUDGE_KEY = "assistant.nudged";

export function Assistant() {
  const pathname = usePathname();
  const router = useRouter();
  const { messages, send, busy, starters, reset } = useAssistant();
  const { consent } = usePrefs();
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const onHome = pathname === "/";

  // Proactive suggestion once per session, a few seconds after landing on the home page.
  useEffect(() => {
    if (!onHome || !starters || !consent) return; // wait until the privacy choice is made
    try {
      if (sessionStorage.getItem(NUDGE_KEY)) return;
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => setNudge(true), 3500);
    return () => clearTimeout(t);
  }, [onHome, starters, consent]);

  const dismissNudge = () => {
    setNudge(false);
    try {
      sessionStorage.setItem(NUDGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    if (window.innerWidth >= 768) inputRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /** Send a prompt; on the home page, searches also update the page results. */
  const ask = async (text: string, opts: { showOnPage?: boolean } = {}) => {
    setOpen(true);
    dismissNudge();
    const res = await send(text);
    const isDesktop = window.innerWidth >= 768;
    if (res?.filters && res.total > 0 && onHome && (isDesktop || opts.showOnPage)) applySearchOnPage(res.filters, res.ids);
  };

  const showOnPage = (r: AssistantReply) => {
    if (!r.filters) return;
    if (!onHome) {
      router.push("/#featured");
      setTimeout(() => applySearchOnPage(r.filters!, r.ids), 400);
    } else applySearchOnPage(r.filters, r.ids);
    if (window.innerWidth < 768) setOpen(false);
  };

  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <>
      {/* Proactive suggestion */}
      {nudge && !open && starters && (
        <div className="rise fixed bottom-[calc(env(safe-area-inset-bottom)+140px)] right-4 z-[55] w-[300px] max-w-[calc(100vw-32px)] md:bottom-24 md:right-6">
          <div className="glass-bar rounded-2xl p-4 shadow-float">
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand">
                <Sparkles className="h-3.5 w-3.5" /> Suggested for you
              </p>
              <button onClick={dismissNudge} aria-label="Dismiss suggestion" className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-full text-ink-3 hover:bg-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1.5 font-display text-[17px] font-semibold leading-snug">{starters.headline}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => ask(starters.prompts[0].prompt, { showOnPage: true })} className={clsx(buttonClass("primary", "sm"), "flex-1")}>
                Show me
              </button>
              <button onClick={() => { setOpen(true); dismissNudge(); }} className={buttonClass("outline", "sm")}>
                Something else
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Launcher */}
      {!open && (
        <button
          onClick={() => {
            setOpen(true);
            dismissNudge();
          }}
          className={clsx(
            "fixed bottom-[calc(env(safe-area-inset-bottom)+76px)] right-4 z-[55] flex h-14 items-center gap-2 rounded-full bg-brand pl-4 pr-5 font-medium text-brand-ink shadow-[0_12px_40px_-8px_var(--glow)] transition hover:scale-[1.03] max-md:w-14 max-md:justify-center max-md:p-0 md:bottom-6 md:right-6",
            !consent && "max-md:hidden", // the consent banner owns the bottom of small screens until answered
          )}
          aria-label="Open property assistant"
        >
          <Sparkles className="h-5 w-5" />
          <span className="max-md:hidden">Ask the assistant</span>
        </button>
      )}

      {/* Panel: right side panel on tablet/desktop, bottom sheet on mobile */}
      {open && (
        <>
          <div className="fixed inset-0 z-[64] bg-black/40 backdrop-blur-[2px] md:hidden" onClick={() => setOpen(false)} aria-hidden />
          <section
            role="dialog"
            aria-label="Property assistant"
            className={clsx(
              "glass-bar fixed z-[65] flex flex-col shadow-float",
              "inset-x-0 bottom-0 h-[86dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]",
              "md:inset-x-auto md:bottom-4 md:right-4 md:top-[84px] md:h-auto md:w-[400px] md:rounded-3xl md:pb-0 lg:w-[420px]",
            )}
          >
            <div className="flex justify-center pt-2 md:hidden">
              <span className="h-1 w-10 rounded-full bg-line-strong" />
            </div>
            <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-brand-ink">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-display text-[15px] font-semibold leading-tight">Property assistant</p>
                  <p className="text-[11px] text-ink-3">Searches verified listings only</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button onClick={reset} aria-label="Start over" className="grid h-9 w-9 place-items-center rounded-lg text-ink-3 hover:bg-muted hover:text-ink">
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => setOpen(false)} aria-label="Close assistant" className="grid h-9 w-9 place-items-center rounded-lg text-ink-3 hover:bg-muted hover:text-ink">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <Bubble>{starters?.greeting ?? "Hi! Tell me a place, budget and type, and I'll find verified homes."}</Bubble>
                  <Chips chips={starters?.prompts ?? []} onPick={(p) => ask(p)} />
                </div>
              )}
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-[14px] text-brand-ink">{m.text}</p>
                  </div>
                ) : (
                  <AssistantMessage key={m.id} r={m.data} onPick={(p) => ask(p)} onShowOnPage={() => showOnPage(m.data)} onHome={onHome} />
                ),
              )}
              {busy && (
                <div className="flex items-center gap-2 text-sm text-ink-3">
                  <Loader2 className="h-4 w-4 animate-spin" /> Looking through verified listings…
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (busy || !input.trim()) return; // keep the text until the current answer arrives
                const t = input;
                setInput("");
                ask(t);
              }}
              className="border-t border-line p-3"
            >
              <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-bg/60 p-1.5 focus-within:border-brand">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={1}
                  maxLength={500}
                  placeholder="Try “2BHK in Kakkanad, 50 lakh”"
                  aria-label="Message the assistant"
                  className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-ink outline-none placeholder:text-ink-3"
                />
                <button type="submit" disabled={!input.trim() || busy} aria-label="Send" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink transition disabled:opacity-40">
                  <ArrowUp className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-1.5 px-1 text-[10.5px] text-ink-3">English or Manglish. Answers use our listings and OpenStreetMap; prices are demo data.</p>
            </form>
          </section>
        </>
      )}
    </>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[92%] whitespace-pre-line rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-[14px] leading-relaxed text-ink">{children}</p>;
}

function Chips({ chips, onPick }: { chips: { label: string; prompt: string }[]; onPick: (p: string) => void }) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <button
          key={c.label}
          onClick={() => onPick(c.prompt)}
          className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-left text-[13px] text-ink-2 transition hover:border-brand hover:text-ink"
        >
          {c.label} <ArrowRight className="h-3 w-3 opacity-50" />
        </button>
      ))}
    </div>
  );
}

function AssistantMessage({ r, onPick, onShowOnPage, onHome }: { r: AssistantReply; onPick: (p: string) => void; onShowOnPage: () => void; onHome: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Bubble>{r.reply}</Bubble>
      </div>
      {r.limited && (
        <p className="flex items-center gap-1.5 text-[11.5px] text-gold">
          <Zap className="h-3.5 w-3.5" /> Smart answers are resting for today; quick search still works.
        </p>
      )}
      {r.listings.length > 0 && (
        <ul className="space-y-2">
          {r.listings.map((l) => (
            <li key={l.id}>
              <MiniCard l={l} />
            </li>
          ))}
        </ul>
      )}
      {r.filters && r.total > 0 && (
        <button onClick={onShowOnPage} className={clsx(buttonClass("outline", "sm"), "w-full")}>
          <LayoutGrid className="h-4 w-4" /> {onHome ? `Show all ${r.total} on the page` : `See all ${r.total} homes`}
        </button>
      )}
      {r.compare && <CompareTable rows={r.compare} />}
      {r.leadForm && <LeadForm listingIds={r.listings.map((l) => l.id)} filters={r.filters} />}
      <Chips chips={r.chips} onPick={onPick} />
    </div>
  );
}

function MiniCard({ l }: { l: CardListing }) {
  const { currency, saved, toggleSaved } = usePrefs();
  const isSaved = saved.has(l.id);
  return (
    <div className="flex gap-3 rounded-2xl border border-line bg-surface-strong p-2">
      <Link href={`/map?listing=${l.id}`} className="relative h-[72px] w-[84px] shrink-0 overflow-hidden rounded-xl" aria-label={`View ${l.title} on the map`}>
        {l.image && <Image src={l.image} alt="" fill sizes="84px" className="object-cover" />}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-[15px] font-semibold">
            {formatPrice(l.price, currency)}
            {l.purpose === "rent" && <span className="text-xs font-normal text-ink-3"> /mo</span>}
          </p>
          <button onClick={() => toggleSaved(l.id)} aria-label={isSaved ? "Remove from saved" : "Save property"} aria-pressed={isSaved} className="-mr-0.5 -mt-0.5 grid h-7 w-7 place-items-center rounded-full hover:bg-muted">
            <Heart className={clsx("h-4 w-4", isSaved ? "fill-[#ff5a6e] text-[#ff5a6e]" : "text-ink-3")} />
          </button>
        </div>
        <p className="truncate text-[13px] text-ink">{l.title}</p>
        <p className="flex items-center gap-1 truncate text-[11.5px] text-ink-3">
          <MapPin className="h-3 w-3 shrink-0" /> {l.locality}
          {l.highlight && <span className="truncate text-water"> · {l.highlight}</span>}
        </p>
        {l.reasons.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-1">
            {l.reasons.map((x) => (
              <span key={x} className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10.5px] text-brand">
                {x}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

function CompareTable({ rows }: { rows: CompareRow[] }) {
  const { currency } = usePrefs();
  const near = (n: { name: string; km: number; status?: string } | null) => (n ? `${n.name}${n.status ? " (u/c)" : ""} · ${n.km} km` : "—");
  const metrics: [string, (r: CompareRow) => string][] = [
    ["Price / sq.ft", (r) => formatPrice(r.psf, currency, { compact: false })],
    ["Yearly change", (r) => `+${r.yoy}%`],
    ["Metro", (r) => near(r.metro)],
    ["IT park", (r) => near(r.itPark)],
    ["Schools ≤2 km", (r) => String(r.schools2km)],
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-line text-[12.5px]">
      <table className="w-full">
        <thead className="bg-muted">
          <tr>
            <th className="px-2.5 py-1.5 text-left font-medium text-ink-3" scope="col">
              <span className="sr-only">Metric</span>
            </th>
            {rows.map((r) => (
              <th key={r.name} className="px-2.5 py-1.5 text-left font-semibold" scope="col">
                {r.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map(([k, f]) => (
            <tr key={k} className="border-t border-line">
              <th className="px-2.5 py-1.5 text-left font-normal text-ink-3" scope="row">
                {k}
              </th>
              {rows.map((r) => (
                <td key={r.name} className="px-2.5 py-1.5 tabular-nums">
                  {f(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadForm({ listingIds, filters }: { listingIds: string[]; filters?: unknown }) {
  const { session, timeZone } = usePrefs();
  const [name, setName] = useState(session?.user.name ?? "");
  const [phone, setPhone] = useState(session?.user.phone ?? "");
  const [when, setWhen] = useState("Evening (5–8 PM IST)");
  const [agree, setAgree] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done")
    return (
      <p className="flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2.5 text-[13px] text-brand">
        <Phone className="h-4 w-4" /> Thanks! An advisor will call you {when.toLowerCase()}.
      </p>
    );

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        setError(null);
        try {
          await api("/leads", {
            method: "POST",
            body: { name, phone, preferredTime: when, timeZone, listingIds, filters, source: "assistant", consent: agree || undefined },
          });
          setState("done");
        } catch (err) {
          const e = err as ApiError;
          setError(e.fields ? Object.values(e.fields)[0]?.[0] ?? e.message : e.message);
          setState("idle");
        }
      }}
      className="space-y-2 rounded-2xl border border-line bg-surface-strong p-3"
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" autoComplete="name" className="h-10 w-full rounded-xl border border-line-strong bg-transparent px-3 text-sm text-ink outline-none focus:border-brand" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone with country code, e.g. +971 50…" aria-label="Phone" autoComplete="tel" inputMode="tel" className="h-10 w-full rounded-xl border border-line-strong bg-transparent px-3 text-sm text-ink outline-none focus:border-brand" />
      <select value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Best time to call" className="h-10 w-full rounded-xl border border-line-strong bg-transparent px-2 text-sm text-ink">
        {["Morning (9–12 IST)", "Afternoon (12–5 PM IST)", "Evening (5–8 PM IST)", "Weekend"].map((t) => (
          <option key={t} className="bg-elevated">
            {t}
          </option>
        ))}
      </select>
      <label className="flex items-start gap-2 text-[12px] text-ink-2">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
        I agree to be called about these homes. My number is used only for this.
      </label>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <button disabled={state === "busy" || !name || !phone || !agree} className={clsx(buttonClass("primary", "sm"), "w-full")}>
        {state === "busy" && <Loader2 className="h-4 w-4 animate-spin" />} Request a call back
      </button>
    </form>
  );
}
