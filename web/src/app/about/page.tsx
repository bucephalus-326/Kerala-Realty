import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: `About · ${site.name}`,
  description: `How ${site.name} checks listings, handles reports and helps NRI buyers.`,
};

/** Describes what the product actually does. Keep it in step with the features. */
const SECTIONS: { id: string; h: string; p: React.ReactNode[] }[] = [
  {
    id: "about",
    h: `About ${site.name}`,
    p: [
      "A property platform for Kerala: homes, villas, plots and new projects in Kochi, Trivandrum and Calicut, with an interactive map built on OpenStreetMap.",
      "This is a demo build. Listings, prices and the flood layer are sample data and are labelled as such.",
    ],
  },
  {
    id: "verification",
    h: "Verification policy",
    p: [
      "Every new listing is reviewed by our team before it goes live. Changes to photos, location or property type send it back for review.",
      "Owners and agents upload ID and ownership documents to a private vault. Each file gets a SHA-256 fingerprint, so any later change is detectable, and every time staff open a file it is logged.",
      "A “Verified” badge means our team has checked the owner's documents. K-RERA numbers are checked against the format; projects that need registration show their number on the listing.",
    ],
  },
  {
    id: "report",
    h: "Report a listing",
    p: [
      "On any listing page, use “Report this listing” to tell us it looks fake, is already sold, has the wrong price or location, or is a duplicate.",
      "Our team reviews every report. If a listing breaks the rules, we take it down and tell the owner why.",
    ],
  },
  {
    id: "price-check",
    h: "Price check",
    p: [
      "Every listing page compares the asking price per sq.ft with the average for its locality.",
      <>
        Compare a home&apos;s asking price with its surroundings on the <Link href="/map" className="underline hover:text-ink">map&apos;s &ldquo;Price heat&rdquo; layer</Link>,
        which shows the asking price per sq.ft across each area.
      </>,
      "These are indicative figures from demo data, not a valuation. For a valuation, ask a registered valuer.",
    ],
  },
  {
    id: "video-tours",
    h: "Video tours",
    p: [
      "Listings can include a video walkthrough. You can also book a live video tour from any listing; the owner or agent confirms a time in India time and in yours.",
    ],
  },
  {
    id: "legal",
    h: "Legal assistance for NRI buyers",
    p: [
      <>
        Through the <Link href="/#nri" className="underline hover:text-ink">NRI concierge</Link> you can ask for help with title checks, power of
        attorney, registration and paperwork. We connect you with independent professionals; we don&apos;t give legal advice ourselves.
      </>,
    ],
  },
  {
    id: "contact",
    h: "Contact",
    p: [
      `Support hours: ${site.supportHours}.`,
      site.whatsapp ? (
        <>
          WhatsApp:{" "}
          <a href={`https://wa.me/${site.whatsapp}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
            +{site.whatsapp}
          </a>
        </>
      ) : (
        "Use “Request a call back” on any listing, or ask the assistant to have someone call you."
      ),
      <>
        For privacy requests, see the <Link href="/privacy" className="underline hover:text-ink">privacy notice</Link>.
      </>,
    ],
  },
];

export default function AboutPage() {
  return (
    <>
      <Navbar solid active="" />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-28 md:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">About</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">How {site.name} works</h1>
        <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
          {SECTIONS.slice(1).map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full border border-line px-3 py-1 text-sm text-ink-2 hover:border-brand hover:text-ink">
              {s.h}
            </a>
          ))}
        </nav>
        <div className="mt-10 space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-28">
              <h2 className="font-display text-xl font-semibold">{s.h}</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] text-ink-2">
                {s.p.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
