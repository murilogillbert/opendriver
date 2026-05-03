import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { getToken, marketplaceApi, money, Product } from "../../lib/marketplaceApi";

type CheckoutPageProps = {
  productId: number;
};

type CardFormData = {
  token?: string;
  installments?: number;
  payment_method_id?: string;
  paymentMethodId?: string;
  issuer_id?: string;
  issuerId?: string;
};

type CardBrickController = {
  unmount?: () => void;
};

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
  interface Window {
    MercadoPago?: new (publicKey: string, options?: Record<string, unknown>) => MercadoPagoInstance;
  }
}

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

function CheckoutPage({ productId }: CheckoutPageProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credit_card" | "debit_card">("pix");
  const [publicKey, setPublicKey] = useState("");
  const [result, setResult] = useState<{
    status: string;
    qr_code_base64?: string;
    qr_code?: string;
    voucher_code?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const brickController = useRef<CardBrickController | null>(null);

  useEffect(() => {
    void marketplaceApi
      .products()
      .then((products) => setProduct(products.find((item) => item.id === productId) ?? null))
      .catch(() => setProduct(null));

    void marketplaceApi
      .paymentConfig()
      .then((config) => setPublicKey(config.public_key ?? ""))
      .catch(() => setPublicKey(""));
  }, [productId]);

  useEffect(() => {
    if (!product || !publicKey || paymentMethod === "pix" || result) {
      return;
    }

    let cancelled = false;
    setCardReady(false);
    setError(null);

    void loadMercadoPagoScript()
      .then(async () => {
        if (cancelled || !window.MercadoPago) return;

        brickController.current?.unmount?.();
        const mercadoPago = new window.MercadoPago(publicKey, { locale: "pt-BR" });
        const bricksBuilder = mercadoPago.bricks();

        brickController.current = await bricksBuilder.create("cardPayment", "cardPaymentBrick_container", {
          initialization: {
            amount: Number(product.preco_desconto)
          },
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
              setError(brickError instanceof Error ? brickError.message : "Erro ao carregar o formulario do cartao.");
            },
            onSubmit: (formData: CardFormData) =>
              processCardPayment(formData)
          }
        });
      })
      .catch(() => setError("Nao foi possivel carregar o Mercado Pago."));

    return () => {
      cancelled = true;
      brickController.current?.unmount?.();
      brickController.current = null;
    };
  }, [paymentMethod, product, publicKey, result]);

  const delivery = useMemo(() => {
    if (!product) return "-";
    if (product.delivery_method === "presencial") return "Presencial";
    if (product.delivery_method === "fisica") return "Fisica";
    return "Digital";
  }, [product]);

  const ensureLoggedIn = () => {
    if (getToken()) return true;
    window.history.pushState(null, "", "/entrar");
    window.dispatchEvent(new PopStateEvent("popstate"));
    return false;
  };

  const finishPayment = (response: Awaited<ReturnType<typeof marketplaceApi.processPayment>>) => {
    setResult({
      status: response.payment.status,
      qr_code_base64: response.payment.qr_code_base64,
      qr_code: response.payment.qr_code,
      voucher_code: response.order.voucher_code
    });
  };

  const processCardPayment = async (formData: CardFormData) => {
    if (!ensureLoggedIn() || !product) {
      return Promise.reject(new Error("checkout_unavailable"));
    }

    try {
      const response = await marketplaceApi.processPayment({
        product_id: product.id,
        payment_method: paymentMethod,
        token: formData.token,
        installments: Number(formData.installments ?? 1),
        payment_method_id: formData.payment_method_id ?? formData.paymentMethodId,
        issuer_id: formData.issuer_id ?? formData.issuerId
      });
      finishPayment(response);
      return Promise.resolve();
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Nao foi possivel processar o pagamento.");
      return Promise.reject(paymentError);
    }
  };

  const submitPixPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!ensureLoggedIn()) return;

    if (!product) {
      setError("Oferta indisponivel.");
      return;
    }

    try {
      const response = await marketplaceApi.processPayment({
        product_id: product.id,
        payment_method: "pix",
        payment_method_id: "pix"
      });
      finishPayment(response);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Nao foi possivel processar o pagamento.");
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#111827]">
      <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_26rem]">
        <div className="rounded-md border border-[#dfe5ef] bg-white p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-gold">Checkout</p>
          <h1 className="mt-2 font-display text-3xl font-black">Confirme seus dados e pagamento</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-[#68748a]">
            Produtos digitais, servicos presenciais e vouchers exigem cadastro completo com endereco.
          </p>

          {error && (
            <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          {result ? (
            <div className="mt-6 rounded-md border border-brand-gold/40 bg-brand-gold/10 p-5">
              <h2 className="text-xl font-black">Pagamento {result.status}</h2>
              {result.qr_code_base64 && (
                <img
                  src={`data:image/png;base64,${result.qr_code_base64}`}
                  alt="QR Code Pix"
                  className="mt-4 h-56 w-56 rounded-md bg-white p-3"
                />
              )}
              {result.qr_code && (
                <textarea
                  readOnly
                  value={result.qr_code}
                  className="mt-4 h-28 w-full rounded-md border border-[#ccd5e2] p-3 text-xs"
                />
              )}
              {result.voucher_code && (
                <p className="mt-4 rounded-md bg-white px-3 py-2 text-sm font-black">
                  Voucher liberado: {result.voucher_code}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
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

              {paymentMethod === "pix" ? (
                <form onSubmit={submitPixPayment}>
                  <button className="w-full rounded-md bg-brand-gold px-5 py-4 text-sm font-black uppercase tracking-[0.14em] text-brand-ink">
                    Gerar Pix copia e cola
                  </button>
                </form>
              ) : publicKey ? (
                <div className="rounded-md border border-[#dfe5ef] p-4">
                  {!cardReady && <p className="text-sm font-bold text-[#68748a]">Carregando pagamento seguro...</p>}
                  <div id="cardPaymentBrick_container" />
                </div>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                  Configure VITE/MERCADO_PAGO_PUBLIC_KEY para liberar cartao.
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="rounded-md border border-[#dfe5ef] bg-white p-5">
          {product ? (
            <>
              {product.imagem_url && <img src={product.imagem_url} alt="" className="aspect-[16/10] w-full rounded-md object-cover" />}
              <h2 className="mt-4 text-xl font-black">{product.nome}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#68748a]">{product.descricao_curta}</p>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <span className="block text-sm font-bold text-[#7a8496] line-through">{money(product.preco_original)}</span>
                  <strong className="text-2xl font-black">{money(product.preco_desconto)}</strong>
                </div>
                <span className="rounded-md bg-green-50 px-2 py-1 text-xs font-black text-green-700">
                  {money(product.economia_estimada)} economia
                </span>
              </div>
              <p className="mt-4 text-sm font-bold">Entrega: {delivery}</p>
              {product.delivery_deadline && <p className="mt-2 text-sm font-bold">Prazo: {product.delivery_deadline}</p>}
              {product.usage_rules && <p className="mt-2 text-sm font-semibold text-[#68748a]">{product.usage_rules}</p>}
            </>
          ) : (
            <p className="font-bold text-[#68748a]">Carregando oferta...</p>
          )}
        </aside>
      </section>
    </main>
  );
}

export default CheckoutPage;
