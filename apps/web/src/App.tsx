import { useEffect, useMemo, useState } from "react";

import AdminApp from "./components/admin/AdminApp";
import AccountPage from "./components/marketplace/AccountPage";
import AuthPage from "./components/marketplace/AuthPage";
import CartCheckoutPage from "./components/marketplace/CartCheckoutPage";
import CheckinPage from "./components/marketplace/CheckinPage";
import CheckoutPage from "./components/marketplace/CheckoutPage";
import MarketplaceHome from "./components/marketplace/MarketplaceHome";
import PartnerApp from "./components/partner/PartnerApp";
import FloatingAssistant from "./components/FloatingAssistant";
import ThemeToggle from "./components/ThemeToggle";
import { usePageMeta } from "./lib/usePageMeta";

type RouteKind =
  | "admin"
  | "partner"
  | "auth"
  | "account"
  | "checkout-cart"
  | "checkout-product"
  | "checkin"
  | "home";

function resolveRouteKind(path: string): RouteKind {
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/parceiros")) return "partner";
  if (path.startsWith("/entrar")) return "auth";
  if (path.startsWith("/minha-conta")) return "account";
  if (path.startsWith("/checkout/")) {
    const last = path.split("/").at(-1) ?? "";
    return last === "cart" ? "checkout-cart" : "checkout-product";
  }
  if (path.startsWith("/c/")) return "checkin";
  return "home";
}

const ROUTE_TITLES: Record<RouteKind, { title: string; description?: string }> = {
  admin: { title: "Painel administrativo" },
  partner: { title: "Painel do parceiro" },
  auth: { title: "Entrar", description: "Acesse a sua conta no DriverHub para acompanhar pedidos e cashback." },
  account: { title: "Minha conta", description: "Pedidos, cashback e indicações no DriverHub." },
  "checkout-cart": { title: "Finalizar compra" },
  "checkout-product": { title: "Finalizar compra" },
  checkin: { title: "Check-in do parceiro" },
  home: {
    title: "Ganhe mais como motorista",
    description: "DriverHub ajuda motoristas a aumentarem seus ganhos com benefícios, descontos e atendimento direto pelo WhatsApp."
  }
};

function App() {
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [path, setPath] = useState(() => (typeof window === "undefined" ? "/" : window.location.pathname));

  useEffect(() => {
    const updatePath = () => setPath(window.location.pathname);
    window.addEventListener("popstate", updatePath);
    // Some legacy callers fire a custom event when they programmatically push state.
    window.addEventListener("opendriver:navigate", updatePath as EventListener);
    return () => {
      window.removeEventListener("popstate", updatePath);
      window.removeEventListener("opendriver:navigate", updatePath as EventListener);
    };
  }, []);

  const routeKind = useMemo(() => resolveRouteKind(path), [path]);
  usePageMeta(ROUTE_TITLES[routeKind]);

  const openAssistant = () => setIsAssistantOpen(true);

  if (routeKind === "admin") return <AdminApp />;
  if (routeKind === "partner") return <PartnerApp />;
  if (routeKind === "auth") return <AuthPage />;
  if (routeKind === "account") return <AccountPage />;

  if (routeKind === "checkout-cart" || routeKind === "checkout-product") {
    const search = new URLSearchParams(window.location.search);
    const checkinToken = search.get("c");
    if (routeKind === "checkout-cart") {
      return <CartCheckoutPage checkinToken={checkinToken} />;
    }
    const last = path.split("/").at(-1) ?? "";
    return <CheckoutPage productId={Number(last)} checkinToken={checkinToken} />;
  }

  if (routeKind === "checkin") {
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
      <ThemeToggle />
    </>
  );
}

export default App;
