import BenefitsSection from "./components/BenefitsSection";
import BotSection from "./components/BotSection";
import EarningsSection from "./components/EarningsSection";
import FinalCTA from "./components/FinalCTA";
import HeroSection from "./components/HeroSection";
import HowItWorks from "./components/HowItWorks";
import TrustSection from "./components/TrustSection";

const WHATSAPP_URL = "https://wa.me/556182187476";

function App() {
  const openWhatsApp = () => {
    window.open(WHATSAPP_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <main className="min-h-screen overflow-hidden bg-brand-ink font-sans text-white antialiased">
      <HeroSection onCtaClick={openWhatsApp} />
      <BenefitsSection />
      <EarningsSection />
      <HowItWorks />
      <BotSection onCtaClick={openWhatsApp} />
      <TrustSection />
      <FinalCTA onCtaClick={openWhatsApp} />

      <button
        type="button"
        onClick={openWhatsApp}
        aria-label="Falar com a Open Driver pelo WhatsApp"
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-brand-gold px-5 py-4 text-sm font-black uppercase tracking-wide text-brand-ink shadow-gold transition duration-300 hover:-translate-y-1 hover:scale-105 hover:bg-brand-goldLight focus:outline-none focus:ring-4 focus:ring-brand-gold/30 sm:bottom-6 sm:right-6"
      >
        <span
          className="grid h-7 w-7 place-items-center rounded-full bg-brand-ink text-xs text-white"
          aria-hidden="true"
        >
          WA
        </span>
        WhatsApp
      </button>
    </main>
  );
}

export default App;
