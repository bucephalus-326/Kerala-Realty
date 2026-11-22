/**
 * Listings come from `web/src/data/generated/listings.json`, built by
 * `node scripts/build-data.mjs` from seed files and OpenStreetMap extracts.
 * The shape mirrors the planned MongoDB `listings` collection.
 */
import raw from "./generated/listings.json";

export type Purpose = "buy" | "rent";
export type PropertyType = "villa" | "house" | "apartment" | "plot" | "commercial";
export type ReraStatus = "registered" | "not_required" | "pending";
export type PoiCategory =
  | "metro"
  | "water_metro"
  | "rail"
  | "it_park"
  | "hospital"
  | "school"
  | "college"
  | "mall"
  | "bus"
  | "airport";

export interface NearbyPlace {
  name: string;
  km: number;
  status?: "under_construction";
}

export interface Listing {
  id: string;
  slug: string;
  title: string;
  purpose: Purpose;
  type: PropertyType;
  /** INR. For rent: per month. */
  price: number;
  beds?: number;
  baths?: number;
  builtUpSqft?: number;
  landCents?: number;
  furnishing?: "furnished" | "semi" | "unfurnished";
  locality: string;
  city: string;
  district: string;
  /** [lng, lat] (GeoJSON order) */
  coords: [number, number];
  rera: { status: ReraStatus; number?: string };
  verified: boolean;
  isNewProject?: boolean;
  isLuxury?: boolean;
  images: string[];
  amenities: string[];
  postedBy: { kind: "owner" | "agent" | "builder"; name: string };
  postedAt: string;
  /** Nearest place per category, from OpenStreetMap. */
  nearby: Partial<Record<PoiCategory, NearbyPlace>>;
  counts: { schools2km: number; hospitals3km: number };
  /** The two most useful nearby facts for the card. */
  highlights: { label: string; km: number; category: PoiCategory }[];
  /** Demo flood layer (not KSDMA data). */
  flood: { level: "low" | "medium" | "high"; zone: string | null };
}

export const listings = raw as Listing[];

export const TYPE_LABEL: Record<PropertyType, string> = {
  villa: "Villa",
  house: "House",
  apartment: "Apartment",
  plot: "Plot",
  commercial: "Commercial",
};

export const LOCALITIES = Array.from(new Set(listings.map((l) => `${l.locality}, ${l.city}`))).sort();
