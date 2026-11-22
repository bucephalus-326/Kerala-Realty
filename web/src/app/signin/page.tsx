import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { Navbar } from "@/components/layout/navbar";
import { site } from "@/config/site";

export const metadata: Metadata = { title: `Sign in · ${site.name}` };

export default function SignInPage() {
  return (
    <>
      <Navbar solid active="" />
      <main className="relative min-h-dvh overflow-hidden px-4 pb-16 pt-24 md:pt-32">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]">
          <div className="grid-bg h-full w-full" />
        </div>
        <Suspense>
          <AuthForm />
        </Suspense>
      </main>
    </>
  );
}
