import { describe, expect, it } from "vitest";
import { amounts, kms, near, percents } from "../src/ai/grounding.js";

describe("grounding eval parsers", () => {
  it("reads Indian price formats", () => {
    expect(amounts("Top pick at ₹48.5 L, or ₹1.2 Cr for the villa")).toEqual([4_850_000, 12_000_000]);
    expect(amounts("budget ₹45,00,000 or Rs 50 lakh, rent ₹25k")).toEqual([4_500_000, 5_000_000, 25_000]);
    // Without a ₹ sign, only money units count; BHK counts and distances don't.
    expect(amounts("from 1.28 Cr to 1.85 Cr, about 5,900 rupees per sq.ft")).toEqual([12_800_000, 18_500_000, 5_900]);
    expect(amounts("3BHK, 2 km from the metro, 12 schools")).toEqual([]);
  });

  it("reads distances and percentages", () => {
    expect(kms("0.8 km to Infopark, metro 2km away")).toEqual([0.8, 2]);
    expect(percents("growth around 9.1% a year")).toEqual([9.1]);
  });

  it("flags a price no listing has", () => {
    const listingPrices = [4_850_000, 6_200_000];
    const [stated] = amounts("I found one at ₹39 L");
    expect(near(stated, listingPrices, 0.02, 1000)).toBe(false);
    expect(near(amounts("₹48.5 L")[0], listingPrices, 0.02, 1000)).toBe(true);
  });
});
