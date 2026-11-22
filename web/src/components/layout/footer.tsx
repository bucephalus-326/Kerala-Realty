import { Cpu, Handshake, Heart, Home, Map, Search, ShieldCheck, User, Vault } from "lucide-react";
import Link from "next/link";
import { site } from "@/config/site";
import { Logo } from "../ui/primitives";

const TRUST = [
  { icon: ShieldCheck, t: "K-RERA checked", s: "Every project verified" },
  { icon: Handshake, t: "Zero brokerage", s: "Talk to owners directly" },
  { icon: Vault, t: "Document vault", s: "Tamper-evident records" },
  { icon: Cpu, t: "AI assisted", s: "Search in plain language" },
];

const COLS = [
  { h: "Discover", l: ["Buy", "Rent", "New projects", "Plots", "Commercial", "Luxury"] },
  { h: "Services", l: ["NRI concierge", "Legal assistance", "Video tours", "Price check"] },
  { h: "Company", l: ["About", "Verification policy", "Report a listing", "Contact"] },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-elevated pb-24 md:pb-0">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-8 md:grid-cols-4 md:px-6">
        {TRUST.map(({ icon: I, t, s }) => (
          <div key={t} className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <I className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold">{t}</span>
              <span className="block text-xs text-ink-3">{s}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)] md:px-6">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-ink-3">{site.description}</p>
          </div>
          {COLS.map((c) => (
            <div key={c.h}>
              <p className="mb-3 text-sm font-semibold">{c.h}</p>
              <ul className="space-y-2">
                {c.l.map((x) => (
                  <li key={x}>
                    <Link href="/" className="text-sm text-ink-3 transition hover:text-ink">
                      {x}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 pb-8 text-xs text-ink-3 md:px-6">
          <p>
            © 2026 {site.name}. Demo build with sample listings. Map data ©{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
              OpenStreetMap contributors
            </a>
            .
          </p>
          <p className="flex items-center gap-1">
            Made with <Heart className="h-3.5 w-3.5 fill-[#ff5a6e] text-[#ff5a6e]" /> in Kerala
          </p>
        </div>
      </div>
    </footer>
  );
}

export function MobileTabBar() {
  const tabs = [
    { icon: Home, l: "Home", href: "/" },
    { icon: Search, l: "Search", href: "/#featured" },
    { icon: Map, l: "Map", href: "/map" },
    { icon: Heart, l: "Saved", href: "/#featured" },
    { icon: User, l: "Account", href: "/#signin" },
  ];
  return (
    <nav className="glass-bar fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Quick">
      <ul className="grid grid-cols-5">
        {tabs.map(({ icon: I, l, href }, i) => (
          <li key={l}>
            <Link href={href} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${i === 0 ? "text-brand" : "text-ink-3"}`}>
              <I className="h-5 w-5" />
              {l}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
