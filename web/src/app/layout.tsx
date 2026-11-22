import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";
import { Assistant } from "@/components/assistant/assistant";
import { Announcement } from "@/components/layout/announcement";
import { ConsentBanner } from "@/components/consent/consent-banner";
import { Providers } from "@/components/providers";
import { site } from "@/config/site";

const display = Sora({ subsets: ["latin"], variable: "--font-display", weight: ["400", "500", "600", "700"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: `${site.name}: Verified Kerala Real Estate`,
  description: site.description,
  openGraph: {
    siteName: site.name,
    type: "website",
    locale: "en_IN",
    images: [{ url: "/img/hero-backwater.jpg", alt: "Kerala backwaters with a houseboat among coconut palms" }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#060a08" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6f2" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh bg-bg text-ink">
        <Providers>
          {children}
          <Announcement />
          <Assistant />
          <ConsentBanner />
        </Providers>
      </body>
    </html>
  );
}
