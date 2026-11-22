import type { Metadata } from "next";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { site } from "@/config/site";

export const metadata: Metadata = { title: `Privacy notice · ${site.name}` };

const SECTIONS = [
  {
    h: "What we collect",
    p: [
      "Account details you give us: name, email, phone number, and your role (buyer, NRI buyer, owner, agent).",
      "Activity on the site: homes you save, visits and video tours you book, concierge requests and enquiries.",
      "With your consent only: your approximate city (from your connection), device type, time zone and anonymous usage stats.",
    ],
  },
  {
    h: "Why",
    p: [
      "To run your account, book visits and connect you with owners, agents and our NRI concierge.",
      "With consent, to recommend homes near you and show prices in your currency and time zone.",
    ],
  },
  {
    h: "Your rights under the DPDP Act, 2023",
    p: [
      "You can change or withdraw consent at any time from the footer link “Privacy choices”. Withdrawing is as easy as giving consent.",
      "You can ask for a copy of your data, correct it, or have your account erased.",
      "We do not sell your data or use it for third-party advertising.",
    ],
  },
  {
    h: "Storage and security",
    p: [
      "Passwords are hashed. Sessions use secure, http-only cookies. Consent records use a random identifier and no IP address.",
      "Security-relevant actions (sign-ins, bookings, consent changes) are kept in an audit trail.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <Navbar solid active="" />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-28 md:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Privacy notice</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">How we use your data</h1>
        <p className="mt-3 text-ink-3">
          Demo notice for {site.name}. Have it reviewed by a lawyer before launch, and name a grievance officer and
          contact address.
        </p>
        <div className="mt-10 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.h}>
              <h2 className="font-display text-xl font-semibold">{s.h}</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] text-ink-2">
                {s.p.map((t) => (
                  <li key={t}>{t}</li>
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
