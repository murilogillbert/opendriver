import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { assetUrl } from "../../lib/assets";
import { friendlyPaymentError, getToken, marketplaceApi, money } from "../../lib/marketplaceApi";

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
      <main className="min-h-screen bg-[#f6f8fb] px-5 py-10 text-[#111827]">
        <section className="mx-auto max-w-xl rounded-md border border-[#dfe5ef] bg-white p-6">
          <h1 className="font-display text-2xl font-black">Seu carrinho esta vazio</h1>
          <p className="mt-2 text-sm font-bold text-[#68748a]">
            Volte para a vitrine do parceiro e adicione produtos antes de finalizar.
          </p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-4 rounded-md bg-brand-ink px-4 py-3 text-sm font-black text-white"
          >
            Voltar para o catalogo
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#111827]">
      <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_26rem]">
        <div className="rounded-md border border-[#dfe5ef] bg-white p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-gold">Checkout do carrinho</p>
          <h1 className="mt-2 font-display text-3xl font-black">Confirme seu pedido</h1>
          {cart && (
            <p className="mt-2 text-sm font-semibold text-[#68748a]">
              {cart.items.length} {cart.items.length === 1 ? "item" : "itens"} de {cart.partnerName}.
            </p>
          )}

          {error && (
            <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          {result ? (
            <div className="mt-6 rounded-md border border-brand-gold/40 bg-brand-gold/10 p-5">
              <h2 className="text-xl font-black">
                {result.payment.status === "approved" ? "Pedido aprovado" : "Pagamento iniciado"}
              </h2>
              <p className="mt-2 text-sm font-bold text-[#5a3f00]">
                Carrinho {result.cart_id.slice(0, 8)} • {result.orders.length} pedidos criados • Total {money(result.total)}
              </p>
              {result.payment.qr_code_base64 && (
                <img
                  src={`data:image/png;base64,${result.payment.qr_code_base64}`}
                  alt="QR Code Pix"
                  className="mt-4 h-56 w-56 rounded-md bg-white p-3"
                />
              )}
              {result.payment.qr_code && (
                <div className="mt-4 grid gap-2">
                  <textarea
                    readOnly
                    value={result.payment.qr_code}
                    onFocus={(event) => event.currentTarget.select()}
                    className="h-28 w-full rounded-md border border-[#ccd5e2] p-3 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void copyPixCode()}
                    className="rounded-md border border-brand-gold bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-brand-ink"
                  >
                    {copiedPix ? "Codigo copiado!" : "Copiar codigo Pix"}
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => navigate("/minha-conta")}
                className="mt-5 rounded-md bg-brand-ink px-4 py-3 text-sm font-black text-white"
              >
                Ir para minha conta
              </button>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {cashbackBalance > 0 && (
                <div className="rounded-md border border-brand-gold/40 bg-brand-gold/10 p-4">
                  <label className="flex items-start gap-3 text-sm font-bold">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={useCashback}
                      onChange={(event) => {
                        const next = event.target.checked;
                        setUseCashback(next);
                        setCashbackAmount(next ? maxCashback : 0);
                      }}
                    />
                    <span className="flex-1">
                      Usar meu cashback (saldo: {money(cashbackBalance)}).
                      {useCashback && (
                        <span className="mt-2 grid gap-2">
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
                            className="w-32 rounded-md border border-[#ccd5e2] px-3 py-2"
                          />
                          <span className="text-xs font-semibold text-[#5a3f00]">
                            Aplicado: {money(effectiveCashback)} (max {money(maxCashback)}).
                          </span>
                        </span>
                      )}
                    </span>
                  </label>
                </div>
              )}

              {fullyCovered ? (
                <form onSubmit={submitPixCart}>
                  <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
                    Cashback cobre o carrinho inteiro. Sem cobranca no Mercado Pago.
                  </p>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full rounded-md bg-emerald-600 px-5 py-4 text-sm font-black uppercase tracking-[0.14em] text-white disabled:opacity-60"
                  >
                    {isSubmitting ? "Confirmando..." : `Confirmar pedido (${money(effectiveCashback)} de cashback)`}
                  </button>
                </form>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(["pix", "credit_card", "debit_card"] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`rounded-md border px-4 py-3 text-sm font-black ${
                          paymentMethod === method ? "border-brand-gold bg-brand-gold text-brand-ink" : "border-[#ccd5e2] bg-white"
                        }`}
                      >
                        {method === "pix" ? "Pix" : method === "credit_card" ? "Credito" : "Debito"}
                      </button>
                    ))}
                  </div>
                  {effectiveCashback > 0 && (
                    <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900">
                      {money(remainingCash)} pelo Mercado Pago + {money(effectiveCashback)} de cashback.
                    </p>
                  )}
                  {paymentMethod === "pix" ? (
                    <form onSubmit={submitPixCart}>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full rounded-md bg-brand-gold px-5 py-4 text-sm font-black uppercase tracking-[0.14em] text-brand-ink disabled:opacity-60"
                      >
                        {isSubmitting ? "Gerando codigo Pix..." : `Gerar Pix de ${money(remainingCash)}`}
                      </button>
                    </form>
                  ) : publicKey ? (
                    <div className="rounded-md border border-[#dfe5ef] p-4">
                      {!cardReady && <p className="text-sm font-bold text-[#68748a]">Carregando pagamento seguro...</p>}
                      <div id="cartCardBrick_container" />
                    </div>
                  ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                      Configure VITE/MERCADO_PAGO_PUBLIC_KEY para liberar cartao.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <aside className="rounded-md border border-[#dfe5ef] bg-white p-5">
          <h2 className="text-lg font-black">Itens do carrinho</h2>
          {cart && (
            <ul className="mt-4 grid gap-3">
              {cart.items.map((item) => (
                <li key={item.product_id} className="flex items-center gap-3 rounded-md bg-[#f8fafc] p-3">
                  <div className="h-12 w-16 overflow-hidden rounded-md bg-[#e6ebf2]">
                    {item.imagem_url && (
                      <img src={assetUrl(item.imagem_url)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black">{item.nome}</p>
                    <p className="text-xs font-bold text-[#68748a]">
                      {item.quantidade} × {money(item.preco_desconto)}
                    </p>
                  </div>
                  <strong className="text-sm font-black">{money(item.quantidade * item.preco_desconto)}</strong>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 border-t border-[#edf1f6] pt-4">
            <div className="flex items-center justify-between text-sm font-bold">
              <span>Subtotal</span>
              <span>{money(total)}</span>
            </div>
            {effectiveCashback > 0 && (
              <div className="mt-2 flex items-center justify-between text-sm font-bold text-emerald-700">
                <span>Cashback aplicado</span>
                <span>−{money(effectiveCashback)}</span>
              </div>
            )}
            <div className="mt-3 flex items-end justify-between border-t border-[#edf1f6] pt-3">
              <span className="text-sm font-black">Total a pagar</span>
              <strong className="text-2xl font-black">{money(remainingCash)}</strong>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default CartCheckoutPage;
