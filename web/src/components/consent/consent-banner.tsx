"use client";

import clsx from "clsx";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type ConsentChoices, usePrefs } from "../providers";
import { buttonClass } from "../ui/primitives";

const OPTIONS: { key: keyof ConsentChoices; title: string; body: string }[] = [
  {
    key: "personalisation",
    title: "Personalised suggestions",
    body: "Use your device type, time zone and what you view here to suggest homes and currency.",
  },
  {
    key: "location",
    title: "Approximate location",
    body: "Use your city (from your connection) to show nearby homes first. Exact location is only used if you also allow it in your browser.",
  },
  {
    key: "analytics",
    title: "Anonymous usage stats",
    body: "Count page views and searches to improve the site. Never sold or shared for ads.",
  },
];

/**
 * DPDP Act notice and consent. Nothing optional runs until the visitor chooses.
 * The choice is stored in this browser and recorded (anonymously) by the API.
 */
export function ConsentBanner() {
  const { consent, setConsent } = usePrefs();
  const [mounted, setMounted] = useState(false);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState<ConsentChoices>({ personalisation: true, location: true, analytics: false });
  useEffect(() => setMounted(true), []);

  if (!mounted || consent) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Privacy choices"
      className="glass-bar rise fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-[60] max-w-md rounded-2xl p-4 shadow-float md:bottom-5 md:left-5 md:right-auto"
    >
      <div className="flex gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Your privacy, your choice</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
            We can use your approximate location and device details to recommend homes near you. Nothing optional is
            used until you choose.{" "}
            <Link href="/privacy" className="text-brand underline-offset-2 hover:underline">
              Privacy notice
            </Link>
          </p>
        </div>
      </div>

      {custom && (
        <ul className="mt-3 space-y-2">
          {OPTIONS.map((o) => (
            <li key={o.key}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 hover:border-line-strong">
                <input
                  type="checkbox"
                  checked={draft[o.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [o.key]: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                />
                <span>
                  <span className="block text-[13px] font-medium">{o.title}</span>
                  <span className="block text-xs text-ink-3">{o.body}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className={clsx("mt-4 grid gap-2", custom ? "grid-cols-2" : "grid-cols-3")}>
        {custom ? (
          <>
            <button onClick={() => setCustom(false)} className={buttonClass("ghost", "sm")}>
              Back
            </button>
            <button onClick={() => setConsent(draft)} className={buttonClass("primary", "sm")}>
              Save choices
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setCustom(true)} className={buttonClass("ghost", "sm")}>
              Customise
            </button>
            <button
              onClick={() => setConsent({ personalisation: false, location: false, analytics: false })}
              className={buttonClass("outline", "sm")}
            >
              Essential only
            </button>
            <button
              onClick={() => setConsent({ personalisation: true, location: true, analytics: true })}
              className={buttonClass("primary", "sm")}
            >
              Allow all
            </button>
          </>
        )}
      </div>
    </div>
  );
}
