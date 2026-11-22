"use client";

import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePrefs } from "../providers";

export type ListingStatus = "draft" | "pending" | "rejected" | "published" | "sold" | "rented" | "unavailable";

export interface PortalListing {
  id: string;
  title: string;
  purpose: "buy" | "rent";
  type: "villa" | "house" | "apartment" | "plot" | "commercial";
  status: ListingStatus;
  price: number;
  description?: string;
  beds?: number;
  baths?: number;
  builtUpSqft?: number;
  landCents?: number;
  furnishing?: "furnished" | "semi" | "unfurnished";
  locality?: string;
  city?: "Kochi" | "Thiruvananthapuram" | "Kozhikode";
  district?: string;
  coords?: [number, number];
  pinned?: boolean;
  rera?: { status: "registered" | "not_required" | "pending"; number?: string };
  amenities?: string[];
  images: string[];
  videoUrl?: string;
  isNewProject?: boolean;
  possession?: string;
  reviewNote?: string;
  nearby?: Record<string, { name: string; km: number; status?: string }>;
  highlights?: { label: string; km: number; category: string }[];
  flood?: { level: string; zone: string | null };
  missing?: Record<string, string>;
  stats?: { views30d: number; saves: number; visits: number; leads: number };
}

export const STATUS_STYLE: Record<ListingStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-ink-2" },
  pending: { label: "In review", className: "bg-gold-soft text-gold" },
  rejected: { label: "Changes needed", className: "bg-danger/10 text-danger" },
  published: { label: "Live", className: "bg-brand-soft text-brand" },
  sold: { label: "Sold", className: "bg-[#8b9cff]/15 text-[#8b9cff]" },
  rented: { label: "Rented", className: "bg-[#8b9cff]/15 text-[#8b9cff]" },
  unavailable: { label: "Paused", className: "bg-muted text-ink-3" },
};

export function StatusBadge({ status }: { status: ListingStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium", s.className)}>{s.label}</span>;
}

/** Only owners, agents and admins may use the portal. */
export function usePortalGuard() {
  const { session, authLoading, can } = usePrefs();
  const router = useRouter();
  const allowed = can("listings:write_own");
  useEffect(() => {
    if (authLoading) return;
    if (!session) router.replace("/signin?next=/portal");
    else if (!allowed) router.replace("/account");
  }, [authLoading, session, allowed, router]);
  return { ready: !authLoading && !!session && allowed, session };
}

export function Spinner() {
  return (
    <div className="grid min-h-[50vh] place-items-center text-ink-3">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

export const AMENITY_SUGGESTIONS: Record<string, string[]> = {
  apartment: ["Lift", "Gym", "Pool", "Power backup", "Covered parking", "Security", "Clubhouse", "Kids play area", "Rooftop garden"],
  villa: ["Gated", "Car porch", "Garden", "Solar", "Rainwater harvesting", "Well water", "CCTV", "Pool", "Home office"],
  house: ["Car porch", "Courtyard", "Well water", "Garden", "Solar", "Compound wall"],
  plot: ["Clear title", "Road access 12 ft", "Road access 20 ft", "Dry land", "Corner plot", "Compound wall"],
  commercial: ["Central AC", "100% backup", "Car parking", "Lift", "Pantry", "Fire safety"],
};
