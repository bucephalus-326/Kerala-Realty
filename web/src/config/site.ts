/**
 * Brand placeholder. Rename the product by editing this one file.
 */
export const site = {
  name: "Tharavad",
  tagline: "Kerala Realty",
  description:
    "Verified homes, villas, plots and projects across Kerala. K-RERA checked, direct-owner friendly and built for NRIs.",
  // Demo WhatsApp number (placeholder). Replace before launch.
  whatsapp: "919000000000",
  supportHours: "9 AM – 9 PM IST",
} as const;

export const nav = [
  { label: "Buy", href: "/?purpose=buy" },
  { label: "Rent", href: "/?purpose=rent" },
  { label: "Projects", href: "/#projects" },
  { label: "Map", href: "/#map" },
  { label: "NRI Services", href: "/#nri" },
] as const;
