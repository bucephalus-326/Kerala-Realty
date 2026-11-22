import { HomeExperience } from "@/components/home/home-experience";
import { ListPropertyCta, LocalityGrid, MapPreview, NriConcierge } from "@/components/home/sections";
import { Footer, MobileTabBar } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <HomeExperience />
        <MapPreview />
        <LocalityGrid />
        <NriConcierge />
        <ListPropertyCta />
      </main>
      <Footer />
      <MobileTabBar />
    </>
  );
}
