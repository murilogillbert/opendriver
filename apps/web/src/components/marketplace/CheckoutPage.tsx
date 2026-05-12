import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { assetUrl } from "../../lib/assets";
import { friendlyPaymentError, getToken, marketplaceApi, money, Order, Product } from "../../lib/marketplaceApi";
import { Button, Card, Chip, Icon, Skeleton } from "../ui";

type CheckoutPageProps = {
  productId: number;
  checkinToken?: string | null;
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

function CheckoutPage({ productId, checkinToken = null }: CheckoutPageProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credit_card" | "debit_card">("pix");
  const [publicKey, setPublicKey] = useState("");
  const [cashbackBalance, setCashbackBalance] = useState(0);
  const [useCashback, setUseCashback] = useState(false);
  const [cashbackAmount, setCashbackAmount] = useState(0);
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
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
      .product(productId)
      .then((found) => setProduct(found))
      .catch(() => setProduct(null));

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
  }, [productId]);

  // Cap the cashback request at min(balance, price). Triggered when the user toggles or edits.
  const maxCashback = useMemo(() => {
    if (!product) return 0;
    return Math.min(cashbackBalance, Number(product.preco_desconto));
  }, [product, cashbackBalance]);

  const effectiveCashback = useCashback ? Math.min(cashbackAmount, maxCashback) : 0;
  const remainingCash = product
    ? Number(Math.max(0, Number(product.preco_desconto) - effectiveCashback).toFixed(2))
    : 0;
  const fullyCovered = product ? remainingCash <= 0.0099 : false;

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
            amount: remainingCash || Number(product.preco_desconto)
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
      setIsVerifying(true);
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
          detail: friendlyPaymentError(syncError, "Tente novamente em instantes."),
          updatedAt: new Date().toISOString()
        });
      }
    } finally {
      if (!silent) setIsVerifying(false);
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

    setIsSubmitting(true);
    try {
      const response = await marketplaceApi.processPayment({
        product_id: product.id,
        payment_method: paymentMethod,
        token: formData.token,
        installments: Number(formData.installments ?? 1),
        payment_method_id: formData.payment_method_id ?? formData.paymentMethodId,
        issuer_id: formData.issuer_id ?? formData.issuerId,
        cashback_amount: effectiveCashback,
        checkin_token: checkinToken
      });
      finishPayment(response);
      return Promise.resolve();
    } catch (paymentError) {
      setError(friendlyPaymentError(paymentError));
      return Promise.reject(paymentError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitPixPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (isSubmitting || !ensureLoggedIn()) return;

    if (!product) {
      setError("Oferta indisponivel.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await marketplaceApi.processPayment({
        product_id: product.id,
        payment_method: "pix",
        payment_method_id: "pix",
        cashback_amount: effectiveCashback,
        checkin_token: checkinToken
      });
      finishPayment(response);
    } catch (paymentError) {
      setError(friendlyPaymentError(paymentError));
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
      // Clipboard API may be unavailable (insecure context); leave the textarea so the user can select manually.
      setCopiedPix(false);
    }
  };

  const goToAccount = () => {
    window.history.pushState(null, "", "/minha-conta");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const methodLabel =
    paymentMethod === "pix" ? "Pix" : paymentMethod === "credit_card" ? "Cartão de crédito" : "Cartão de débito";

  return (
    <main className="min-h-screen bg-surface px-margin-mobile py-8 text-on-surface dark:bg-dark-bg dark:text-dark-text lg:px-margin-desktop">
      <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_24rem]">
        <Card surface="bright" tactile rounded="3xl" padding="lg" className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Chip tone="accent" uppercase icon="credit_card">
                Checkout
              </Chip>
              <h1 className="mt-3 font-display text-headline-md text-on-surface dark:text-dark-text">
                Confirme seus dados e pagamento
              </h1>
              <p className="mt-2 text-body-md text-on-surface-variant dark:text-dark-textMuted">
                Produtos digitais, serviços presenciais e vouchers exigem cadastro completo com endereço.
              </p>
            </div>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-body-sm font-bold text-danger">
              <Icon name="error" size={18} /> <span>{error}</span>
            </div>
          )}

          {result ? (
            <Card surface="default" rounded="2xl" padding="lg" className="border-accent/40 bg-accent/10 dark:border-accent/30 dark:bg-accent/10">
              <div className="flex flex-col gap-3 border-b border-accent/30 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {syncStatus.phase === "approved" ? (
                      <Icon name="check_circle" size={26} className="text-success" />
                    ) : syncStatus.phase === "rejected" || syncStatus.phase === "cancelled" ? (
                      <Icon name="error" size={26} className="text-danger" />
                    ) : (
                      <Icon name="sync" size={22} className="animate-spin text-accent-deep" />
                    )}
                    <h2 className="font-display text-title-lg text-on-surface dark:text-dark-text">
                      {syncStatus.label}
                    </h2>
                  </div>
                  <Chip tone="inverse" uppercase>
                    Pedido {result.order.public_code}
                  </Chip>
                </div>
                <p className="text-body-sm text-on-surface-variant dark:text-dark-textMuted">{syncStatus.detail}</p>
              </div>

              {result.payment.qr_code_base64 && (
                <div className="mt-5 flex justify-center">
                  <img
                    src={`data:image/png;base64,${result.payment.qr_code_base64}`}
                    alt="QR Code Pix"
                    className="h-56 w-56 rounded-2xl bg-white p-3 shadow-soft"
                  />
                </div>
              )}
              {result.payment.qr_code && (
                <div className="mt-4 space-y-2">
                  <label className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
                    Pix copia e cola
                  </label>
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
              {result.order.voucher_code && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-success/15 px-3 py-2 text-body-md font-bold text-success">
                  <Icon name="verified" size={18} /> Voucher liberado: {result.order.voucher_code}
                </div>
              )}
              <div className="mt-4 grid gap-3 rounded-xl bg-surface-bright/70 p-4 sm:grid-cols-2 dark:bg-dark-surface/60">
                <div>
                  <span className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
                    Status do pedido
                  </span>
                  <p className="mt-1 font-display text-title-md text-on-surface dark:text-dark-text">
                    {result.order.status ?? "pendente_pagamento"}
                  </p>
                </div>
                <div>
                  <span className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
                    Método
                  </span>
                  <p className="mt-1 font-display text-title-md text-on-surface dark:text-dark-text">
                    {methodLabel}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  leftIcon="sync"
                  loading={isVerifying}
                  onClick={() => void verifyPaymentStatus(result.order.id)}
                >
                  Verificar pagamento agora
                </Button>
                <Button variant="secondary" rightIcon="arrow_forward" onClick={goToAccount}>
                  Ir para minha conta
                </Button>
              </div>
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
                <form onSubmit={submitPixPayment} className="grid gap-3">
                  <div className="flex items-center gap-2 rounded-xl bg-success/15 px-3 py-2 text-body-sm font-bold text-success">
                    <Icon name="verified" size={18} /> Cashback cobre o pedido inteiro — sem cobrança no Mercado Pago.
                  </div>
                  <Button
                    type="submit"
                    variant="accent"
                    size="lg"
                    fullWidth
                    loading={isSubmitting}
                    leftIcon="check_circle"
                  >
                    {`Confirmar pedido com cashback (${money(effectiveCashback)})`}
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
                          <Icon name={icon} size={18} />
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {effectiveCashback > 0 && (
                    <div className="flex items-start gap-2 rounded-xl bg-success/15 px-3 py-2 text-body-sm font-bold text-success">
                      <Icon name="info" size={16} /> Pagará {money(remainingCash)} pelo Mercado Pago e {money(effectiveCashback)} sai do cashback.
                    </div>
                  )}

                  {paymentMethod === "pix" ? (
                    <form onSubmit={submitPixPayment}>
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
                      <div id="cardPaymentBrick_container" />
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
          <Card surface="bright" tactile rounded="3xl" padding="md" className="sticky top-24 space-y-3">
            {product ? (
              <>
                {product.imagem_url && (
                  <div className="surface-inset overflow-hidden rounded-2xl">
                    <img
                      src={assetUrl(product.imagem_url)}
                      alt={product.nome}
                      loading="lazy"
                      decoding="async"
                      className="aspect-[16/10] w-full object-cover"
                    />
                  </div>
                )}
                <Chip tone="ghost" uppercase>{product.partner_nome ?? "DriverHub"}</Chip>
                <h2 className="font-display text-title-lg text-on-surface dark:text-dark-text">{product.nome}</h2>
                <p className="text-body-sm text-on-surface-variant dark:text-dark-textMuted">{product.descricao_curta}</p>
                <div className="flex items-end justify-between border-t border-outline-variant/60 pt-3 dark:border-dark-outline">
                  <div>
                    {Number(product.preco_original) > Number(product.preco_desconto) && (
                      <span className="block text-label-sm text-on-surface-variant line-through dark:text-dark-textMuted">
                        {money(product.preco_original)}
                      </span>
                    )}
                    <strong className="font-display text-headline-sm text-on-surface dark:text-dark-text">
                      {money(product.preco_desconto)}
                    </strong>
                  </div>
                  {Number(product.economia_estimada) > 0 && (
                    <Chip tone="success" icon="trending_up">
                      {money(product.economia_estimada)}
                    </Chip>
                  )}
                </div>
                <ul className="space-y-2 text-body-sm text-on-surface-variant dark:text-dark-textMuted">
                  <li className="flex items-center gap-2">
                    <Icon name="local_gas_station" size={16} /> Entrega: <strong className="text-on-surface dark:text-dark-text">{delivery}</strong>
                  </li>
                  {product.delivery_deadline && (
                    <li className="flex items-center gap-2">
                      <Icon name="info" size={16} /> Prazo: <strong className="text-on-surface dark:text-dark-text">{product.delivery_deadline}</strong>
                    </li>
                  )}
                  {product.usage_rules && (
                    <li className="flex items-start gap-2">
                      <Icon name="info" size={16} className="mt-0.5" />
                      <span>{product.usage_rules}</span>
                    </li>
                  )}
                </ul>
              </>
            ) : (
              <div className="space-y-3">
                <Skeleton height={160} rounded="2xl" />
                <Skeleton height={20} width="60%" />
                <Skeleton height={14} width="100%" />
                <Skeleton height={14} width="80%" />
              </div>
            )}
          </Card>
        </aside>
      </section>
    </main>
  );
}

export default CheckoutPage;
