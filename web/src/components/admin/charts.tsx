"use client";

import clsx from "clsx";
import { useState } from "react";

/**
 * Small single-series charts for the admin console.
 * One hue per chart (brand), so identity never depends on telling colours apart;
 * values are labelled and every mark has a hover tooltip and an accessible label.
 */

/** Daily bars with a hover tooltip. Used as small multiples (one metric per chart, own axis). */
export function DailyBars({ title, data, unit }: { title: string; data: { day: string; n: number }[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.n));
  const total = data.reduce((a, d) => a + d.n, 0);
  const last7 = data.slice(-7).reduce((a, d) => a + d.n, 0);
  const prev7 = data.slice(-14, -7).reduce((a, d) => a + d.n, 0);
  const shown = hover ?? data.length - 1;
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <figure className="rounded-2xl border border-line bg-surface-strong p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink-2">{title}</span>
        <span className="text-xs text-ink-3">
          {prev7 > 0 ? `${last7 >= prev7 ? "+" : ""}${Math.round(((last7 - prev7) / prev7) * 100)}% vs prior week` : "last 7 days"}
        </span>
      </figcaption>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{total.toLocaleString("en-IN")}</p>
      <div className="relative mt-3">
        <div
          className="flex h-20 items-end gap-[2px]"
          role="img"
          aria-label={`${title}: ${total} ${unit} over ${data.length} days, peak ${max} on one day`}
          onMouseLeave={() => setHover(null)}
        >
          {data.map((d, i) => (
            <button
              key={d.day}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              aria-label={`${fmt(d.day)}: ${d.n} ${unit}`}
              className="group relative flex h-full flex-1 items-end"
            >
              <span
                className={clsx("block w-full rounded-t-[4px] transition-colors", i === shown ? "bg-brand" : "bg-brand/40 group-hover:bg-brand/70")}
                style={{ height: `${d.n ? Math.max(4, (d.n / max) * 100) : 1.5}%` }}
              />
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10.5px] text-ink-3">
          <span>{fmt(data[0].day)}</span>
          <span className="font-medium text-ink-2">
            {fmt(data[shown].day)}: {data[shown].n} {unit}
          </span>
          <span>{fmt(data.at(-1)!.day)}</span>
        </div>
      </div>
    </figure>
  );
}

/** Labelled horizontal bars for a breakdown (magnitude by category). */
export function BarList({ rows, valueLabel }: { rows: { label: string; value: number; hint?: string }[]; valueLabel?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-ink-3">No data yet.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.value}`}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-ink-2">
              {r.label}
              {r.hint && <span className="text-ink-3"> · {r.hint}</span>}
            </span>
            <span className="shrink-0 font-medium tabular-nums text-ink">{valueLabel ? valueLabel(r.value) : r.value.toLocaleString("en-IN")}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Headline number tile; optional emphasis when something needs attention. */
export function Stat({ label, value, icon: Icon, attention, onClick }: { label: string; value: number | string; icon: React.ElementType; attention?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        "flex items-center gap-3 rounded-2xl border bg-surface-strong p-4 text-left transition",
        attention ? "border-gold/50" : "border-line",
        onClick && "hover:border-brand",
      )}
    >
      <span className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", attention ? "bg-gold-soft text-gold" : "bg-brand-soft text-brand")}>
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-display text-2xl font-semibold tabular-nums leading-tight">{value}</span>
        <span className="block text-xs text-ink-3">{label}</span>
      </span>
    </Tag>
  );
}
