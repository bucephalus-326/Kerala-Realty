import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { buttonClass } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <>
      <Navbar solid active="" />
      <main className="mx-auto grid min-h-dvh max-w-lg place-items-center px-4 pt-20 text-center">
        <div>
          <p className="font-display text-6xl font-semibold text-brand">404</p>
          <h1 className="mt-3 font-display text-2xl font-semibold">This page isn&apos;t here</h1>
          <p className="mt-2 text-ink-2">The listing may have been sold, rented or removed by its owner.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/" className={buttonClass("primary")}>
              Browse homes
            </Link>
            <Link href="/map" className={buttonClass("outline")}>
              Open the map
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
