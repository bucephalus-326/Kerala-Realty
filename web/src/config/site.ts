/**
 * Brand placeholder. Rename the product by editing this one file.
 */
export const site = {
  name: "Tharavad",
  tagline: "Kerala Realty",
  description:
    "Verified homes, villas, plots and projects across Kerala. K-RERA checked, direct-owner friendly and built for NRIs.",
  /** WhatsApp number with country code, digits only (e.g. 9198xxxxxxxx). WhatsApp buttons are hidden while it's empty. */
  whatsapp: (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, ""),
  supportHours: "9 AM – 9 PM IST",
  /** Public address, for links in the sitemap and share previews. Vercel provides the production URL. */
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
} as const;

export const nav = [
  { label: "Buy", href: "/?purpose=buy" },
  { label: "Rent", href: "/?purpose=rent" },
  { label: "Projects", href: "/#projects" },
  { label: "Map", href: "/map" },
  { label: "NRI Services", href: "/#nri" },
] as const;
