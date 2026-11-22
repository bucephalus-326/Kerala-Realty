"use client";

import Link from "next/link";
import { buttonClass } from "@/components/ui/primitives";

/** Shown when a page can't load, most often while the free API server wakes up (up to a minute). */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-lg place-items-center px-4 text-center">
      <div>
        <h1 className="font-display text-2xl font-semibold">We couldn&apos;t load this page</h1>
        <p className="mt-2 text-ink-2">Our server may be waking up. This takes up to a minute on the first visit; please try again.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={reset} className={buttonClass("primary")}>
            Try again
          </button>
          <Link href="/" className={buttonClass("outline")}>
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
