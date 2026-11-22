"use client";

import clsx from "clsx";
import { Flag, Loader2 } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { buttonClass } from "../ui/primitives";

const REASONS = [
  { v: "already_sold", t: "Already sold or rented" },
  { v: "wrong_price", t: "Price is wrong" },
  { v: "wrong_location", t: "Location is wrong" },
  { v: "fake", t: "Looks fake or doesn't exist" },
  { v: "duplicate", t: "Listed twice" },
  { v: "scam", t: "Asked me for money upfront" },
  { v: "other", t: "Something else" },
];

/** Lets any visitor flag a suspicious or outdated listing for the admin team. */
export function ReportListing({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0].v);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") return <p className="text-xs text-ink-3">Thanks. Our team will check this listing.</p>;
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-danger">
        <Flag className="h-3.5 w-3.5" /> Report this listing
      </button>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        setError(null);
        try {
          await api(`/listings/${listingId}/report`, { method: "POST", body: { reason, details: details.trim() || undefined } });
          setState("done");
        } catch (err) {
          setError((err as ApiError).message);
          setState("idle");
        }
      }}
      className="space-y-2 rounded-2xl border border-line p-3"
    >
      <p className="text-sm font-medium">What&apos;s wrong with this listing?</p>
      <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" className="h-9 w-full rounded-xl border border-line-strong bg-transparent px-2 text-sm text-ink">
        {REASONS.map((r) => (
          <option key={r.v} value={r.v} className="bg-elevated">
            {r.t}
          </option>
        ))}
      </select>
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={2} placeholder="Details (optional)" aria-label="Details" className="w-full rounded-xl border border-line-strong bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-brand" />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button disabled={state === "busy"} className={clsx(buttonClass("primary", "sm"), "flex-1")}>
          {state === "busy" && <Loader2 className="h-4 w-4 animate-spin" />} Send report
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
