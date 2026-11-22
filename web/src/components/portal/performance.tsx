"use client";

import { ArrowLeft, Eye, Footprints, Heart, Phone } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { type PortalListing, Spinner, StatusBadge, usePortalGuard } from "./shared";

interface Stats {
  views: { day: string; n: number }[];
  saves: number;
  visits: { requested: number; confirmed: number; completed: number };
  interested: { name: string; via: string; at: string; status: string }[];
}

export function Performance({ id }: { id: string }) {
  const { ready } = usePortalGuard();
  const [listing, setListing] = useState<PortalListing | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    if (!ready) return;
    api<PortalListing>(`/portal/listings/${id}`).then(setListing).catch(() => {});
    api<Stats>(`/portal/listings/${id}/stats`).then(setStats).catch(() => {});
  }, [id, ready]);
  if (!ready || !listing || !stats) return <Spinner />;

  const total = stats.views.reduce((a, d) => a + d.n, 0);
  const max = Math.max(1, ...stats.views.map((d) => d.n));
  const visits = stats.visits.requested + stats.visits.confirmed + stats.visits.completed;
  const leads = stats.interested.filter((i) => i.via === "Call-back").length;
  const conversion = total ? Math.round(((visits + leads) / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-6">
      <Link href="/portal" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Portal
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{listing.title}</h1>
        <StatusBadge status={listing.status} />
      </div>

      <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { i: Eye, k: "Views, 14 days", v: total },
          { i: Heart, k: "Saved by buyers", v: stats.saves },
          { i: Footprints, k: "Visits and tours", v: visits },
          { i: Phone, k: "Call-back requests", v: leads },
        ].map(({ i: I, k, v }) => (
          <li key={k} className="rounded-2xl border border-line bg-surface-strong p-4">
            <I className="h-5 w-5 text-brand" />
            <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{v}</p>
            <p className="text-xs text-ink-3">{k}</p>
          </li>
        ))}
      </ul>

      <section className="mt-6 rounded-3xl border border-line bg-surface-strong p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold">Daily views</h2>
          <p className="text-xs text-ink-3">{conversion}% of viewers booked a visit or asked for a call</p>
        </div>
        <div className="mt-4 flex h-44 items-end gap-1.5" role="img" aria-label={`Daily views over 14 days, ${total} in total`}>
          {stats.views.map((d, i) => (
            <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${d.day}: ${d.n} views`}>
              <span className="text-[10px] tabular-nums text-ink-3">{d.n || ""}</span>
              <div className={i === stats.views.length - 1 ? "w-full rounded-md bg-brand" : "w-full rounded-md bg-brand/35"} style={{ height: `${Math.max(2, (d.n / max) * 100)}%` }} />
              <span className="text-[10px] text-ink-3">{new Date(d.day).toLocaleDateString("en-GB", { day: "numeric" })}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-surface-strong p-5">
        <h2 className="font-display text-lg font-semibold">Interested buyers</h2>
        <p className="text-xs text-ink-3">People who booked a visit or asked for a call. Buyers who only saved the home stay anonymous.</p>
        {stats.interested.length === 0 ? (
          <p className="mt-4 text-sm text-ink-3">No one yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {stats.interested.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-ink-3">
                  {p.via} · {p.status} · {new Date(p.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/portal?tab=visits" className="mt-4 inline-block text-sm text-brand hover:underline">
          Manage visits and enquiries
        </Link>
      </section>
    </div>
  );
}
