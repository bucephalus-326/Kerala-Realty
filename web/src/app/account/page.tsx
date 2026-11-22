import type { Metadata } from "next";
import { AccountView } from "@/components/account/account-view";
import { Footer, MobileTabBar } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { site } from "@/config/site";

export const metadata: Metadata = { title: `My account · ${site.name}`, robots: { index: false } };

export default function AccountPage() {
  return (
    <>
      <Navbar solid active="" />
      <main className="min-h-dvh pb-20 pt-24 md:pt-32">
        <AccountView />
      </main>
      <Footer />
      <MobileTabBar />
    </>
  );
}
