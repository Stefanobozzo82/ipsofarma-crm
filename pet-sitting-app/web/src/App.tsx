import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/sections/Hero";
import { ServicesGrid } from "@/components/sections/ServicesGrid";
import { TrustSection } from "@/components/sections/TrustSection";
import { Testimonials } from "@/components/sections/Testimonials";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Faq } from "@/components/sections/Faq";
import { AppPromo } from "@/components/sections/AppPromo";
import { CityDirectory } from "@/components/sections/CityDirectory";

/**
 * L'ordine delle sezioni riprende la struttura della homepage di Rover.com
 * (riferimento strutturale, non di brand — vedi README) — ogni sezione è
 * un componente a sé stante in components/sections/, modificabile senza
 * toccare le altre.
 */
export function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <ServicesGrid />
        <TrustSection />
        <Testimonials />
        <HowItWorks />
        <Faq />
        <AppPromo />
        <CityDirectory />
      </main>
      <Footer />
    </div>
  );
}
