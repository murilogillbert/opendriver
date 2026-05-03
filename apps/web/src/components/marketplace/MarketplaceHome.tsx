import { FormEvent, useEffect, useMemo, useState } from "react";

import { getToken, marketplaceApi, money, Product } from "../../lib/marketplaceApi";

const savingsItems = [
  { label: "Combustivel", value: 180 },
  { label: "Alimentacao", value: 120 },
  { label: "Farmacia", value: 80 },
  { label: "Apps e cursos", value: 90 },
  { label: "Viagens e auto", value: 130 }
];

function MarketplaceHome() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("todos");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void marketplaceApi.products().then(setProducts).catch(() => setProducts([]));
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

  const totalSavings = savingsItems.reduce((sum, item) => sum + item.value, 0);

  const buy = async (product: Product) => {
    if (!getToken()) {
      window.history.pushState(null, "", "/entrar");
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }

    const deliveryType = product.tipo_entrega === "fisico" ? "fisico" : "digital";

    try {
      await marketplaceApi.createOrder(product.id, deliveryType);
      setStatus(`Pedido confirmado. Voce economizou ${money(product.economia_estimada)}.`);
    } catch {
      setStatus("Nao foi possivel concluir o pedido agora.");
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-[#111827]">
      <section className="bg-[#08111f] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-gold">
              Clube de economia Opendriver
            </p>
            <h1 className="mt-4 font-display text-4xl font-black leading-tight sm:text-6xl">
              Economize R$600 ou mais por mes em gastos que voce ja tem.
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-semibold leading-8 text-white/72">
              Vouchers, produtos com desconto, cashback e beneficios recorrentes em combustivel,
              alimentacao, farmacia, automotivo, viagens e produtos digitais.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#catalogo" className="rounded-md bg-brand-gold px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-brand-ink">
                Ver beneficios
              </a>
              <button
                type="button"
                onClick={() => {
                  window.history.pushState(null, "", "/entrar");
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }}
                className="rounded-md border border-white/20 px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-white"
              >
                Minha conta
              </button>
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-white/[0.06] p-5">
            <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-bold text-white/60">Simulacao mensal</p>
                <strong className="mt-2 block text-4xl font-black text-brand-gold">
                  {money(totalSavings)}
                </strong>
              </div>
              <span className="rounded-md bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-brand-ink">
                meta nova
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {savingsItems.map((item) => (
                <div key={item.label} className="grid grid-cols-[8rem_1fr_4.5rem] items-center gap-3">
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
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="grid gap-4 md:grid-cols-3">
          <Proof label="Economia media alvo" value="R$600/mês" />
          <Proof label="Categorias essenciais" value="10+" />
          <Proof label="Entrega digital" value="imediata" />
        </div>
      </section>

      <section id="catalogo" className="mx-auto max-w-7xl px-5 pb-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-gold">
              Vitrine
            </p>
            <h2 className="mt-2 font-display text-3xl font-black">Produtos e vouchers</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory("todos")}
              className={`rounded-md px-4 py-2 text-sm font-black ${selectedCategory === "todos" ? "bg-brand-ink text-white" : "bg-white"}`}
            >
              Todos
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category ?? "todos")}
                className={`rounded-md px-4 py-2 text-sm font-black ${selectedCategory === category ? "bg-brand-ink text-white" : "bg-white"}`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {status && (
          <div className="mt-5 rounded-md border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-sm font-black">
            {status}
          </div>
        )}

        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleProducts.map((product) => (
            <article key={product.id} className="overflow-hidden rounded-md border border-[#dfe5ef] bg-white">
              <div className="aspect-[16/10] bg-[#dce3ee]">
                {product.imagem_url && (
                  <img src={product.imagem_url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-md bg-[#edf2f7] px-2 py-1 text-xs font-black uppercase text-[#516075]">
                    {product.categoria_nome ?? product.tipo}
                  </span>
                  <span className="text-sm font-black text-green-700">
                    Economize {money(product.economia_estimada)}
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-black">{product.nome}</h3>
                <p className="mt-2 min-h-[3rem] text-sm font-semibold leading-6 text-[#596579]">
                  {product.descricao_curta}
                </p>
                <div className="mt-5 flex items-end justify-between gap-4">
                  <div>
                    <span className="block text-sm font-bold text-[#7a8496] line-through">
                      {money(product.preco_original)}
                    </span>
                    <strong className="text-2xl font-black">{money(product.preco_desconto)}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => buy(product)}
                    className="rounded-md bg-brand-gold px-4 py-3 text-sm font-black text-brand-ink"
                  >
                    Resgatar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Proof({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#dfe5ef] bg-white p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#68748a]">{label}</p>
      <strong className="mt-2 block text-2xl font-black">{value}</strong>
    </div>
  );
}

export default MarketplaceHome;
