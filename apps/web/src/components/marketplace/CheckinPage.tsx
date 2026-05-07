import { useEffect, useMemo, useState } from "react";

import { assetUrl } from "../../lib/assets";
import { CheckinPageData, marketplaceApi, money } from "../../lib/marketplaceApi";

type CheckinPageProps = {
  token: string;
};

type CartItem = {
  product_id: number;
  quantidade: number;
  nome: string;
  preco_desconto: number;
  imagem_url?: string | null;
};

const CART_STORAGE_KEY = "opendriver-cart";

type StoredCart = {
  token: string;
  partnerName: string;
  items: CartItem[];
};

function loadStoredCart(): StoredCart | null {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredCart;
  } catch {
    return null;
  }
}

function persistCart(cart: StoredCart | null) {
  if (!cart || cart.items.length === 0) {
    window.localStorage.removeItem(CART_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

function CheckinPage({ token }: CheckinPageProps) {
  const [data, setData] = useState<CheckinPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>(() => {
    const stored = loadStoredCart();
    return stored && stored.token === token ? stored.items : [];
  });

  useEffect(() => {
    let cancelled = false;
    marketplaceApi
      .loadCheckin(token)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        marketplaceApi.trackCheckin(token).catch(() => undefined);
        // If the stored cart is from a different QR, reset it.
        const stored = loadStoredCart();
        if (stored && stored.token !== token) {
          setItems([]);
          window.localStorage.removeItem(CART_STORAGE_KEY);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "checkin_not_found");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Persist cart on every change so the user can navigate to login/auth and come back.
  useEffect(() => {
    if (!data) return;
    persistCart(
      items.length === 0
        ? null
        : { token, partnerName: data.partner.nome, items }
    );
  }, [items, data, token]);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.preco_desconto * item.quantidade, 0),
    [items]
  );
  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantidade, 0), [items]);

  const setQuantity = (productId: number, quantidade: number, product?: CheckinPageData["products"][number]) => {
    setItems((current) => {
      if (quantidade <= 0) return current.filter((item) => item.product_id !== productId);
      const existing = current.find((item) => item.product_id === productId);
      if (existing) {
        return current.map((item) =>
          item.product_id === productId ? { ...item, quantidade } : item
        );
      }
      if (!product) return current;
      return [
        ...current,
        {
          product_id: productId,
          quantidade,
          nome: product.nome,
          preco_desconto: Number(product.preco_desconto),
          imagem_url: product.imagem_url ?? null
        }
      ];
    });
  };

  const goCheckout = () => {
    if (items.length === 0) return;
    window.history.pushState(null, "", `/checkout/cart?c=${encodeURIComponent(token)}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  if (error) {
    return (
      <main className="min-h-screen bg-[#f6f8fb] px-5 py-10 text-[#111827]">
        <section className="mx-auto max-w-xl rounded-md border border-red-200 bg-red-50 p-6">
          <h1 className="font-display text-2xl font-black text-red-800">QR code indisponivel</h1>
          <p className="mt-2 text-sm font-bold text-red-700">
            Este check-in expirou ou esta pausado. Procure um atendente do parceiro.
          </p>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#f6f8fb] px-5 py-10 text-[#111827]">
        <p className="mx-auto max-w-xl text-sm font-bold text-[#68748a]">Carregando ofertas do parceiro...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 pb-32 pt-8 text-[#111827]">
      <section className="mx-auto max-w-3xl">
        <header className="rounded-md border border-[#dfe5ef] bg-white p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-gold">Check-in Open Driver</p>
          <h1 className="mt-2 font-display text-3xl font-black">{data.partner.nome}</h1>
          <p className="mt-2 text-sm font-semibold text-[#68748a]">
            {data.location?.nome ?? `${data.partner.cidade}/${data.partner.estado}`}
            {data.location?.endereco ? ` — ${data.location.endereco}` : ""}
          </p>
          {data.qrcode.label && (
            <p className="mt-3 inline-block rounded-md bg-brand-gold/20 px-3 py-1 text-xs font-black text-brand-ink">
              {data.qrcode.label}
            </p>
          )}
          <p className="mt-4 text-sm font-bold text-[#425166]">
            Monte seu pedido: adicione varios itens ao carrinho e finalize numa unica compra com cashback.
          </p>
        </header>

        <ul className="mt-6 grid gap-4">
          {data.products.length === 0 ? (
            <li className="rounded-md border border-[#dfe5ef] bg-white p-6 text-sm font-bold text-[#68748a]">
              Nenhuma oferta vinculada a este check-in ainda.
            </li>
          ) : (
            data.products.map((product) => {
              const cartItem = items.find((item) => item.product_id === product.id);
              const quantidade = cartItem?.quantidade ?? 0;
              return (
                <li key={product.id} className="rounded-md border border-[#dfe5ef] bg-white p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="h-24 w-32 overflow-hidden rounded-md bg-[#e6ebf2]">
                      {product.imagem_url && (
                        <img src={assetUrl(product.imagem_url)} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h2 className="font-black text-lg">{product.nome}</h2>
                      <p className="mt-1 text-sm font-semibold text-[#68748a]">{product.descricao_curta}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                        <span className="line-through text-[#7a8496] font-bold">{money(product.preco_original)}</span>
                        <strong className="text-xl font-black">{money(product.preco_desconto)}</strong>
                        {product.cashback_percent != null && product.cashback_percent > 0 && (
                          <span className="rounded-md bg-brand-gold/20 px-2 py-1 text-xs font-black text-brand-ink">
                            +{product.cashback_percent}% cashback
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {quantidade > 0 ? (
                        <div className="flex items-center gap-2 rounded-md border border-brand-gold bg-brand-gold/10 px-2 py-1">
                          <button
                            type="button"
                            onClick={() => setQuantity(product.id, quantidade - 1, product)}
                            className="h-8 w-8 rounded-md bg-white text-lg font-black text-brand-ink"
                          >
                            −
                          </button>
                          <strong className="min-w-6 text-center text-base font-black">{quantidade}</strong>
                          <button
                            type="button"
                            onClick={() => setQuantity(product.id, quantidade + 1, product)}
                            className="h-8 w-8 rounded-md bg-white text-lg font-black text-brand-ink"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setQuantity(product.id, 1, product)}
                          className="rounded-md bg-brand-gold px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-brand-ink"
                        >
                          Adicionar
                        </button>
                      )}
                      {quantidade > 0 && (
                        <span className="text-xs font-bold text-[#5f6b7b]">
                          Subtotal: {money(quantidade * product.preco_desconto)}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>

      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[#dfe5ef] bg-white shadow-[0_-12px_24px_rgba(8,17,31,0.08)]">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6c7788]">
                Carrinho ({itemCount} {itemCount === 1 ? "item" : "itens"})
              </p>
              <strong className="mt-1 block text-2xl font-black">{money(total)}</strong>
            </div>
            <button
              type="button"
              onClick={goCheckout}
              className="rounded-md bg-brand-ink px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-white"
            >
              Finalizar compra
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default CheckinPage;
