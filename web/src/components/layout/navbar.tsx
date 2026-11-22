"use client";

import clsx from "clsx";
import { Heart, Menu, Moon, Plus, Sun, X } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { nav } from "@/config/site";
import { usePrefs } from "../providers";
import { buttonClass, Logo } from "../ui/primitives";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { saved } = usePrefs();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Over the hero photo the bar is transparent with light text; once scrolled it becomes themed glass.
  const onPhoto = !scrolled && !open;

  return (
    <header
      className={clsx(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        onPhoto ? "bg-transparent" : "glass-bar border-x-0 border-t-0 shadow-card",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 md:h-[72px] md:px-6">
        <Logo onDark={onPhoto} />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {nav.map((item, i) => (
            <Link
              key={item.label}
              href={item.href}
              className={clsx(
                "relative rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                onPhoto ? "text-white/80 hover:text-white" : "text-ink-2 hover:text-ink",
                i === 0 && (onPhoto ? "text-white" : "text-ink"),
              )}
            >
              {item.label}
              {i === 0 && <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brand" />}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:gap-2">

          <Link
            href="/#featured"
            aria-label={`Saved properties (${saved.size})`}
            className={clsx(
              "relative grid h-9 w-9 place-items-center rounded-lg transition-colors",
              onPhoto ? "text-white hover:bg-white/10" : "text-ink-2 hover:bg-muted",
            )}
          >
            <Heart className="h-[18px] w-[18px]" />
            {saved.size > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-ink">
                {saved.size}
              </span>
            )}
          </Link>

          <ThemeToggle onPhoto={onPhoto} />

          <Link
            href="/#list"
            className={clsx(
              buttonClass("outline", "sm"),
              "max-md:hidden",
              onPhoto && "border-white/25 text-white hover:border-white hover:text-white",
            )}
          >
            <Plus className="h-4 w-4" /> List Property
          </Link>
          <Link href="/#signin" className={clsx(buttonClass("primary", "sm"), "max-sm:hidden")}>
            Sign in
          </Link>

          <button
            className={clsx("grid h-9 w-9 place-items-center rounded-lg lg:hidden", onPhoto ? "text-white" : "text-ink")}
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line px-4 pb-5 pt-2 lg:hidden">
          <nav className="grid gap-1" aria-label="Mobile">
            {nav.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-[15px] font-medium text-ink hover:bg-muted"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link href="/#list" onClick={() => setOpen(false)} className={buttonClass("outline", "md")}>
              <Plus className="h-4 w-4" /> List Property
            </Link>
            <Link href="/#signin" onClick={() => setOpen(false)} className={buttonClass("primary", "md")}>
              Sign in
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function ThemeToggle({ onPhoto }: { onPhoto: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={clsx(
        "grid h-9 w-9 place-items-center rounded-lg transition-colors",
        onPhoto ? "text-white hover:bg-white/10" : "text-ink-2 hover:bg-muted",
      )}
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}
