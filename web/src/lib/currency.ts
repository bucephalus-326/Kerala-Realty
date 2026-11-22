export type Currency = "INR" | "AED" | "USD" | "QAR";

export const CURRENCIES: { code: Currency; label: string; flag: string; symbol: string }[] = [
  { code: "INR", label: "Indian Rupee", flag: "🇮🇳", symbol: "₹" },
  { code: "AED", label: "UAE Dirham", flag: "🇦🇪", symbol: "AED" },
  { code: "USD", label: "US Dollar", flag: "🇺🇸", symbol: "$" },
  { code: "QAR", label: "Qatari Riyal", flag: "🇶🇦", symbol: "QAR" },
];

/** Indicative INR value of 1 unit. Demo only; a live FX feed replaces this later. */
export const INR_PER: Record<Currency, number> = {
  INR: 1,
  AED: 23.4,
  USD: 86.0,
  QAR: 23.6,
};

/** Format an INR amount in the chosen currency. INR uses lakh / crore. */
export function formatPrice(inr: number, currency: Currency, opts: { compact?: boolean } = {}) {
  const { compact = true } = opts;
  if (currency === "INR") {
    if (compact && inr >= 1e7) return `₹${trim(inr / 1e7)} Cr`;
    if (compact && inr >= 1e5) return `₹${trim(inr / 1e5)} L`;
    return `₹${Math.round(inr).toLocaleString("en-IN")}`;
  }
  const v = inr / INR_PER[currency];
  const s = new Intl.NumberFormat("en-US", {
    notation: compact && v >= 10000 ? "compact" : "standard",
    maximumFractionDigits: compact && v >= 10000 ? 2 : 0,
  }).format(v);
  return currency === "USD" ? `$${s}` : `${currency} ${s}`;
}

function trim(n: number) {
  return n >= 100 ? Math.round(n).toString() : n.toFixed(2).replace(/\.?0+$/, "");
}

/** Suggest a currency from the browser time zone (no network, no tracking). */
export function currencyFromTimeZone(tz: string | undefined): Currency | null {
  if (!tz) return null;
  if (tz === "Asia/Dubai" || tz === "Asia/Muscat") return "AED";
  if (tz === "Asia/Qatar" || tz === "Asia/Bahrain" || tz === "Asia/Riyadh" || tz === "Asia/Kuwait") return "QAR";
  if (tz.startsWith("America/") || tz.startsWith("Europe/") || tz.startsWith("Australia/")) return "USD";
  return null;
}

export function regionFromTimeZone(tz: string | undefined) {
  const map: Record<string, string> = {
    "Asia/Dubai": "the UAE",
    "Asia/Muscat": "Oman",
    "Asia/Qatar": "Qatar",
    "Asia/Bahrain": "Bahrain",
    "Asia/Riyadh": "Saudi Arabia",
    "Asia/Kuwait": "Kuwait",
  };
  if (!tz) return null;
  if (map[tz]) return map[tz];
  if (tz.startsWith("America/")) return "the Americas";
  if (tz.startsWith("Europe/")) return "Europe";
  if (tz.startsWith("Australia/")) return "Australia";
  return null;
}
