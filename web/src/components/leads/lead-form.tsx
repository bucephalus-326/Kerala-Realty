"use client";

import clsx from "clsx";
import { Loader2, Phone } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { usePrefs } from "../providers";
import { buttonClass } from "../ui/primitives";

/** Call-back request with explicit, purpose-specific consent (DPDP). */
export function LeadForm({ listingIds, filters, source = "assistant" }: { listingIds: string[]; filters?: unknown; source?: "assistant" | "listing" | "nri" }) {
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
            body: { name, phone, preferredTime: when, timeZone, listingIds, filters, source, consent: agree || undefined },
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
