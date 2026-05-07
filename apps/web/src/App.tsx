import { useEffect, useState } from "react";

import AdminApp from "./components/admin/AdminApp";
import AccountPage from "./components/marketplace/AccountPage";
import AuthPage from "./components/marketplace/AuthPage";
import CartCheckoutPage from "./components/marketplace/CartCheckoutPage";
import CheckinPage from "./components/marketplace/CheckinPage";
import CheckoutPage from "./components/marketplace/CheckoutPage";
import MarketplaceHome from "./components/marketplace/MarketplaceHome";
import PartnerApp from "./components/partner/PartnerApp";
import FloatingAssistant from "./components/FloatingAssistant";

function App() {
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [path, setPath] = useState(window.location.pathname);
  const isAdmin = path.startsWith("/admin");
  const isPartner = path.startsWith("/parceiros");

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

  if (isPartner) {
    return <PartnerApp />;
  }

  if (path.startsWith("/entrar")) {
    return <AuthPage />;
  }

  if (path.startsWith("/minha-conta")) {
    return <AccountPage />;
  }

  if (path.startsWith("/checkout/")) {
    const last = path.split("/").at(-1) ?? "";
    const search = new URLSearchParams(window.location.search);
    const checkinToken = search.get("c");
    if (last === "cart") {
      return <CartCheckoutPage checkinToken={checkinToken} />;
    }
    return <CheckoutPage productId={Number(last)} checkinToken={checkinToken} />;
  }

  if (path.startsWith("/c/")) {
    const token = path.split("/").slice(2).join("/");
    return <CheckinPage token={token} />;
  }

  return (
    <>
      <MarketplaceHome />
      <FloatingAssistant
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        onOpen={openAssistant}
      />
    </>
  );
}

export default App;
