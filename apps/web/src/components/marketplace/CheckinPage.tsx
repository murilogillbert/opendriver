import { useEffect, useMemo, useState } from "react";

import { assetUrl } from "../../lib/assets";
import { CheckinPageData, marketplaceApi, money } from "../../lib/marketplaceApi";
import { Button, Card, Chip, EmptyState, Icon, Skeleton } from "../ui";

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

  useEffect(() => {
    if (!data) return;
    persistCart(items.length === 0 ? null : { token, partnerName: data.partner.nome, items });
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
        return current.map((item) => (item.product_id === productId ? { ...item, quantidade } : item));
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
      <main className="min-h-screen bg-surface px-margin-mobile py-12 text-on-surface dark:bg-dark-bg dark:text-dark-text lg:px-margin-desktop">
        <div className="mx-auto max-w-xl">
          <EmptyState
            tone="warning"
            icon="warning"
            title="QR code indisponível"
            description="Este check-in expirou ou está pausado. Procure um atendente do parceiro para gerar um novo."
          />
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-surface px-margin-mobile py-12 text-on-surface dark:bg-dark-bg dark:text-dark-text lg:px-margin-desktop">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton height={120} rounded="2xl" />
          <Skeleton height={140} rounded="2xl" />
          <Skeleton height={140} rounded="2xl" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface px-margin-mobile pb-32 pt-8 text-on-surface dark:bg-dark-bg dark:text-dark-text lg:px-margin-desktop">
      <div className="mx-auto max-w-3xl">
        <Card surface="bright" tactile rounded="3xl" padding="lg" className="relative isolate overflow-hidden">
          <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-accent/20 blur-3xl" />
          <Chip tone="accent" uppercase icon="qr_code_2">
            Check-in DriverHub
          </Chip>
          <h1 className="mt-4 font-display text-headline-md text-on-surface dark:text-dark-text">
            {data.partner.nome}
          </h1>
          <p className="mt-2 flex items-center gap-2 text-body-md text-on-surface-variant dark:text-dark-textMuted">
            <Icon name="location_on" size={18} />
            {data.location?.nome ?? `${data.partner.cidade}/${data.partner.estado}`}
            {data.location?.endereco ? ` — ${data.location.endereco}` : ""}
          </p>
          {data.qrcode.label && (
            <Chip tone="ghost" className="mt-3">
              {data.qrcode.label}
            </Chip>
          )}
          <p className="mt-4 text-body-md text-on-surface dark:text-dark-text">
            Monte seu pedido: adicione vários itens ao carrinho e finalize numa única compra com cashback.
          </p>
        </Card>

        <ul className="mt-6 grid gap-4">
          {data.products.length === 0 ? (
            <li>
              <EmptyState
                title="Nenhuma oferta vinculada"
                description="Este check-in ainda não tem produtos cadastrados."
                icon="shopping_bag"
              />
            </li>
          ) : (
            data.products.map((product) => {
              const cartItem = items.find((item) => item.product_id === product.id);
              const quantidade = cartItem?.quantidade ?? 0;
              return (
                <li key={product.id}>
                  <Card surface="bright" tactile rounded="2xl" padding="md">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="h-24 w-32 overflow-hidden rounded-xl surface-inset">
                        {product.imagem_url ? (
                          <img
                            src={assetUrl(product.imagem_url)}
                            alt={product.nome}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-on-surface-variant dark:text-dark-textMuted">
                            <Icon name="shopping_bag" size={28} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h2 className="font-display text-title-md text-on-surface dark:text-dark-text">{product.nome}</h2>
                        <p className="mt-1 text-body-sm text-on-surface-variant dark:text-dark-textMuted">
                          {product.descricao_curta}
                        </p>
                        <div className="mt-2 flex flex-wrap items-baseline gap-3">
                          <span className="text-label-sm text-on-surface-variant line-through dark:text-dark-textMuted">
                            {money(product.preco_original)}
                          </span>
                          <strong className="font-display text-title-lg text-on-surface dark:text-dark-text">
                            {money(product.preco_desconto)}
                          </strong>
                          {product.cashback_percent != null && product.cashback_percent > 0 && (
                            <Chip tone="accent" size="sm" icon="payments">
                              +{product.cashback_percent}% cashback
                            </Chip>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {quantidade > 0 ? (
                          <div className="flex items-center gap-2 rounded-pill border border-accent/40 bg-accent/10 p-1">
                            <button
                              type="button"
                              onClick={() => setQuantity(product.id, quantidade - 1, product)}
                              className="focus-ring h-9 w-9 rounded-pill bg-surface-bright text-title-md font-black text-on-surface dark:bg-dark-surfaceElevated dark:text-dark-text"
                              aria-label="Diminuir"
                            >
                              −
                            </button>
                            <strong className="min-w-6 text-center font-display text-title-md">{quantidade}</strong>
                            <button
                              type="button"
                              onClick={() => setQuantity(product.id, quantidade + 1, product)}
                              className="focus-ring h-9 w-9 rounded-pill bg-surface-bright text-title-md font-black text-on-surface dark:bg-dark-surfaceElevated dark:text-dark-text"
                              aria-label="Aumentar"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <Button variant="accent" size="sm" leftIcon="shopping_cart" onClick={() => setQuantity(product.id, 1, product)}>
                            Adicionar
                          </Button>
                        )}
                        {quantidade > 0 && (
                          <span className="text-label-sm text-on-surface-variant dark:text-dark-textMuted">
                            Subtotal {money(quantidade * product.preco_desconto)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-outline-variant bg-surface/95 backdrop-blur dark:border-dark-outline dark:bg-dark-bg/95">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-margin-mobile py-4 sm:flex-row sm:items-center sm:justify-between lg:px-margin-desktop">
            <div>
              <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
                Carrinho ({itemCount} {itemCount === 1 ? "item" : "itens"})
              </p>
              <strong className="mt-1 block font-display text-headline-sm text-on-surface dark:text-dark-text">
                {money(total)}
              </strong>
            </div>
            <Button variant="primary" size="lg" rightIcon="arrow_forward" onClick={goCheckout}>
              Finalizar compra
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

export default CheckinPage;
