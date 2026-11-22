import clsx from "clsx";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { site } from "@/config/site";

export function Logo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <Link href="/" className={clsx("group flex items-center gap-2.5", className)} aria-label={`${site.name} home`}>
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden>
        <defs>
          <linearGradient id="lg-roof" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3ee58e" />
            <stop offset="1" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>
        {/* Kerala-style sloped roof with flared eaves */}
        <path d="M3 19.5 20 6l17 13.5" fill="none" stroke="url(#lg-roof)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 17.5 20 9.5l12 8" fill="none" stroke="url(#lg-roof)" strokeWidth="1.4" strokeLinecap="round" opacity=".55" />
        <path d="M9.5 20v13.5h21V20" fill="none" stroke="url(#lg-roof)" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="m15.5 26.2 3.2 3.2 6.2-6.6" fill="none" stroke="url(#lg-roof)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="leading-none">
        <span className={clsx("block font-display text-[19px] font-semibold tracking-tight", onDark ? "text-white" : "text-ink")}>
          {site.name}
        </span>
        <span className={clsx("mt-1 block whitespace-nowrap text-[9.5px] font-medium uppercase tracking-[0.28em]", onDark ? "text-white/60" : "text-ink-3")}>
          {site.tagline}
        </span>
      </span>
    </Link>
  );
}

type Variant = "primary" | "ghost" | "outline" | "whatsapp" | "gold";

export function buttonClass(variant: Variant = "primary", size: "sm" | "md" | "lg" = "md") {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 active:scale-[0.98]",
    size === "sm" && "h-9 px-3 text-[13px]",
    size === "md" && "h-11 px-4 text-sm",
    size === "lg" && "h-13 px-6 text-[15px]",
    variant === "primary" && "bg-brand text-brand-ink hover:bg-brand-strong shadow-[0_8px_24px_-8px_var(--glow)]",
    variant === "ghost" && "text-ink-2 hover:text-ink hover:bg-muted",
    variant === "outline" && "border border-line-strong text-ink hover:border-brand hover:text-brand",
    variant === "whatsapp" && "bg-[#1fae5b] text-white hover:bg-[#199a4f]",
    variant === "gold" && "bg-gold text-[#1a1203] hover:brightness-110",
  );
}

export function ReraBadge({ number, compact = false }: { number?: string; compact?: boolean }) {
  return (
    <span
      title={number ? `K-RERA ${number}` : "K-RERA verified"}
      className="inline-flex items-center gap-1 rounded-full border border-[#3ee58e]/40 bg-[#062014]/75 px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#6ff0a8] backdrop-blur-md"
    >
      <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.4} />
      {compact ? "K-RERA" : "K-RERA Verified"}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-8">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand">{eyebrow}</p>
        )}
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink md:text-[32px] md:leading-tight">{title}</h2>
        {sub && <p className="mt-2 text-[15px] text-ink-3">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
