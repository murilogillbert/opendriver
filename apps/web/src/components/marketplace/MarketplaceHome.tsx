import { useEffect, useMemo, useState } from "react";

import { assetUrl } from "../../lib/assets";
import { getToken, marketplaceApi, money, Product } from "../../lib/marketplaceApi";
import logoUrl from "../../assets/open-driver-logo.svg";

const savingsItems = [
  { label: "Combustivel", value: 180 },
  { label: "Alimentacao", value: 120 },
  { label: "Farmacia", value: 80 },
  { label: "Apps e cursos", value: 90 },
  { label: "Viagens e auto", value: 130 }
];

const fallbackProducts: Product[] = [
  {
    id: 1,
    nome: "Voucher Combustivel R$100",
    slug: "voucher-combustivel-100",
    descricao_curta: "Credito digital para abastecer em parceiros selecionados.",
    descricao: "Use o voucher em postos parceiros e reduza o custo mensal com abastecimento.",
    tipo: "digital",
    tipo_entrega: "digital",
    offer_type: "voucher",
    delivery_method: "digital",
    preco_original: 100,
    preco_desconto: 90,
    economia_estimada: 10,
    economia_mensal_estimada: 180,
    categoria_nome: "Combustivel",
    imagem_url:
      "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=80",
    destaque_home: true,
    status: "ativo"
  },
  {
    id: 2,
    nome: "Clube Farmacia",
    slug: "clube-farmacia",
    descricao_curta: "Beneficio recorrente para medicamentos, higiene e saude.",
    descricao: "Acesso a descontos recorrentes em farmacias parceiras para compras do mes.",
    tipo: "digital",
    tipo_entrega: "digital",
    offer_type: "beneficio_recorrente",
    delivery_method: "digital",
    preco_original: 49,
    preco_desconto: 19,
    economia_estimada: 30,
    economia_mensal_estimada: 80,
    categoria_nome: "Farmacia",
    imagem_url:
      "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=900&q=80",
    destaque_home: true,
    status: "ativo"
  },
  {
    id: 3,
    nome: "Kit Limpeza Automotiva",
    slug: "kit-limpeza-automotiva",
    descricao_curta: "Produtos fisicos para manter o carro limpo gastando menos.",
    descricao: "Kit com itens essenciais de limpeza automotiva enviado para o endereco cadastrado.",
    tipo: "fisico",
    tipo_entrega: "fisico",
    offer_type: "produto_fisico",
    delivery_method: "fisica",
    preco_original: 129,
    preco_desconto: 89,
    economia_estimada: 40,
    economia_mensal_estimada: 40,
    categoria_nome: "Automotivo",
    imagem_url:
      "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=900&q=80",
    destaque_home: true,
    status: "ativo"
  }
];

function MarketplaceHome() {
  const [products, setProducts] = useState<Product[]>(fallbackProducts);
  const [selectedCategory, setSelectedCategory] = useState("todos");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${import.meta.env.VITE_API_BASE_URL ?? "/api"}/analytics/page-view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_name: "home_view", path: "/" })
    }).catch(() => undefined);

    void marketplaceApi
      .products()
      .then((data) => setProducts(data.length > 0 ? data : fallbackProducts))
      .catch(() => setProducts(fallbackProducts));
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.categoria_nome).filter(Boolean))),
    [products]
  );

  const visibleProducts = useMemo(
    () =>
      selectedCategory === "todos"
        ? products
        : products.filter((product) => product.categoria_nome === selectedCategory),
    [products, selectedCategory]
  );

  const featuredProducts = visibleProducts.slice(0, 6);
  const serviceProducts = products.filter((product) => product.offer_type === "servico").slice(0, 3);
  const voucherProducts = products.filter((product) => product.offer_type === "voucher").slice(0, 3);
  const biggestSavings = [...products]
    .sort((a, b) => Number(b.economia_estimada) - Number(a.economia_estimada))
    .slice(0, 3);
  const totalSavings = savingsItems.reduce((sum, item) => sum + item.value, 0);

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

  return (
    <main className="min-h-screen bg-[#f7f3ea] text-[#101722]">
      <header className="sticky top-0 z-40 border-b border-[#d8caa9]/70 bg-[#f7f3ea]/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5">
          <button type="button" onClick={() => navigate("/")} className="flex items-center gap-3">
            <img src={logoUrl} alt="Open Driver" className="h-10 w-auto" />
            <span className="hidden text-sm font-black uppercase tracking-[0.16em] text-[#263242] sm:inline">
              Open Driver
            </span>
          </button>
          <nav className="flex items-center gap-2">
            <a href="#beneficios" className="hidden px-3 py-2 text-sm font-black text-[#465366] sm:inline">
              Beneficios
            </a>
            <a href="#catalogo" className="hidden px-3 py-2 text-sm font-black text-[#465366] sm:inline">
              Produtos
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
              Beneficios reais para economizar R$600 ou mais por mes.
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-white/76">
              Vouchers, produtos com desconto, cashback e vantagens recorrentes em combustivel,
              farmacia, alimentacao, automotivo, viagens e produtos digitais.
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
              <HeroMetric label="Economia alvo" value={money(totalSavings)} />
              <HeroMetric label="Entrega digital" value="imediata" />
              <HeroMetric label="Categorias" value="10+" />
            </div>
          </div>

          <aside className="rounded-md border border-white/10 bg-white/[0.08] p-5 shadow-navy backdrop-blur">
            <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-bold text-white/60">Simulacao mensal</p>
                <strong className="mt-2 block text-4xl font-black text-brand-gold">
                  {money(totalSavings)}
                </strong>
              </div>
              <span className="rounded-md bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-brand-ink">
                novo alvo
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {savingsItems.map((item) => (
                <div key={item.label} className="grid grid-cols-[7.5rem_1fr_4.6rem] items-center gap-3">
                  <span className="text-sm font-black text-white/80">{item.label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="block h-full rounded-full bg-brand-gold"
                      style={{ width: `${Math.min((item.value / 180) * 100, 100)}%` }}
                    />
                  </span>
                  <span className="text-right text-sm font-black">{money(item.value)}</span>
                </div>
              ))}
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
          <Highlight title="Economia media mensal" value="R$600+" />
          <Highlight title="Mais comprados" value={products[0]?.nome ?? "Combustivel"} />
          <Highlight title="Servicos utilizados" value={serviceProducts[0]?.nome ?? "Lavagem"} />
          <Highlight title="Economia dos usuarios" value={money(products.reduce((sum, product) => sum + Number(product.economia_mensal_estimada ?? 0), 0))} />
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
          <div className="flex flex-wrap gap-2">
            <FilterButton active={selectedCategory === "todos"} onClick={() => setSelectedCategory("todos")}>
              Todos
            </FilterButton>
            {categories.map((category) => (
              <FilterButton
                key={category}
                active={selectedCategory === category}
                onClick={() => setSelectedCategory(category ?? "todos")}
              >
                {category}
              </FilterButton>
            ))}
          </div>
        </div>

        {status && (
          <div className="mt-5 rounded-md border border-brand-gold/40 bg-brand-gold/15 px-4 py-3 text-sm font-black">
            {status}
          </div>
        )}

        <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} onBuy={() => buy(product)} onDetails={() => setStatus(product.descricao)} />
          ))}
        </div>
      </section>

      <OfferShelf title="Servicos mais utilizados" products={serviceProducts} onBuy={buy} />
      <OfferShelf title="Vouchers em destaque" products={voucherProducts} onBuy={buy} />
      <OfferShelf title="Beneficios com maior economia" products={biggestSavings} onBuy={buy} />

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#a17820]">
              Comparativo
            </p>
            <h2 className="mt-2 font-display text-3xl font-black">
              Antes era desconto isolado. Agora e economia recorrente.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <CompareCard title="Sem Opendriver" value="R$0" text="Gastos sem acompanhamento, sem beneficios acumulados e sem historico de economia." />
            <CompareCard title="Com Opendriver" value="R$600+" text="Vouchers, produtos, cashback e economia acumulada na area do usuario." highlighted />
          </div>
        </div>
      </section>

      <section className="bg-[#08111f] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-3xl font-black">Pronto para economizar no proximo pedido?</h2>
            <p className="mt-2 text-sm font-semibold text-white/65">
              Crie sua conta, confirme seus dados e acompanhe seus vouchers.
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

function Highlight({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-md border border-[#e0e6ef] bg-[#f7f3ea] p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6c7788]">{title}</p>
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

function ProductCard({ product, onBuy, onDetails }: { product: Product; onBuy: () => void; onDetails: () => void }) {
  return (
    <article className="group overflow-hidden rounded-md border border-[#ded4bb] bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-navy">
      <div className="relative aspect-[16/10] bg-[#dce3ee]">
        {product.imagem_url && (
          <img src={assetUrl(product.imagem_url)} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        )}
        <span className="absolute left-3 top-3 rounded-md bg-[#08111f] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white">
          {offerTypeLabel(product)}
        </span>
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
  if (products.length === 0) {
    return null;
  }

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

function CompareCard({
  title,
  value,
  text,
  highlighted = false
}: {
  title: string;
  value: string;
  text: string;
  highlighted?: boolean;
}) {
  return (
    <article className={`rounded-md border p-5 ${highlighted ? "border-brand-gold bg-[#08111f] text-white" : "border-[#e0e6ef] bg-[#f7f3ea]"}`}>
      <p className={`text-xs font-black uppercase tracking-[0.16em] ${highlighted ? "text-brand-gold" : "text-[#6c7788]"}`}>
        {title}
      </p>
      <strong className="mt-3 block text-3xl font-black">{value}</strong>
      <p className={`mt-2 text-sm font-semibold leading-6 ${highlighted ? "text-white/68" : "text-[#5f6b7b]"}`}>
        {text}
      </p>
    </article>
  );
}

export default MarketplaceHome;
