import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { assetUrl } from "../../lib/assets";
import { getToken, marketplaceApi, money, Order, Product } from "../../lib/marketplaceApi";

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
    order: { id: number; public_code: string; voucher_code?: string } & Partial<Order>;
    payment: {
      status: string;
      status_detail?: string;
      external_reference?: string;
      qr_code_base64?: string;
      qr_code?: string;
      ticket_url?: string;
    };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    phase: "idle" | "polling" | "approved" | "rejected" | "cancelled" | "error";
    label: string;
    detail?: string | null;
    updatedAt?: string;
  }>({
    phase: "idle",
    label: "Aguardando inicio do pagamento"
  });
  const brickController = useRef<CardBrickController | null>(null);
  const pollRef = useRef<number | null>(null);

  const clearPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

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
      clearPolling();
      brickController.current?.unmount?.();
      brickController.current = null;
    };
  }, [paymentMethod, product, publicKey, result]);

  useEffect(() => () => clearPolling(), []);

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

  const normalizeStatus = (status?: string | null) => {
    if (!status) return "pending";
    if (status === "approved") return "approved";
    if (status === "rejected") return "rejected";
    if (status === "cancelled" || status === "refunded") return "cancelled";
    return "pending";
  };

  const statusLabel = (status?: string | null) => {
    const normalized = normalizeStatus(status);
    if (normalized === "approved") return "Pagamento aprovado";
    if (normalized === "rejected") return "Pagamento recusado";
    if (normalized === "cancelled") return "Pagamento cancelado";
    return "Aguardando confirmacao";
  };

  const statusDetailLabel = (status?: string | null, detail?: string | null) => {
    if (status === "approved") {
      return "Tudo certo. Seu pedido ja esta sendo liberado.";
    }
    if (status === "rejected") {
      return detail ? `Pagamento recusado: ${detail}.` : "O emissor recusou a transacao.";
    }
    if (status === "cancelled" || status === "refunded") {
      return "O pagamento foi cancelado ou estornado.";
    }
    return paymentMethod === "pix"
      ? "Assim que o Pix for compensado, liberamos o pedido automaticamente."
      : "Estamos aguardando a confirmacao final do Mercado Pago e do emissor.";
  };

  const trackCompletedPurchase = () => {
    void fetch(`${import.meta.env.VITE_API_BASE_URL ?? "/api"}/analytics/page-view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_name: "purchase_completed",
        path: `/checkout/${productId}`,
        metadata: { product_id: productId }
      })
    }).catch(() => undefined);
  };

  const applySynchronizedPayment = (order: Partial<Order> & { id: number }, payment: { paymentStatus: string; statusDetail?: string | null; voucherCode?: string | null; paidAt?: string | null }) => {
    const normalized = normalizeStatus(payment.paymentStatus);
    setResult((current) =>
      current
        ? {
            order: {
              ...current.order,
              ...order,
              voucher_code: payment.voucherCode ?? order.voucher_code ?? current.order.voucher_code
            },
            payment: {
              ...current.payment,
              status: payment.paymentStatus,
              status_detail: payment.statusDetail ?? current.payment.status_detail
            }
          }
        : current
    );
    setSyncStatus({
      phase:
        normalized === "approved"
          ? "approved"
          : normalized === "rejected"
            ? "rejected"
            : normalized === "cancelled"
              ? "cancelled"
              : "polling",
      label: statusLabel(payment.paymentStatus),
      detail: statusDetailLabel(payment.paymentStatus, payment.statusDetail),
      updatedAt: payment.paidAt ?? new Date().toISOString()
    });
    if (normalized === "approved") {
      clearPolling();
      trackCompletedPurchase();
    }
  };

  const verifyPaymentStatus = async (orderId: number, silent = false) => {
    if (!silent) {
      setSyncStatus((current) => ({
        ...current,
        phase: "polling",
        label: "Verificando pagamento..."
      }));
    }

    try {
      const sync = await marketplaceApi.getOrderPaymentStatus(orderId);
      applySynchronizedPayment(sync.order, {
        paymentStatus: sync.payment.paymentStatus,
        statusDetail: sync.payment.statusDetail,
        voucherCode: sync.payment.voucherCode,
        paidAt: sync.payment.paidAt
      });
    } catch (syncError) {
      if (!silent) {
        setSyncStatus({
          phase: "error",
          label: "Nao foi possivel atualizar agora",
          detail: syncError instanceof Error ? syncError.message : "Tente novamente em instantes.",
          updatedAt: new Date().toISOString()
        });
      }
    }
  };

  const startPolling = (orderId: number) => {
    clearPolling();
    pollRef.current = window.setInterval(() => {
      void verifyPaymentStatus(orderId, true);
    }, 4000);
  };

  const finishPayment = (response: Awaited<ReturnType<typeof marketplaceApi.processPayment>>) => {
    setResult({
      order: response.order,
      payment: {
        status: response.payment.status,
        status_detail: response.payment.status_detail,
        external_reference: response.payment.external_reference,
        qr_code_base64: response.payment.qr_code_base64,
        qr_code: response.payment.qr_code,
        ticket_url: response.payment.ticket_url
      }
    });
    const normalized = normalizeStatus(response.payment.status);
    setSyncStatus({
      phase:
        normalized === "approved"
          ? "approved"
          : normalized === "rejected"
            ? "rejected"
            : normalized === "cancelled"
              ? "cancelled"
              : "polling",
      label: statusLabel(response.payment.status),
      detail: statusDetailLabel(response.payment.status, response.payment.status_detail),
      updatedAt: new Date().toISOString()
    });
    if (normalized === "approved") {
      trackCompletedPurchase();
    } else {
      startPolling(response.order.id);
    }
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
              <div className="flex flex-col gap-3 border-b border-brand-gold/30 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-black">{syncStatus.label}</h2>
                  <span className="rounded-md bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-brand-ink">
                    Pedido {result.order.public_code}
                  </span>
                </div>
                <p className="text-sm font-semibold leading-6 text-[#5f6b7b]">
                  {syncStatus.detail}
                </p>
              </div>

              {result.payment.qr_code_base64 && (
                <img
                  src={`data:image/png;base64,${result.payment.qr_code_base64}`}
                  alt="QR Code Pix"
                  className="mt-4 h-56 w-56 rounded-md bg-white p-3"
                />
              )}
              {result.payment.qr_code && (
                <textarea
                  readOnly
                  value={result.payment.qr_code}
                  className="mt-4 h-28 w-full rounded-md border border-[#ccd5e2] p-3 text-xs"
                />
              )}
              {result.order.voucher_code && (
                <p className="mt-4 rounded-md bg-white px-3 py-2 text-sm font-black">
                  Voucher liberado: {result.order.voucher_code}
                </p>
              )}
              <div className="mt-4 grid gap-3 rounded-md bg-white/70 p-4 text-sm font-semibold text-[#425166] sm:grid-cols-2">
                <div>
                  <span className="block text-xs font-black uppercase tracking-[0.12em] text-[#6c7788]">
                    Status do pedido
                  </span>
                  <strong className="mt-1 block text-base font-black text-[#111827]">
                    {result.order.status ?? "pendente_pagamento"}
                  </strong>
                </div>
                <div>
                  <span className="block text-xs font-black uppercase tracking-[0.12em] text-[#6c7788]">
                    Metodo
                  </span>
                  <strong className="mt-1 block text-base font-black text-[#111827]">
                    {paymentMethod === "pix" ? "Pix" : paymentMethod === "credit_card" ? "Cartao de credito" : "Cartao de debito"}
                  </strong>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void verifyPaymentStatus(result.order.id)}
                  className="rounded-md bg-brand-ink px-4 py-3 text-sm font-black text-white"
                >
                  Verificar pagamento agora
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.history.pushState(null, "", "/minha-conta");
                    window.dispatchEvent(new PopStateEvent("popstate"));
                  }}
                  className="rounded-md border border-[#ccd5e2] bg-white px-4 py-3 text-sm font-black"
                >
                  Ir para minha conta
                </button>
              </div>
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
              {product.imagem_url && <img src={assetUrl(product.imagem_url)} alt="" className="aspect-[16/10] w-full rounded-md object-cover" />}
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
