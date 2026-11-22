import type { Metadata } from "next";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { site } from "@/config/site";

export const metadata: Metadata = { title: `Portal · ${site.name}`, robots: { index: false } };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar solid active="" />
      <main className="min-h-dvh pb-24 pt-24 md:pt-28">{children}</main>
      <Footer />
    </>
  );
}
