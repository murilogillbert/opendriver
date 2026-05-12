import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { assetUrl } from "../../lib/assets";
import { friendlyPaymentError, getToken, marketplaceApi, money } from "../../lib/marketplaceApi";
import { Button, Card, Chip, EmptyState, Icon } from "../ui";

type CartCheckoutPageProps = {
  checkinToken?: string | null;
};

type StoredCartItem = {
  product_id: number;
  quantidade: number;
  nome: string;
  preco_desconto: number;
  imagem_url?: string | null;
};

type StoredCart = {
  token: string;
  partnerName: string;
  items: StoredCartItem[];
};

type CardFormData = {
  token?: string;
  installments?: number;
  payment_method_id?: string;
  paymentMethodId?: string;
  issuer_id?: string;
  issuerId?: string;
};

type CardBrickController = { unmount?: () => void };

type MercadoPagoInstance = {
  bricks: () => {
    create: (
      brickName: "cardPayment",
      containerId: string,
      settings: Record<string, unknown>
    ) => Promise<CardBrickController>;
  };
};

declare global {
  // Re-declared on purpose so this module compiles without depending on CheckoutPage.
  interface Window {
    MercadoPago?: new (publicKey: string, options?: Record<string, unknown>) => MercadoPagoInstance;
  }
}

const CART_STORAGE_KEY = "opendriver-cart";

const loadStoredCart = (): StoredCart | null => {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredCart;
  } catch {
    return null;
  }
};

const loadMercadoPagoScript = () =>
  new Promise<void>((resolve, reject) => {
    if (window.MercadoPago) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>("script[data-mercado-pago]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("mercado_pago_script_error")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.dataset.mercadoPago = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("mercado_pago_script_error"));
    document.head.appendChild(script);
  });

function CartCheckoutPage({ checkinToken = null }: CartCheckoutPageProps) {
  const [cart, setCart] = useState<StoredCart | null>(() => loadStoredCart());
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credit_card" | "debit_card">("pix");
  const [publicKey, setPublicKey] = useState("");
  const [cashbackBalance, setCashbackBalance] = useState(0);
  const [useCashback, setUseCashback] = useState(false);
  const [cashbackAmount, setCashbackAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof marketplaceApi.processCartPayment>> | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const brickController = useRef<CardBrickController | null>(null);

  const navigate = (path: string) => {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  useEffect(() => {
    void marketplaceApi
      .paymentConfig()
      .then((config) => setPublicKey(config.public_key ?? ""))
      .catch(() => setPublicKey(""));

    if (getToken()) {
      void marketplaceApi
        .myCashback()
        .then((summary) => setCashbackBalance(summary.balance))
        .catch(() => setCashbackBalance(0));
    }
  }, []);

  const total = useMemo(() => {
    if (!cart) return 0;
    return cart.items.reduce((sum, item) => sum + item.preco_desconto * item.quantidade, 0);
  }, [cart]);

  const maxCashback = useMemo(() => Math.min(cashbackBalance, total), [cashbackBalance, total]);
  const effectiveCashback = useCashback ? Math.min(cashbackAmount, maxCashback) : 0;
  const remainingCash = Number(Math.max(0, total - effectiveCashback).toFixed(2));
  const fullyCovered = remainingCash <= 0.0099;

  // Mount card brick when needed.
  useEffect(() => {
    if (!cart || !publicKey || paymentMethod === "pix" || result || fullyCovered) {
      return;
    }
    let cancelled = false;
    setCardReady(false);

    void loadMercadoPagoScript()
      .then(async () => {
        if (cancelled || !window.MercadoPago) return;
        brickController.current?.unmount?.();
        const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
        brickController.current = await mp.bricks().create("cardPayment", "cartCardBrick_container", {
          initialization: { amount: remainingCash || total },
          customization: {
            paymentMethods: {
              creditCard: paymentMethod === "credit_card" ? "all" : "none",
              debitCard: paymentMethod === "debit_card" ? "all" : "none",
              ticket: "none",
              bankTransfer: "none",
              mercadoPago: "none"
            }
          },
          callbacks: {
            onReady: () => setCardReady(true),
            onError: (brickError: unknown) => {
              setError(brickError instanceof Error ? brickError.message : "Erro ao carregar o cartao.");
            },
            onSubmit: (formData: CardFormData) => submitCardCart(formData)
          }
        });
      })
      .catch(() => setError("Nao foi possivel carregar o Mercado Pago."));

    return () => {
      cancelled = true;
      brickController.current?.unmount?.();
      brickController.current = null;
    };
  }, [paymentMethod, publicKey, result, fullyCovered]);

  const ensureLoggedIn = () => {
    if (getToken()) return true;
    navigate("/entrar");
    return false;
  };

  const finalize = (response: Awaited<ReturnType<typeof marketplaceApi.processCartPayment>>) => {
    setResult(response);
    // Cart was consumed — clear local storage so the user doesn't see stale items.
    window.localStorage.removeItem(CART_STORAGE_KEY);
    setCart(null);
  };

  const submitPixCart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!cart || cart.items.length === 0 || !ensureLoggedIn()) return;
    setIsSubmitting(true);
    try {
      const response = await marketplaceApi.processCartPayment({
        items: cart.items.map((item) => ({ product_id: item.product_id, quantidade: item.quantidade })),
        payment_method: "pix",
        payment_method_id: "pix",
        cashback_amount: effectiveCashback,
        checkin_token: checkinToken ?? cart.token
      });
      finalize(response);
    } catch (err) {
      setError(friendlyPaymentError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitCardCart = async (formData: CardFormData) => {
    if (!cart || !ensureLoggedIn()) {
      return Promise.reject(new Error("checkout_unavailable"));
    }
    setIsSubmitting(true);
    try {
      const response = await marketplaceApi.processCartPayment({
        items: cart.items.map((item) => ({ product_id: item.product_id, quantidade: item.quantidade })),
        payment_method: paymentMethod,
        token: formData.token,
        installments: Number(formData.installments ?? 1),
        payment_method_id: formData.payment_method_id ?? formData.paymentMethodId,
        issuer_id: formData.issuer_id ?? formData.issuerId,
        cashback_amount: effectiveCashback,
        checkin_token: checkinToken ?? cart.token
      });
      finalize(response);
      return Promise.resolve();
    } catch (err) {
      setError(friendlyPaymentError(err));
      return Promise.reject(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyPixCode = async () => {
    if (!result?.payment.qr_code) return;
    try {
      await navigator.clipboard.writeText(result.payment.qr_code);
      setCopiedPix(true);
      window.setTimeout(() => setCopiedPix(false), 2000);
    } catch {
      setCopiedPix(false);
    }
  };

  if (!cart && !result) {
    return (
      <main className="min-h-screen bg-surface px-margin-mobile py-12 text-on-surface dark:bg-dark-bg dark:text-dark-text lg:px-margin-desktop">
        <div className="mx-auto max-w-xl">
          <EmptyState
            title="Seu carrinho está vazio"
            description="Volte para a vitrine do parceiro e adicione produtos antes de finalizar."
            icon="shopping_cart"
            action={
              <Button variant="primary" leftIcon="arrow_back" onClick={() => navigate("/")}>
                Voltar para o catálogo
              </Button>
            }
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface px-margin-mobile py-8 text-on-surface dark:bg-dark-bg dark:text-dark-text lg:px-margin-desktop">
      <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_24rem]">
        <Card surface="bright" tactile rounded="3xl" padding="lg" className="space-y-4">
          <div>
            <Chip tone="accent" uppercase icon="shopping_cart">
              Checkout do carrinho
            </Chip>
            <h1 className="mt-3 font-display text-headline-md text-on-surface dark:text-dark-text">
              Confirme seu pedido
            </h1>
            {cart && (
              <p className="mt-2 text-body-md text-on-surface-variant dark:text-dark-textMuted">
                {cart.items.length} {cart.items.length === 1 ? "item" : "itens"} de {cart.partnerName}.
              </p>
            )}
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-body-sm font-bold text-danger">
              <Icon name="error" size={18} /> <span>{error}</span>
            </div>
          )}

          {result ? (
            <Card surface="default" rounded="2xl" padding="lg" className="border-accent/40 bg-accent/10 dark:border-accent/30 dark:bg-accent/10">
              <div className="flex items-center gap-2">
                {result.payment.status === "approved" ? (
                  <Icon name="check_circle" size={26} className="text-success" />
                ) : (
                  <Icon name="sync" size={22} className="animate-spin text-accent-deep" />
                )}
                <h2 className="font-display text-title-lg text-on-surface dark:text-dark-text">
                  {result.payment.status === "approved" ? "Pedido aprovado" : "Pagamento iniciado"}
                </h2>
              </div>
              <p className="mt-2 text-body-sm text-on-surface-variant dark:text-dark-textMuted">
                Carrinho {result.cart_id.slice(0, 8)} • {result.orders.length} pedidos criados • Total {money(result.total)}
              </p>
              {result.payment.qr_code_base64 && (
                <div className="mt-4 flex justify-center">
                  <img
                    src={`data:image/png;base64,${result.payment.qr_code_base64}`}
                    alt="QR Code Pix"
                    className="h-56 w-56 rounded-2xl bg-white p-3 shadow-soft"
                  />
                </div>
              )}
              {result.payment.qr_code && (
                <div className="mt-4 grid gap-2">
                  <textarea
                    readOnly
                    value={result.payment.qr_code}
                    onFocus={(event) => event.currentTarget.select()}
                    className="surface-inset h-28 w-full rounded-xl border border-transparent p-3 font-mono text-body-sm text-on-surface focus:border-accent focus:outline-none dark:text-dark-text"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={copiedPix ? "check" : "content_copy"}
                    onClick={() => void copyPixCode()}
                  >
                    {copiedPix ? "Código copiado!" : "Copiar código Pix"}
                  </Button>
                </div>
              )}
              <Button variant="primary" rightIcon="arrow_forward" className="mt-5" onClick={() => navigate("/minha-conta")}>
                Ir para minha conta
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              {cashbackBalance > 0 && (
                <Card surface="default" rounded="2xl" padding="md" className="border-accent/40 bg-accent/10 dark:border-accent/30 dark:bg-accent/10">
                  <label className="flex items-start gap-3 text-body-md font-bold text-on-surface dark:text-dark-text">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 accent-accent"
                      checked={useCashback}
                      onChange={(event) => {
                        const next = event.target.checked;
                        setUseCashback(next);
                        setCashbackAmount(next ? maxCashback : 0);
                      }}
                    />
                    <span className="flex-1">
                      <span className="flex items-center gap-2">
                        <Icon name="payments" size={18} className="text-accent-deep" />
                        Usar meu cashback (saldo {money(cashbackBalance)})
                      </span>
                      {useCashback && (
                        <span className="mt-3 grid gap-1">
                          <input
                            type="number"
                            min={0}
                            max={maxCashback}
                            step={0.01}
                            value={cashbackAmount}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              if (Number.isFinite(value)) {
                                setCashbackAmount(Math.max(0, Math.min(value, maxCashback)));
                              }
                            }}
                            className="surface-inset w-40 rounded-xl border border-transparent px-3 py-2 text-on-surface focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/25 dark:text-dark-text"
                          />
                          <span className="text-label-sm font-bold text-accent-deep dark:text-accent-soft">
                            Aplicado {money(effectiveCashback)} (máx {money(maxCashback)})
                          </span>
                        </span>
                      )}
                    </span>
                  </label>
                </Card>
              )}

              {fullyCovered ? (
                <form onSubmit={submitPixCart} className="grid gap-3">
                  <div className="flex items-center gap-2 rounded-xl bg-success/15 px-3 py-2 text-body-sm font-bold text-success">
                    <Icon name="verified" size={18} /> Cashback cobre o carrinho inteiro — sem cobrança no Mercado Pago.
                  </div>
                  <Button
                    type="submit"
                    variant="accent"
                    size="lg"
                    fullWidth
                    loading={isSubmitting}
                    leftIcon="check_circle"
                  >
                    {`Confirmar pedido (${money(effectiveCashback)} de cashback)`}
                  </Button>
                </form>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(["pix", "credit_card", "debit_card"] as const).map((method) => {
                      const active = paymentMethod === method;
                      const label = method === "pix" ? "Pix" : method === "credit_card" ? "Crédito" : "Débito";
                      const icon = method === "pix" ? "pix" : "credit_card";
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          aria-pressed={active}
                          className={`focus-ring flex items-center justify-center gap-2 rounded-pill px-4 py-3 text-label-bold transition ${
                            active
                              ? "bg-accent text-on-accent tactile-pop"
                              : "bg-surface-bright text-on-surface border border-outline-variant tactile-pop hover:border-accent dark:bg-dark-surfaceElevated dark:text-dark-text dark:border-dark-outline"
                          }`}
                        >
                          <Icon name={icon} size={18} /> {label}
                        </button>
                      );
                    })}
                  </div>
                  {effectiveCashback > 0 && (
                    <div className="flex items-start gap-2 rounded-xl bg-success/15 px-3 py-2 text-body-sm font-bold text-success">
                      <Icon name="info" size={16} /> {money(remainingCash)} pelo Mercado Pago + {money(effectiveCashback)} de cashback.
                    </div>
                  )}
                  {paymentMethod === "pix" ? (
                    <form onSubmit={submitPixCart}>
                      <Button
                        type="submit"
                        variant="accent"
                        size="lg"
                        fullWidth
                        loading={isSubmitting}
                        loadingLabel="Gerando código Pix..."
                        leftIcon="pix"
                      >
                        Gerar Pix de {money(remainingCash)}
                      </Button>
                    </form>
                  ) : publicKey ? (
                    <Card surface="inset" rounded="2xl" padding="md" className="border border-outline-variant/70 dark:border-dark-outline">
                      {!cardReady && (
                        <div className="flex items-center gap-2 text-body-sm font-bold text-on-surface-variant dark:text-dark-textMuted">
                          <Icon name="sync" size={16} className="animate-spin" /> Carregando pagamento seguro...
                        </div>
                      )}
                      <div id="cartCardBrick_container" />
                    </Card>
                  ) : (
                    <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-body-sm font-bold text-warning">
                      <Icon name="warning" size={18} /> Configure VITE / MERCADO_PAGO_PUBLIC_KEY para liberar cartão.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </Card>

        <aside>
          <Card surface="bright" tactile rounded="3xl" padding="md" className="sticky top-24 space-y-4">
            <h2 className="font-display text-title-lg text-on-surface dark:text-dark-text">Itens do carrinho</h2>
            {cart && (
              <ul className="grid gap-3">
                {cart.items.map((item) => (
                  <li key={item.product_id} className="flex items-center gap-3 rounded-2xl surface-inset p-3">
                    <div className="h-14 w-16 overflow-hidden rounded-xl bg-surface-bright dark:bg-dark-surface">
                      {item.imagem_url ? (
                        <img src={assetUrl(item.imagem_url)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-on-surface-variant dark:text-dark-textMuted">
                          <Icon name="shopping_bag" size={20} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-on-surface dark:text-dark-text">{item.nome}</p>
                      <p className="text-label-sm text-on-surface-variant dark:text-dark-textMuted">
                        {item.quantidade} × {money(item.preco_desconto)}
                      </p>
                    </div>
                    <strong className="font-display text-title-md text-on-surface dark:text-dark-text">
                      {money(item.quantidade * item.preco_desconto)}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-outline-variant/60 pt-4 dark:border-dark-outline">
              <div className="flex items-center justify-between text-body-md">
                <span className="text-on-surface-variant dark:text-dark-textMuted">Subtotal</span>
                <span className="font-bold">{money(total)}</span>
              </div>
              {effectiveCashback > 0 && (
                <div className="mt-2 flex items-center justify-between text-body-md font-bold text-success">
                  <span>Cashback aplicado</span>
                  <span>−{money(effectiveCashback)}</span>
                </div>
              )}
              <div className="mt-3 flex items-end justify-between border-t border-outline-variant/60 pt-3 dark:border-dark-outline">
                <span className="text-body-md font-bold text-on-surface dark:text-dark-text">Total a pagar</span>
                <strong className="font-display text-headline-sm text-on-surface dark:text-dark-text">
                  {money(remainingCash)}
                </strong>
              </div>
            </div>
          </Card>
        </aside>
      </section>
    </main>
  );
}

export default CartCheckoutPage;
