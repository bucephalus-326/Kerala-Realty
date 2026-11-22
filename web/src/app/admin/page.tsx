import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminConsole } from "@/components/admin/admin-console";
import { Navbar } from "@/components/layout/navbar";
import { site } from "@/config/site";

export const metadata: Metadata = { title: `Admin · ${site.name}`, robots: { index: false } };

export default function AdminPage() {
  return (
    <>
      <Navbar solid active="" />
      <main className="min-h-dvh pb-24 pt-24 md:pt-28">
        <Suspense>
          <AdminConsole />
        </Suspense>
      </main>
    </>
  );
}
