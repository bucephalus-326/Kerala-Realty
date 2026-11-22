import type { Metadata } from "next";
import { Navbar } from "@/components/layout/navbar";
import { MapLoader } from "@/components/map/map-loader";

export const metadata: Metadata = {
  title: "Map: Explore Kerala properties",
  description: "Price heat, metro lines, IT parks, schools, hospitals and flood zones over every verified listing.",
};

export default function MapPage() {
  return (
    <>
      <Navbar solid active="Map" />
      <main className="fixed inset-x-0 bottom-0 top-16 md:top-[72px]">
        <MapLoader />
      </main>
    </>
  );
}
