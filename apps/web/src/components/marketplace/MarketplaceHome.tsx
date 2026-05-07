import { useEffect, useMemo, useState } from "react";

import { assetUrl } from "../../lib/assets";
import { getToken, marketplaceApi, money, Product } from "../../lib/marketplaceApi";
import logoUrl from "../../assets/driverhub-logo.svg";

type Partner = {
  id: number;
  nome_fantasia: string;
  cidade: string;
  estado: string;
  total_produtos: number;
};

type PartnerLocation = {
  id: number;
  partner_id: number;
  partner_nome: string;
  nome: string;
  endereco: string | null;
  latitude: number;
  longitude: number;
  cidade: string;
  estado: string;
  checkin_token: string | null;
  distance_km?: number | null;
};

// Haversine in km. Used to sort partner locations by proximity to the user.
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function MarketplaceHome() {
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerLocations, setPartnerLocations] = useState<PartnerLocation[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("todos");
  const [selectedPartner, setSelectedPartner] = useState<number | "todos">("todos");
  const [status, setStatus] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "denied" | "ready">("idle");

  useEffect(() => {
    void fetch(`${import.meta.env.VITE_API_BASE_URL ?? "/api"}/analytics/page-view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_name: "home_view", path: "/" })
    }).catch(() => undefined);

    void marketplaceApi
      .products()
      .then(setProducts)
      .catch(() => setProducts([]));
    void marketplaceApi
      .partners()
      .then(setPartners)
      .catch(() => setPartners([]));
    void marketplaceApi
      .partnerLocations()
      .then(setPartnerLocations)
      .catch(() => setPartnerLocations([]));
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.categoria_nome).filter(Boolean))) as string[],
    [products]
  );

  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        if (selectedCategory !== "todos" && product.categoria_nome !== selectedCategory) {
          return false;
        }
        if (selectedPartner !== "todos" && Number(product.partner_id) !== Number(selectedPartner)) {
          return false;
        }
        return true;
      }),
    [products, selectedCategory, selectedPartner]
  );

  const featuredProducts = visibleProducts.slice(0, 6);
  const serviceProducts = visibleProducts.filter((product) => product.offer_type === "servico").slice(0, 3);
  const voucherProducts = visibleProducts.filter((product) => product.offer_type === "voucher").slice(0, 3);
  const biggestSavings = [...visibleProducts]
    .sort((a, b) => Number(b.economia_estimada) - Number(a.economia_estimada))
    .slice(0, 3);

  // Aggregated metrics computed from real catalog data — no mock numbers.
  const totalEconomyMonth = products.reduce(
    (sum, product) => sum + Number(product.economia_mensal_estimada ?? 0),
    0
  );
  const averageEconomy = products.length > 0 ? totalEconomyMonth / products.length : 0;
  const categoryCount = categories.length;

  const navigate = (path: string) => {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const buy = async (product: Product) => {
    if (!getToken()) {
      navigate("/entrar");
      return;
    }
    void fetch(`${import.meta.env.VITE_API_BASE_URL ?? "/api"}/analytics/page-view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_name: "checkout_started", path: `/checkout/${product.id}` })
    }).catch(() => undefined);
    navigate(`/checkout/${product.id}`);
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("denied");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserPosition({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGeoStatus("ready");
      },
      () => setGeoStatus("denied"),
      { maximumAge: 5 * 60 * 1000, timeout: 10_000 }
    );
  };

  const sortedLocations = useMemo<PartnerLocation[]>(() => {
    if (!userPosition) return partnerLocations.slice(0, 6);
    return partnerLocations
      .map((loc) => ({
        ...loc,
        distance_km: haversineKm(userPosition.lat, userPosition.lng, Number(loc.latitude), Number(loc.longitude))
      }))
      .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity))
      .slice(0, 6);
  }, [partnerLocations, userPosition]);

  const visitLocation = (location: PartnerLocation) => {
    if (location.checkin_token) {
      navigate(`/c/${location.checkin_token}`);
      return;
    }
    setSelectedPartner(location.partner_id);
    document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="min-h-screen bg-[#f7f3ea] text-[#101722]">
      <header className="sticky top-0 z-40 border-b border-[#d8caa9]/70 bg-[#f7f3ea]/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5">
          <button type="button" onClick={() => navigate("/")} className="flex items-center gap-3">
            <img src={logoUrl} alt="DriverHub" className="h-11 w-auto max-w-[12rem]" />
          </button>
          <nav className="flex items-center gap-2">
            <a href="#beneficios" className="hidden px-3 py-2 text-sm font-black text-[#465366] sm:inline">
              Beneficios
            </a>
            <a href="#catalogo" className="hidden px-3 py-2 text-sm font-black text-[#465366] sm:inline">
              Produtos
            </a>
            <a href="#lojas" className="hidden px-3 py-2 text-sm font-black text-[#465366] sm:inline">
              Lojas
            </a>
            <button
              type="button"
              onClick={() => navigate(getToken() ? "/minha-conta" : "/entrar")}
              className="rounded-md bg-[#08111f] px-4 py-3 text-sm font-black text-white shadow-sm"
            >
              Minha conta
            </button>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#08111f] text-white">
        <div className="absolute inset-0 opacity-30">
          <img
            src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1800&q=80"
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-[#08111f]/78" />

        <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[1fr_27rem] lg:items-center">
          <div className="max-w-4xl">
            <p className="inline-flex rounded-md border border-brand-gold/40 bg-brand-gold/10 px-3 py-2 text-xs font-black uppercase tracking-[0.22em] text-brand-gold">
              Clube de economia e vouchers
            </p>
            <h1 className="mt-6 max-w-4xl font-display text-4xl font-black leading-[1.02] sm:text-6xl lg:text-7xl">
              Beneficios reais, parceiros de verdade.
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-white/76">
              Vouchers, produtos com desconto, cashback e vantagens recorrentes. Filtre por categoria
              ou parceiro e descubra as lojas mais proximas de voce.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#catalogo"
                className="rounded-md bg-brand-gold px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-brand-ink shadow-gold"
              >
                Ver produtos
              </a>
              <button
                type="button"
                onClick={() => navigate("/entrar")}
                className="rounded-md border border-white/20 bg-white/5 px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-white"
              >
                Comecar agora
              </button>
            </div>

            <div className="mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
              <HeroMetric label="Ofertas no catalogo" value={String(products.length)} />
              <HeroMetric label="Parceiros ativos" value={String(partners.length)} />
              <HeroMetric label="Categorias" value={String(categoryCount)} />
            </div>
          </div>

          <aside className="rounded-md border border-white/10 bg-white/[0.08] p-5 shadow-navy backdrop-blur">
            <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-bold text-white/60">Economia mensal somada do catalogo</p>
                <strong className="mt-2 block text-4xl font-black text-brand-gold">
                  {money(totalEconomyMonth)}
                </strong>
              </div>
              <span className="rounded-md bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-brand-ink">
                ao vivo
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {categories.slice(0, 5).map((category) => {
                const categoryEconomy = products
                  .filter((product) => product.categoria_nome === category)
                  .reduce((sum, product) => sum + Number(product.economia_mensal_estimada ?? 0), 0);
                const max = totalEconomyMonth > 0 ? totalEconomyMonth : 1;
                return (
                  <div key={category} className="grid grid-cols-[7.5rem_1fr_4.6rem] items-center gap-3">
                    <span className="text-sm font-black text-white/80">{category}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-white/10">
                      <span
                        className="block h-full rounded-full bg-brand-gold"
                        style={{ width: `${Math.min((categoryEconomy / max) * 100, 100)}%` }}
                      />
                    </span>
                    <span className="text-right text-sm font-black">{money(categoryEconomy)}</span>
                  </div>
                );
              })}
              {categories.length === 0 && (
                <p className="text-sm font-bold text-white/68">
                  Nenhuma categoria publicada ainda.
                </p>
              )}
            </div>
          </aside>
        </div>
      </section>

      <section id="beneficios" className="border-b border-[#e3d7bd] bg-[#f7f3ea]">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 py-10 md:grid-cols-4">
          <Benefit title="Vouchers" text="Combustivel, alimentacao, farmacia e viagens com economia clara." />
          <Benefit title="Produtos" text="Itens fisicos e digitais com preco Open Driver." />
          <Benefit title="Servicos" text="Lavagem, oleo, guincho e assistencia presencial." />
          <Benefit title="Cashback" text="Retorno acumulado para compras e beneficios recorrentes." />
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 py-10 md:grid-cols-4">
          <Highlight label="Ofertas no catalogo" value={String(products.length)} />
          <Highlight label="Parceiros ativos" value={String(partners.length)} />
          <Highlight label="Economia media por oferta" value={money(averageEconomy)} />
          <Highlight label="Lojas fisicas mapeadas" value={String(partnerLocations.length)} />
        </div>
      </section>

      <section id="catalogo" className="mx-auto max-w-7xl px-5 py-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#a17820]">
              Produtos e vantagens
            </p>
            <h2 className="mt-2 font-display text-3xl font-black sm:text-4xl">
              Comece pelos descontos que mais pesam no mes.
            </h2>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap gap-2">
              <FilterButton active={selectedCategory === "todos"} onClick={() => setSelectedCategory("todos")}>
                Todas categorias
              </FilterButton>
              {categories.map((category) => (
                <FilterButton
                  key={category}
                  active={selectedCategory === category}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </FilterButton>
              ))}
            </div>
            {partners.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-[#6c7788]">Parceiro</span>
                <select
                  value={selectedPartner === "todos" ? "" : String(selectedPartner)}
                  onChange={(event) =>
                    setSelectedPartner(event.target.value === "" ? "todos" : Number(event.target.value))
                  }
                  className="rounded-md border border-[#d9caa7] bg-white px-3 py-2 text-sm font-bold text-[#344055]"
                >
                  <option value="">Todos os parceiros</option>
                  {partners.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.nome_fantasia} ({partner.total_produtos})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {status && (
          <div className="mt-5 rounded-md border border-brand-gold/40 bg-brand-gold/15 px-4 py-3 text-sm font-black">
            {status}
          </div>
        )}

        {visibleProducts.length === 0 ? (
          <div className="mt-7 rounded-md border border-[#d9caa7] bg-white p-8 text-center">
            <p className="text-lg font-black text-[#344055]">Nenhuma oferta com os filtros atuais.</p>
            <p className="mt-2 text-sm font-bold text-[#6c7788]">
              Ajuste os filtros ou volte mais tarde — novos produtos sao publicados pelos parceiros.
            </p>
          </div>
        ) : (
          <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onBuy={() => buy(product)}
                onDetails={() => setStatus(product.descricao)}
              />
            ))}
          </div>
        )}
      </section>

      <OfferShelf title="Servicos mais utilizados" products={serviceProducts} onBuy={buy} />
      <OfferShelf title="Vouchers em destaque" products={voucherProducts} onBuy={buy} />
      <OfferShelf title="Beneficios com maior economia" products={biggestSavings} onBuy={buy} />

      <section id="lojas" className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-12">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#a17820]">
                Lojas proximas
              </p>
              <h2 className="mt-2 font-display text-3xl font-black sm:text-4xl">
                Pontos fisicos dos nossos parceiros
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[#5f6b7b]">
                Ative a localizacao para vermos quais lojas estao mais perto. Quando o parceiro tem
                um QR de check-in publicado, voce pode abrir a vitrine do balcao direto pelo card.
              </p>
            </div>
            {geoStatus !== "ready" && (
              <button
                type="button"
                onClick={requestLocation}
                disabled={geoStatus === "loading"}
                className="rounded-md bg-[#08111f] px-5 py-3 text-sm font-black text-white shadow-sm disabled:opacity-60"
              >
                {geoStatus === "loading" ? "Localizando..." : geoStatus === "denied" ? "Permissao negada — tentar novamente" : "Ativar localizacao"}
              </button>
            )}
          </div>

          {partnerLocations.length === 0 ? (
            <div className="mt-7 rounded-md border border-[#d9caa7] bg-[#f7f3ea] p-8 text-center text-sm font-bold text-[#5f6b7b]">
              Os parceiros ainda nao mapearam lojas fisicas.
            </div>
          ) : (
            <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedLocations.map((location) => (
                <article
                  key={location.id}
                  className="flex flex-col gap-3 rounded-md border border-[#e3d7bd] bg-[#f7f3ea] p-5 transition hover:border-brand-gold"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6c7788]">
                        {location.partner_nome}
                      </p>
                      <h3 className="mt-1 text-lg font-black leading-tight">{location.nome}</h3>
                    </div>
                    {typeof location.distance_km === "number" && (
                      <span className="rounded-md bg-white px-2 py-1 text-xs font-black text-brand-ink">
                        {location.distance_km < 1
                          ? `${Math.round(location.distance_km * 1000)} m`
                          : `${location.distance_km.toFixed(1)} km`}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-[#5f6b7b]">
                    {location.endereco ?? `${location.cidade}/${location.estado}`}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => visitLocation(location)}
                      className="rounded-md bg-brand-gold px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-brand-ink"
                    >
                      {location.checkin_token ? "Abrir vitrine" : "Ver produtos do parceiro"}
                    </button>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-[#d9caa7] bg-white px-4 py-2 text-xs font-black text-[#344055]"
                    >
                      Como chegar
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-[#08111f] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-3xl font-black">Pronto para economizar no proximo pedido?</h2>
            <p className="mt-2 text-sm font-semibold text-white/65">
              Crie sua conta, confirme seus dados e acompanhe seus vouchers e cashback.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/entrar")}
            className="rounded-md bg-brand-gold px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-brand-ink"
          >
            Criar conta
          </button>
        </div>
      </section>
    </main>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.08] p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-white/55">{label}</p>
      <strong className="mt-2 block text-xl font-black text-white">{value}</strong>
    </div>
  );
}

function Benefit({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-md border border-[#e1d2ad] bg-white p-5 shadow-soft">
      <h3 className="text-lg font-black">{title}</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-[#5f6b7b]">{text}</p>
    </article>
  );
}

function Highlight({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-md border border-[#e0e6ef] bg-[#f7f3ea] p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6c7788]">{label}</p>
      <strong className="mt-2 block text-xl font-black">{value}</strong>
    </article>
  );
}

function FilterButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-4 py-2 text-sm font-black transition ${
        active
          ? "border-[#08111f] bg-[#08111f] text-white"
          : "border-[#d9caa7] bg-white text-[#344055] hover:border-brand-gold"
      }`}
    >
      {children}
    </button>
  );
}

function offerTypeLabel(product: Product) {
  const labels: Record<string, string> = {
    produto_fisico: "Produto fisico",
    produto_digital: "Digital",
    servico: "Servico",
    voucher: "Voucher",
    beneficio_recorrente: "Beneficio",
    assinatura: "Assinatura",
    combo: "Combo"
  };

  return labels[product.offer_type ?? ""] ?? product.categoria_nome ?? product.tipo;
}

function ProductCard({
  product,
  onBuy,
  onDetails
}: {
  product: Product;
  onBuy: () => void;
  onDetails: () => void;
}) {
  return (
    <article className="group overflow-hidden rounded-md border border-[#ded4bb] bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-navy">
      <div className="relative aspect-[16/10] bg-[#dce3ee]">
        {product.imagem_url && (
          <img
            src={assetUrl(product.imagem_url)}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        )}
        <span className="absolute left-3 top-3 rounded-md bg-[#08111f] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white">
          {offerTypeLabel(product)}
        </span>
        {product.partner_nome && (
          <span className="absolute right-3 top-3 rounded-md bg-white/95 px-2 py-1 text-xs font-black text-brand-ink">
            {product.partner_nome}
          </span>
        )}
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-xl font-black leading-tight">{product.nome}</h3>
          <span className="shrink-0 rounded-md bg-green-50 px-2 py-1 text-xs font-black text-green-700">
            -{money(product.economia_estimada)}
          </span>
        </div>
        <p className="mt-3 min-h-[3rem] text-sm font-semibold leading-6 text-[#5f6b7b]">
          {product.descricao_curta}
        </p>
        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <span className="block text-sm font-bold text-[#7a8496] line-through">
              {money(product.preco_original)}
            </span>
            <strong className="text-2xl font-black">{money(product.preco_desconto)}</strong>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onBuy}
              className="rounded-md bg-brand-gold px-4 py-3 text-sm font-black text-brand-ink transition hover:bg-brand-goldLight"
            >
              Comprar agora
            </button>
            <button
              type="button"
              onClick={onDetails}
              className="rounded-md border border-[#d9caa7] px-4 py-2 text-xs font-black text-[#344055]"
            >
              Ver detalhes
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function OfferShelf({
  title,
  products,
  onBuy
}: {
  title: string;
  products: Product[];
  onBuy: (product: Product) => void;
}) {
  if (products.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-5 pb-12">
      <h2 className="font-display text-2xl font-black">{title}</h2>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={`${title}-${product.id}`} product={product} onBuy={() => onBuy(product)} onDetails={() => undefined} />
        ))}
      </div>
    </section>
  );
}

export default MarketplaceHome;
