import { useEffect, useState } from "react";

import BenefitsSection from "./components/BenefitsSection";
import AdminApp from "./components/admin/AdminApp";
import AccountPage from "./components/marketplace/AccountPage";
import AuthPage from "./components/marketplace/AuthPage";
import MarketplaceHome from "./components/marketplace/MarketplaceHome";
import BotSection from "./components/BotSection";
import EarningsSection from "./components/EarningsSection";
import FinalCTA from "./components/FinalCTA";
import FloatingAssistant from "./components/FloatingAssistant";
import HeroSection from "./components/HeroSection";
import HowItWorks from "./components/HowItWorks";
import TrustSection from "./components/TrustSection";

function App() {
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [path, setPath] = useState(window.location.pathname);
  const isAdmin = path.startsWith("/admin");

  const openAssistant = () => {
    setIsAssistantOpen(true);
  };

  useEffect(() => {
    const updatePath = () => setPath(window.location.pathname);
    window.addEventListener("popstate", updatePath);

    return () => window.removeEventListener("popstate", updatePath);
  }, []);

  if (isAdmin) {
    return <AdminApp />;
  }

  if (path.startsWith("/entrar")) {
    return <AuthPage />;
  }

  if (path.startsWith("/minha-conta")) {
    return <AccountPage />;
  }

  if (!path.startsWith("/motoristas")) {
    return <MarketplaceHome />;
  }

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
