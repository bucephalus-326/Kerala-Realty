"use client";

import { Megaphone, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Admin-set announcement under the navbar; scrolls away with the page and stays dismissed per message. */
export function Announcement() {
  const [text, setText] = useState<string | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    fetch("/api/settings/public")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { announcement: string | null } | null) => {
        const t = d?.announcement;
        if (!t) return;
        try {
          if (sessionStorage.getItem("announcement.dismissed") === t) return;
        } catch {
          /* ignore */
        }
        setText(t);
      })
      .catch(() => {});
  }, []);
  if (!text || pathname.startsWith("/map")) return null;
  return (
    <div role="status" className="glass-bar rise absolute left-1/2 top-[68px] z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-2 rounded-full py-1 pl-3 pr-1.5 text-[13px] shadow-float md:top-[84px] md:py-1.5">
      <Megaphone className="h-4 w-4 shrink-0 text-gold" />
      <span className="min-w-0 truncate">{text}</span>
      <button
        onClick={() => {
          try {
            sessionStorage.setItem("announcement.dismissed", text);
          } catch {
            /* ignore */
          }
          setText(null);
        }}
        aria-label="Dismiss announcement"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-muted"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
