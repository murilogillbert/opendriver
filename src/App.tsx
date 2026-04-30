import { useState } from "react";

import BenefitsSection from "./components/BenefitsSection";
import BotSection from "./components/BotSection";
import EarningsSection from "./components/EarningsSection";
import FinalCTA from "./components/FinalCTA";
import FloatingAssistant from "./components/FloatingAssistant";
import HeroSection from "./components/HeroSection";
import HowItWorks from "./components/HowItWorks";
import TrustSection from "./components/TrustSection";

function App() {
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  const openAssistant = () => {
    setIsAssistantOpen(true);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-brand-ink font-sans text-white antialiased">
      <HeroSection onCtaClick={openAssistant} />
      <BenefitsSection />
      <EarningsSection />
      <HowItWorks />
      <BotSection onCtaClick={openAssistant} />
      <TrustSection />
      <FinalCTA onCtaClick={openAssistant} />

      <FloatingAssistant
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        onOpen={openAssistant}
      />
    </main>
  );
}

export default App;
