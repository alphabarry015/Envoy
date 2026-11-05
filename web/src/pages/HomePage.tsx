import HeroSection from "../components/HeroSection";
import SiteFooter from "../components/SiteFooter";
import ApiKeysSection from "../components/sections/ApiKeysSection";
import DomainsSection from "../components/sections/DomainsSection";
import LogsSection from "../components/sections/LogsSection";
import PixelBanner from "../components/ui/PixelBanner";

export default function HomePage() {
  return (
    <main className="bg-[#0A4BD6] text-white">
      <HeroSection />
      <PixelBanner align="top" seed={11} />
      <DomainsSection />
      <ApiKeysSection />
      <LogsSection />
      <SiteFooter />
    </main>
  );
}
