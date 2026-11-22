/** Number parsing for the grounding eval: finds the facts a reply states so they can be checked against data. */

/**
 * Rupee amounts → rupees: "₹48.5 L", "₹1.2 Cr", "₹45,00,000", "Rs 50 lakh", "₹25k",
 * and amounts written without a symbol but with a unit: "1.28 Cr", "60 lakh", "5,900 rupees".
 */
export function amounts(text: string): number[] {
  const out: number[] = [];
  const rx = /(₹|\brs\.?\s?|\binr\s?)?\s?(\d[\d,]*(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|l|k|rupees)?(?![\w])/gi;
  for (const m of text.matchAll(rx)) {
    const [, symbol, num, rawUnit] = m;
    const unit = (rawUnit ?? "").toLowerCase();
    // Without a currency symbol, only a money unit makes it an amount ("2 km" or "3BHK" are not).
    if (!symbol && !["cr", "crore", "crores", "lakh", "lakhs", "lac", "lacs", "l", "rupees"].includes(unit)) continue;
    if (!symbol && unit === "l" && !/^\d+(\.\d+)?$/.test(num)) continue;
    const n = Number(num.replace(/,/g, ""));
    out.push(unit.startsWith("c") ? n * 1e7 : unit.startsWith("l") ? n * 1e5 : unit === "k" ? n * 1e3 : n);
  }
  return out;
}

/** "9.1%" → 9.1 */
export const percents = (text: string) => [...text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map((m) => Number(m[1]));

/** "1.3 km", "2km" → kilometres. */
export const kms = (text: string) => [...text.matchAll(/(\d+(?:\.\d+)?)\s?km\b/gi)].map((m) => Number(m[1]));

/** True when x is within rel (fraction) or abs of any allowed value. */
export const near = (x: number, allowed: number[], rel: number, abs = 0) => allowed.some((a) => Math.abs(x - a) <= Math.max(abs, a * rel));
