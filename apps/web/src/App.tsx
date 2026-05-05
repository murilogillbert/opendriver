import { useEffect, useState } from "react";

import AdminApp from "./components/admin/AdminApp";
import AccountPage from "./components/marketplace/AccountPage";
import AuthPage from "./components/marketplace/AuthPage";
import CheckoutPage from "./components/marketplace/CheckoutPage";
import MarketplaceHome from "./components/marketplace/MarketplaceHome";
import FloatingAssistant from "./components/FloatingAssistant";

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

  if (path.startsWith("/checkout/")) {
    const productId = Number(path.split("/").at(-1));
    return <CheckoutPage productId={productId} />;
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
