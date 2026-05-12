import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { getToken, marketplaceApi, money, Product } from "../../lib/marketplaceApi";
import logoUrl from "../../assets/driverhub-logo.svg";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  Input,
  MetaBar,
  ProductCard as UIProductCard,
  ProgressBar,
  SkeletonProductCard
} from "../ui";

// Lazy: Leaflet ~40 KB gzipped — only ship it when the user actually scrolls to the
// map section or lands directly on the home with locations cadastrados.
const PartnerMap = lazy(() => import("./PartnerMap").then((m) => ({ default: m.PartnerMap })));

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
  const [products, setProducts] = useState<Product[] | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerLocations, setPartnerLocations] = useState<PartnerLocation[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("todos");
  const [selectedPartner, setSelectedPartner] = useState<number | "todos">("todos");
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "denied" | "ready">("idle");
  const [locationSearch, setLocationSearch] = useState("");

  useEffect(() => {
    void fetch(`${import.meta.env.VITE_API_BASE_URL ?? "/api"}/analytics/page-view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_name: "home_view", path: "/" })
    }).catch(() => undefined);

    void marketplaceApi.products().then(setProducts).catch(() => setProducts([]));
    void marketplaceApi.partners().then(setPartners).catch(() => setPartners([]));
    void marketplaceApi.partnerLocations().then(setPartnerLocations).catch(() => setPartnerLocations([]));
  }, []);

  const loaded = products !== null;
  const productList = products ?? [];

  const categories = useMemo(
    () => Array.from(new Set(productList.map((product) => product.categoria_nome).filter(Boolean))) as string[],
    [productList]
  );

  const visibleProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return productList.filter((product) => {
      if (selectedCategory !== "todos" && product.categoria_nome !== selectedCategory) return false;
      if (selectedPartner !== "todos" && Number(product.partner_id) !== Number(selectedPartner)) return false;
      if (term.length > 0) {
        const haystack = `${product.nome} ${product.descricao_curta ?? ""} ${product.partner_nome ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [productList, selectedCategory, selectedPartner, searchTerm]);

  const featuredProducts = useMemo(
    () =>
      [...visibleProducts]
        .sort((a, b) => (b.destaque_home ? 1 : 0) - (a.destaque_home ? 1 : 0))
        .slice(0, 6),
    [visibleProducts]
  );
  const serviceProducts = visibleProducts.filter((product) => product.offer_type === "servico").slice(0, 3);
  const voucherProducts = visibleProducts.filter((product) => product.offer_type === "voucher").slice(0, 3);
  const biggestSavings = useMemo(
    () =>
      [...visibleProducts]
        .sort((a, b) => Number(b.economia_estimada) - Number(a.economia_estimada))
        .slice(0, 3),
    [visibleProducts]
  );
  const flashDeals = useMemo(
    () =>
      [...productList]
        .filter((p) => Number(p.preco_original) > Number(p.preco_desconto))
        .sort((a, b) => {
          const da = (Number(a.preco_original) - Number(a.preco_desconto)) / Math.max(Number(a.preco_original), 1);
          const db = (Number(b.preco_original) - Number(b.preco_desconto)) / Math.max(Number(b.preco_original), 1);
          return db - da;
        })
        .slice(0, 2),
    [productList]
  );

  // Aggregated metrics from real catalog data — no mock numbers.
  const totalEconomyMonth = productList.reduce(
    (sum, product) => sum + Number(product.economia_mensal_estimada ?? 0),
    0
  );
  const averageEconomy = productList.length > 0 ? totalEconomyMonth / productList.length : 0;
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

  const filteredLocations = useMemo<PartnerLocation[]>(() => {
    const term = locationSearch.trim().toLowerCase();
    const filtered = term
      ? partnerLocations.filter((loc) =>
          `${loc.nome} ${loc.partner_nome} ${loc.endereco ?? ""} ${loc.cidade} ${loc.estado}`
            .toLowerCase()
            .includes(term)
        )
      : partnerLocations;
    if (!userPosition) return filtered.slice(0, 10);
    return filtered
      .map((loc) => ({
        ...loc,
        distance_km: haversineKm(userPosition.lat, userPosition.lng, Number(loc.latitude), Number(loc.longitude))
      }))
      .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity))
      .slice(0, 10);
  }, [partnerLocations, userPosition, locationSearch]);

  const visitLocation = (location: PartnerLocation) => {
    if (location.checkin_token) {
      navigate(`/c/${location.checkin_token}`);
      return;
    }
    setSelectedPartner(location.partner_id);
    document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="min-h-screen bg-surface text-on-surface transition-colors dark:bg-dark-bg dark:text-dark-text">
      <SiteHeader navigate={navigate} />

      {/* ── HERO — dark cinematic with floating glass cards ───────────────── */}
      <section className="relative isolate overflow-hidden bg-hero-blobs px-margin-mobile pb-32 pt-24 text-inverse-on-surface md:pt-32 lg:px-margin-desktop lg:pb-40">
        {/* Animated colour blobs behind hero copy */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-[12%] top-[18%] h-[420px] w-[420px] animate-pulse-soft rounded-full bg-accent/40 blur-[140px]" />
          <div className="absolute right-[8%] top-[28%] h-[520px] w-[520px] animate-pulse-soft rounded-full bg-indigo-700/30 blur-[160px]" style={{ animationDelay: "1.6s" }} />
        </div>
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-7">
            <Chip tone="ghost" uppercase icon="star" className="border-white/20 text-accent-soft">
              Clube DriverHub · Benefícios premium
            </Chip>
            <h1 className="font-display text-display-lg leading-[1.02] tracking-[-0.035em] text-white sm:text-display-xl">
              Benefícios reais,<br />parceiros de verdade.
            </h1>
            <p className="max-w-xl text-body-lg text-white/70">
              Vouchers, produtos com desconto, cashback e vantagens recorrentes. Filtre por categoria
              ou parceiro e descubra as lojas mais próximas de você.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                variant="accent"
                size="lg"
                rightIcon="arrow_forward"
                onClick={() => document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" })}
              >
                Ver produtos
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="border-white/30 text-white hover:bg-white/10 dark:border-white/30"
                onClick={() => navigate(getToken() ? "/minha-conta" : "/entrar")}
                leftIcon="account_circle"
              >
                {getToken() ? "Minha conta" : "Começar agora"}
              </Button>
            </div>
          </div>

          {/* Savings widget — glass card with progress bars */}
          <div className="glass-card relative overflow-hidden rounded-3xl p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-accent/30 blur-3xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-label-sm uppercase text-white/60">Economia mensal somada</p>
                <p className="mt-2 font-display text-display-lg leading-none text-white">
                  <span className="gradient-text">{money(totalEconomyMonth)}</span>
                </p>
              </div>
              <Chip tone="inverse" size="sm" uppercase className="bg-white text-brand-ink">
                <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-success" /> ao vivo
              </Chip>
            </div>
            <div className="mt-6 space-y-4">
              {categories.slice(0, 5).map((category) => {
                const categoryEconomy = productList
                  .filter((product) => product.categoria_nome === category)
                  .reduce((sum, product) => sum + Number(product.economia_mensal_estimada ?? 0), 0);
                const max = totalEconomyMonth > 0 ? totalEconomyMonth : 1;
                return (
                  <ProgressBar
                    key={category}
                    value={(categoryEconomy / max) * 100}
                    label={category}
                    hint={money(categoryEconomy)}
                    tone="accent"
                  />
                );
              })}
              {categories.length === 0 && (
                <p className="text-body-sm text-white/70">Nenhuma categoria publicada ainda.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── QUICK STATS — slide out from the hero ─────────────────────────── */}
      <section className="relative z-20 -mt-20 px-margin-mobile lg:px-margin-desktop">
        <div className="mx-auto max-w-7xl">
          <MetaBar
            items={[
              { label: "Ofertas no catálogo", value: loaded ? String(productList.length) : "—" },
              { label: "Parceiros ativos", value: loaded ? String(partners.length) : "—" },
              {
                label: "Economia média por oferta",
                value: loaded ? money(averageEconomy) : "—"
              },
              { label: "Lojas físicas mapeadas", value: loaded ? String(partnerLocations.length) : "—" }
            ]}
          />
        </div>
      </section>

      {/* ── CATEGORIES — 4-up circular icons ──────────────────────────────── */}
      <section id="beneficios" className="px-margin-mobile py-16 lg:px-margin-desktop lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col gap-2">
            <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
              Categorias do clube
            </p>
            <h2 className="font-display text-headline-lg text-on-surface dark:text-dark-text">
              Tudo o que o motorista usa todo mês.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CategoryTile
              icon="confirmation_number"
              title="Vouchers"
              text="Combustível, alimentação, farmácia e viagens com desconto fixo."
            />
            <CategoryTile
              icon="shopping_bag"
              title="Produtos"
              text="Itens físicos e digitais com preço DriverHub."
            />
            <CategoryTile
              icon="build"
              title="Serviços"
              text="Lavagem, óleo, guincho e assistência presencial."
            />
            <CategoryTile
              icon="payments"
              title="Cashback"
              text="Retorno acumulado para reusar em compras e benefícios."
            />
          </div>
        </div>
      </section>

      {/* ── FLASH DEALS — 2 large feature cards ───────────────────────────── */}
      {flashDeals.length > 0 && (
        <section className="border-y border-outline-variant/40 bg-surface-container-low px-margin-mobile py-16 dark:border-dark-outline dark:bg-dark-surface lg:px-margin-desktop lg:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
              <div className="max-w-2xl space-y-2">
                <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
                  Ofertas relâmpago
                </p>
                <h2 className="font-display text-headline-lg text-on-surface dark:text-dark-text">
                  Comece pelos descontos que mais pesam no mês.
                </h2>
              </div>
              <Button
                variant="secondary"
                rightIcon="arrow_forward"
                onClick={() => document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" })}
              >
                Ver todos os produtos
              </Button>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {flashDeals.map((product) => (
                <UIProductCard
                  key={product.id}
                  product={product}
                  onBuy={buy}
                  onDetails={() => setStatus(product.descricao)}
                  variant="feature"
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CATALOG with filters + search ─────────────────────────────────── */}
      <section id="catalogo" className="px-margin-mobile py-16 lg:px-margin-desktop lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
                Catálogo completo
              </p>
              <h2 className="mt-1 font-display text-headline-lg text-on-surface dark:text-dark-text">
                Encontre a oferta certa para você.
              </h2>
            </div>
            <div className="w-full max-w-sm">
              <Input
                placeholder="Buscar por nome, descrição ou parceiro"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                leftIcon="search"
                aria-label="Buscar no catálogo"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterChip active={selectedCategory === "todos"} onClick={() => setSelectedCategory("todos")}>
              Todas
            </FilterChip>
            {categories.map((category) => (
              <FilterChip
                key={category}
                active={selectedCategory === category}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </FilterChip>
            ))}
            {partners.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
                  Parceiro
                </span>
                <select
                  value={selectedPartner === "todos" ? "" : String(selectedPartner)}
                  onChange={(event) =>
                    setSelectedPartner(event.target.value === "" ? "todos" : Number(event.target.value))
                  }
                  className="surface-inset rounded-xl border border-transparent bg-surface-container px-3 py-2 text-body-sm font-bold text-on-surface focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/25 dark:bg-dark-surface dark:text-dark-text"
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

          {status && (
            <Card surface="bright" rounded="xl" padding="md" className="mt-5 border-accent/40 bg-accent/10 text-on-surface dark:text-dark-text">
              <div className="flex items-start gap-3">
                <Icon name="info" size={20} className="text-accent-deep" />
                <p className="flex-1 text-body-md">{status}</p>
                <button type="button" onClick={() => setStatus(null)} aria-label="Fechar">
                  <Icon name="close" size={18} />
                </button>
              </div>
            </Card>
          )}

          <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {!loaded ? (
              Array.from({ length: 6 }).map((_, idx) => <SkeletonProductCard key={idx} />)
            ) : visibleProducts.length === 0 ? (
              <div className="sm:col-span-2 xl:col-span-3">
                <EmptyState
                  title="Nenhuma oferta com esses filtros"
                  description="Ajuste os filtros ou volte mais tarde — novos produtos são publicados pelos parceiros toda semana."
                  icon="search"
                  action={
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSelectedCategory("todos");
                        setSelectedPartner("todos");
                        setSearchTerm("");
                      }}
                    >
                      Limpar filtros
                    </Button>
                  }
                />
              </div>
            ) : (
              featuredProducts.map((product) => (
                <UIProductCard
                  key={product.id}
                  product={product}
                  onBuy={buy}
                  onDetails={() => setStatus(product.descricao)}
                />
              ))
            )}
          </div>
        </div>
      </section>

      <OfferShelf title="Serviços mais utilizados" hint="Manutenção, lavagem e assistência presencial" products={serviceProducts} onBuy={buy} />
      <OfferShelf title="Vouchers em destaque" hint="Resgate na hora ou direto no caixa do parceiro" products={voucherProducts} onBuy={buy} />
      <OfferShelf title="Benefícios com maior economia" hint="O dinheiro de volta mais alto do clube" products={biggestSavings} onBuy={buy} />

      {/* ── LOCATIONS HUB — sidebar + map preview ─────────────────────────── */}
      <section id="lojas" className="bg-surface-container-low px-margin-mobile py-16 dark:bg-dark-surface lg:px-margin-desktop lg:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-2">
              <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
                Lojas próximas
              </p>
              <h2 className="font-display text-headline-lg text-on-surface dark:text-dark-text">
                Pontos físicos dos nossos parceiros
              </h2>
              <p className="text-body-md text-on-surface-variant dark:text-dark-textMuted">
                Ative a localização para vermos quais lojas estão mais perto. Quando o parceiro tem QR de check-in, você pode abrir a vitrine direto pelo card.
              </p>
            </div>
            {geoStatus !== "ready" ? (
              <Button
                variant="primary"
                leftIcon="my_location"
                loading={geoStatus === "loading"}
                onClick={requestLocation}
              >
                {geoStatus === "denied" ? "Permissão negada — tentar de novo" : "Ativar localização"}
              </Button>
            ) : (
              <Chip tone="success" icon="check_circle">
                Localização ativa
              </Chip>
            )}
          </div>

          {partnerLocations.length === 0 ? (
            <EmptyState
              title="Nenhum ponto físico mapeado ainda"
              description="Os parceiros estão cadastrando suas lojas. Volte em breve."
              icon="storefront"
            />
          ) : (
            <Card surface="bright" rounded="3xl" padding="none" tactile className="overflow-hidden">
              <div className="grid gap-0 lg:grid-cols-[24rem_1fr]">
                <aside className="border-b border-outline-variant/60 bg-surface-container-low p-6 dark:border-dark-outline dark:bg-dark-surfaceElevated lg:border-b-0 lg:border-r">
                  <Input
                    placeholder="Buscar por cidade, CEP ou parceiro"
                    leftIcon="search"
                    value={locationSearch}
                    onChange={(event) => setLocationSearch(event.target.value)}
                    aria-label="Buscar lojas"
                  />
                  <ul className="custom-scrollbar mt-4 flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1">
                    {filteredLocations.map((location) => (
                      <li key={location.id}>
                        <button
                          type="button"
                          onClick={() => visitLocation(location)}
                          className="group/loc tactile-pop tactile-pressed w-full rounded-xl border border-outline-variant/70 bg-surface-bright p-4 text-left transition hover:border-accent dark:border-dark-outline dark:bg-dark-surface"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
                                {location.partner_nome}
                              </p>
                              <p className="mt-1 font-display text-title-md text-on-surface dark:text-dark-text">
                                {location.nome}
                              </p>
                            </div>
                            {typeof location.distance_km === "number" ? (
                              <Chip tone="accent" size="sm">
                                {location.distance_km < 1
                                  ? `${Math.round(location.distance_km * 1000)} m`
                                  : `${location.distance_km.toFixed(1)} km`}
                              </Chip>
                            ) : null}
                          </div>
                          <p className="mt-2 text-body-sm text-on-surface-variant dark:text-dark-textMuted">
                            {location.endereco ?? `${location.cidade}/${location.estado}`}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {location.checkin_token ? (
                              <Chip tone="success" size="sm" icon="qr_code_2">
                                Check-in QR
                              </Chip>
                            ) : null}
                            <Chip tone="ghost" size="sm" icon="chevron_right">
                              {location.checkin_token ? "Abrir vitrine" : "Ver produtos"}
                            </Chip>
                          </div>
                        </button>
                      </li>
                    ))}
                    {filteredLocations.length === 0 && (
                      <li className="rounded-xl border border-dashed border-outline-variant/60 p-4 text-body-sm text-on-surface-variant dark:border-dark-outline dark:text-dark-textMuted">
                        Nenhuma loja com essa busca.
                      </li>
                    )}
                  </ul>
                </aside>

                <div className="relative min-h-[24rem] overflow-hidden bg-inverse-surface lg:min-h-[28rem]">
                  <Suspense
                    fallback={
                      <div className="flex h-full w-full items-center justify-center gap-3 text-inverse-on-surface">
                        <Icon name="sync" size={20} className="animate-spin" /> Carregando mapa...
                      </div>
                    }
                  >
                    <PartnerMap
                      locations={filteredLocations}
                      userPosition={userPosition}
                      onSelect={(loc) => {
                        const original = partnerLocations.find((p) => p.id === loc.id);
                        if (original) visitLocation(original);
                      }}
                    />
                  </Suspense>
                </div>
              </div>
            </Card>
          )}
        </div>
      </section>

      {/* ── FINAL CTA banner ───────────────────────────────────────────────── */}
      <section className="bg-inverse-surface px-margin-mobile py-12 text-inverse-on-surface lg:px-margin-desktop lg:py-16">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-label-sm uppercase text-white/60">Pronto para começar?</p>
            <h2 className="font-display text-headline-md text-white sm:text-headline-lg">
              Crie sua conta e ative seu cashback no próximo pedido.
            </h2>
            <p className="max-w-xl text-body-md text-white/70">
              Sem mensalidade, sem letra miúda. Você usa o que precisa e vê quanto economizou no painel.
            </p>
          </div>
          <Button variant="accent" size="lg" leftIcon="person" onClick={() => navigate("/entrar")}>
            Criar conta
          </Button>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

// ── Local helpers ──────────────────────────────────────────────────────────

function SiteHeader({ navigate }: { navigate: (path: string) => void }) {
  const authed = Boolean(getToken());
  return (
    <header className="sticky top-0 z-40 border-b border-outline-variant/50 bg-surface/85 backdrop-blur-md dark:border-dark-outline dark:bg-dark-bg/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-margin-mobile lg:px-margin-desktop">
        <button type="button" onClick={() => navigate("/")} className="flex items-center gap-3" aria-label="Ir para a home">
          <img src={logoUrl} alt="DriverHub" className="h-10 w-auto max-w-[11rem] object-contain" />
        </button>
        <nav className="hidden items-center gap-1 md:flex">
          <a href="#beneficios" className="rounded-pill px-3 py-2 text-body-sm font-bold text-on-surface-variant transition hover:text-on-surface dark:text-dark-textMuted dark:hover:text-dark-text">Benefícios</a>
          <a href="#catalogo" className="rounded-pill px-3 py-2 text-body-sm font-bold text-on-surface-variant transition hover:text-on-surface dark:text-dark-textMuted dark:hover:text-dark-text">Produtos</a>
          <a href="#lojas" className="rounded-pill px-3 py-2 text-body-sm font-bold text-on-surface-variant transition hover:text-on-surface dark:text-dark-textMuted dark:hover:text-dark-text">Lojas</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button
            variant={authed ? "secondary" : "primary"}
            size="sm"
            leftIcon={authed ? "account_circle" : "person"}
            onClick={() => navigate(authed ? "/minha-conta" : "/entrar")}
          >
            {authed ? "Minha conta" : "Entrar"}
          </Button>
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-surface-container px-margin-mobile py-12 dark:bg-dark-surfaceElevated lg:px-margin-desktop">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div>
          <img src={logoUrl} alt="DriverHub" className="h-10 w-auto max-w-[11rem] object-contain" />
          <p className="mt-4 text-body-sm text-on-surface-variant dark:text-dark-textMuted">
            © {new Date().getFullYear()} DriverHub. Benefícios para motoristas profissionais no Brasil.
          </p>
        </div>
        {[
          { title: "Plataforma", links: [["#beneficios", "Benefícios"], ["#catalogo", "Produtos"], ["#lojas", "Lojas físicas"]] },
          { title: "Suporte", links: [["#", "Central de ajuda"], ["#", "Falar com a gente"], ["#", "Status"]] },
          { title: "Legal", links: [["#", "Política de privacidade"], ["#", "Termos de uso"], ["#", "Segurança"]] }
        ].map((col) => (
          <div key={col.title}>
            <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map(([href, label]) => (
                <li key={label}>
                  <a href={href} className="text-body-md text-on-surface transition hover:text-accent-deep dark:text-dark-text dark:hover:text-accent-soft">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}

function CategoryTile({ icon, title, text }: { icon: import("../ui").IconName; title: string; text: string }) {
  return (
    <Card surface="bright" tactile padding="lg" rounded="2xl" className="group transition hover:-translate-y-1">
      <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-accent/15 text-accent-deep transition group-hover:bg-accent group-hover:text-on-accent dark:bg-accent/20 dark:text-accent-soft">
        <Icon name={icon} size={24} />
      </div>
      <h3 className="mt-5 font-display text-title-lg text-on-surface dark:text-dark-text">{title}</h3>
      <p className="mt-2 text-body-sm text-on-surface-variant dark:text-dark-textMuted">{text}</p>
    </Card>
  );
}

function FilterChip({
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
      aria-pressed={active}
      className={`focus-ring rounded-pill px-4 py-2 text-label-sm font-bold transition ${
        active
          ? "bg-primary text-on-primary tactile-pop tactile-pressed dark:bg-white dark:text-brand-ink"
          : "bg-surface-bright text-on-surface border border-outline-variant tactile-pressed hover:bg-surface-container dark:bg-dark-surfaceElevated dark:text-dark-text dark:border-dark-outline"
      }`}
    >
      {children}
    </button>
  );
}

function OfferShelf({
  title,
  hint,
  products,
  onBuy
}: {
  title: string;
  hint?: string;
  products: Product[];
  onBuy: (product: Product) => void;
}) {
  if (products.length === 0) return null;

  return (
    <section className="px-margin-mobile py-12 lg:px-margin-desktop">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-headline-md text-on-surface dark:text-dark-text">{title}</h2>
            {hint ? (
              <p className="mt-1 text-body-sm text-on-surface-variant dark:text-dark-textMuted">{hint}</p>
            ) : null}
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <UIProductCard key={product.id} product={product} onBuy={onBuy} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default MarketplaceHome;
