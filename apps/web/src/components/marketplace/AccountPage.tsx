import { ReactNode, useEffect, useMemo, useState } from "react";

import { assetUrl } from "../../lib/assets";
import {
  AuthUser,
  BenefitActivation,
  CashbackSummary,
  clearToken,
  marketplaceApi,
  money,
  Notification,
  Order,
  SavingsSummary
} from "../../lib/marketplaceApi";
import CashbackExpiringBanner from "./CashbackExpiringBanner";
import OrderTimeline from "./OrderTimeline";
import ReferralCard from "./ReferralCard";
import VoucherCard from "./VoucherCard";

const defaultSavings: SavingsSummary = {
  economia_total: 0,
  pedidos: 0,
  aquisicoes_mes: 0,
  meta_mensal: 5,
  faltam_para_subir: 5,
  nivel_atual: "Bronze",
  proximo_nivel: "Prata",
  nivel_status: "em_progresso"
};

function AccountPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [benefits, setBenefits] = useState<BenefitActivation[]>([]);
  const [openTimelineFor, setOpenTimelineFor] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [savings, setSavings] = useState<SavingsSummary>(defaultSavings);
  const [profile, setProfile] = useState<(AuthUser & Record<string, string>) | null>(null);
  const [syncingOrders, setSyncingOrders] = useState<number[]>([]);
  const [cashback, setCashback] = useState<CashbackSummary | null>(null);

  const loadAccountData = () => {
    void Promise.all([
      marketplaceApi.me(),
      marketplaceApi.myOrders(),
      marketplaceApi.myBenefits(),
      marketplaceApi.mySavings(),
      marketplaceApi.myNotifications(),
      marketplaceApi.myCashback().catch(() => null)
    ])
      .then(([me, orderData, benefitData, savingsData, notificationData, cashbackData]) => {
        setProfile(me);
        setOrders(orderData);
        setBenefits(benefitData);
        setSavings(savingsData);
        setNotifications(notificationData);
        setCashback(cashbackData);
      })
      .catch(() => {
        window.history.pushState(null, "", "/entrar");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
  };

  useEffect(() => {
    loadAccountData();
  }, []);

  const refreshOrderPayment = async (orderId: number) => {
    setSyncingOrders((current) => [...current, orderId]);
    try {
      const sync = await marketplaceApi.getOrderPaymentStatus(orderId);
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId
            ? {
                ...order,
                ...sync.order,
                voucher_code: sync.payment.voucherCode ?? sync.order.voucher_code ?? order.voucher_code,
                payment_status: sync.payment.paymentStatus,
                payment_status_detail: sync.payment.statusDetail ?? order.payment_status_detail
              }
            : order
        )
      );
      if (sync.payment.paymentStatus === "approved") {
        loadAccountData();
      }
    } finally {
      setSyncingOrders((current) => current.filter((id) => id !== orderId));
    }
  };

  const navigate = (path: string) => {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  // Vouchers digitais — orders aprovadas que tem voucher_code mas sem activation presencial.
  const digitalVouchers = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.payment_status === "approved" &&
          Boolean(order.voucher_code) &&
          (order.delivery_method === "digital" || order.offer_type === "voucher" || order.offer_type === "produto_digital")
      ),
    [orders]
  );

  // Beneficios presenciais — benefit_activations ainda utilizaveis.
  const usableBenefits = useMemo(
    () =>
      benefits.filter(
        (benefit) =>
          benefit.status !== "cancelado" &&
          benefit.status !== "expirado" &&
          benefit.status !== "esgotado"
      ),
    [benefits]
  );
  const expiredOrUsedBenefits = useMemo(
    () =>
      benefits.filter(
        (benefit) =>
          benefit.status === "cancelado" || benefit.status === "expirado" || benefit.status === "esgotado"
      ),
    [benefits]
  );

  const pendingOrders = orders.filter((order) => order.payment_status === "pending");
  const approvedPayments = orders.filter((order) => order.payment_status === "approved").length;
  const fullAddress = profile
    ? [profile.endereco, profile.numero, profile.complemento, profile.bairro, profile.cidade, profile.estado, profile.cep]
        .filter(Boolean)
        .join(", ")
    : "";

  const cashbackBalance = cashback?.balance ?? 0;

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#111827]">
      <section className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-gold">Minha conta</p>
            <h1 className="mt-2 font-display text-3xl font-black">Ola, {profile?.nome ?? "Cliente"}</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              clearToken();
              navigate("/");
            }}
            className="rounded-md border border-[#ccd5e2] bg-white px-4 py-2 text-sm font-black"
          >
            Sair
          </button>
        </header>

        {/* Banner de cashback expirando em destaque (so aparece se houver) */}
        <div className="mt-6">
          <CashbackExpiringBanner />
        </div>

        {/* Programa de indicacao — CTA viral */}
        <div className="mt-6">
          <ReferralCard />
        </div>

        {/* Hero do cashback — destaque maximo, com CTA explicito de uso. */}
        <section className="mt-6 grid gap-4 rounded-md border border-brand-gold/40 bg-gradient-to-br from-brand-gold/15 to-white p-6 lg:grid-cols-[1.4fr_0.8fr_0.8fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-gold">Sua carteira de cashback</p>
            <strong className="mt-2 block font-display text-5xl font-black tabular-nums">
              {money(cashbackBalance)}
            </strong>
            <p className="mt-3 max-w-md text-sm font-bold leading-6 text-[#5a3f00]">
              Voce ganha <strong>{cashback?.effective_rate ?? 2}%</strong> de cashback (nivel {cashback?.tier ?? "Bronze"}) em
              cada compra. Use como desconto direto no proximo pedido.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate("/")}
                disabled={cashbackBalance <= 0}
                className="rounded-md bg-brand-ink px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Usar agora no catalogo
              </button>
              <a
                href="#como-funciona"
                className="rounded-md border border-brand-gold bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-brand-ink"
              >
                Como funciona
              </a>
            </div>
          </div>
          <div className="rounded-md bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#6c7788]">Expira nos proximos 30 dias</p>
            <strong className="mt-2 block text-2xl font-black">
              {money(cashback?.expiring_soon ?? 0)}
            </strong>
            {(cashback?.expiring_soon ?? 0) > 0 && (
              <p className="mt-2 text-xs font-bold text-amber-700">
                Use antes de expirar para nao perder.
              </p>
            )}
          </div>
          <div className="rounded-md bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#6c7788]">Movimentacoes recentes</p>
            <div className="mt-2 grid gap-1 text-xs font-bold">
              {(cashback?.transactions ?? []).slice(0, 4).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between gap-2 border-t border-[#edf1f6] pt-1 first:border-t-0 first:pt-0">
                  <span className="capitalize text-[#425166]">{tx.tipo}</span>
                  <span className={tx.tipo === "credito" || tx.tipo === "estornado" ? "text-emerald-700" : "text-red-700"}>
                    {tx.tipo === "credito" || tx.tipo === "estornado" ? "+" : "−"}
                    {money(Number(tx.valor))}
                  </span>
                </div>
              ))}
              {(cashback?.transactions ?? []).length === 0 && (
                <span className="text-[#68748a]">Sem movimentacoes ainda. Faca uma compra para comecar.</span>
              )}
            </div>
          </div>
        </section>

        {/* KPIs gerais — reais, calculados das compras. */}
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Metric label="Economia acumulada" value={money(savings.economia_total)} />
          <Metric label="Pedidos" value={savings.pedidos} />
          <Metric label="Pagamentos aprovados" value={approvedPayments} />
          <Metric label="Nivel" value={savings.nivel_atual} />
        </div>

        {/* Vouchers digitais — protagonistas se existem. */}
        <section className="mt-8">
          <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6c7788]">Vouchers digitais</p>
              <h2 className="mt-1 font-display text-2xl font-black">
                {digitalVouchers.length > 0
                  ? `${digitalVouchers.length} voucher${digitalVouchers.length === 1 ? "" : "s"} para usar`
                  : "Voce ainda nao tem vouchers digitais"}
              </h2>
            </div>
            <p className="text-xs font-bold text-[#68748a] sm:text-right sm:max-w-md">
              Copie o codigo OD-XXXX e use no parceiro conforme as regras do produto.
            </p>
          </header>
          {digitalVouchers.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-[#dfe5ef] bg-white p-6 text-center text-sm font-bold text-[#68748a]">
              Quando comprar um voucher digital, ele aparece aqui pronto pra uso.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {digitalVouchers.map((order) => (
                <VoucherCard
                  key={`voucher-${order.id}`}
                  produtoNome={order.produto_nome}
                  imagemUrl={order.imagem_url}
                  voucherCode={order.voucher_code}
                  redemptionToken={null}
                  status="ativo"
                  redemptionLimit={null}
                  redemptionCount={0}
                  expiresAt={null}
                  offerType={order.offer_type}
                  deliveryMethod={order.delivery_method}
                  orderPublicCode={order.public_code}
                />
              ))}
            </div>
          )}
        </section>

        {/* Beneficios de resgate presencial — QR + token. */}
        <section className="mt-8">
          <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6c7788]">Beneficios para resgate</p>
              <h2 className="mt-1 font-display text-2xl font-black">
                {usableBenefits.length > 0
                  ? `${usableBenefits.length} beneficio${usableBenefits.length === 1 ? "" : "s"} ativo${usableBenefits.length === 1 ? "" : "s"}`
                  : "Sem beneficios ativos no momento"}
              </h2>
            </div>
            <p className="text-xs font-bold text-[#68748a] sm:text-right sm:max-w-md">
              Mostre o QR ou diga o token de 12 letras ao parceiro. Ele valida na hora.
            </p>
          </header>
          {usableBenefits.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-[#dfe5ef] bg-white p-6 text-center text-sm font-bold text-[#68748a]">
              Compre um servico ou voucher presencial para ver o QR de resgate aqui.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {usableBenefits.map((benefit) => (
                <VoucherCard
                  key={`benefit-${benefit.id}`}
                  produtoNome={benefit.produto_nome}
                  imagemUrl={benefit.imagem_url}
                  voucherCode={benefit.voucher_code}
                  redemptionToken={benefit.redemption_token}
                  status={benefit.status}
                  redemptionLimit={benefit.redemption_limit}
                  redemptionCount={benefit.redemption_count}
                  expiresAt={benefit.expires_at}
                  usageRules={benefit.usage_rules}
                  offerType={benefit.offer_type}
                  deliveryMethod={benefit.delivery_method}
                />
              ))}
            </div>
          )}
          {expiredOrUsedBenefits.length > 0 && (
            <details className="mt-3 rounded-md border border-[#dfe5ef] bg-white p-4">
              <summary className="cursor-pointer text-sm font-black text-[#475569]">
                Mostrar beneficios usados ou expirados ({expiredOrUsedBenefits.length})
              </summary>
              <ul className="mt-3 grid gap-2 text-sm font-semibold text-[#5f6b7b]">
                {expiredOrUsedBenefits.map((benefit) => (
                  <li key={`exp-${benefit.id}`} className="flex items-center justify-between border-t border-[#edf1f6] pt-2 first:border-t-0 first:pt-0">
                    <span>{benefit.produto_nome}</span>
                    <span className="rounded-md bg-[#f1f5f9] px-2 py-1 text-xs font-black uppercase tracking-[0.1em]">
                      {benefit.status}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="mt-8 rounded-md border border-[#dfe5ef] bg-white p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6c7788]">Guia rapido</p>
          <h2 className="mt-1 font-display text-2xl font-black">Como cashback e vouchers funcionam</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Step
              number="1"
              title="Cashback acumula"
              text="Cada compra aprovada credita uma porcentagem (Bronze 2% / Prata 5% / Ouro 8%) na sua carteira. Vence em 90 dias."
            />
            <Step
              number="2"
              title="Use no checkout"
              text="No proximo pedido, marque 'Usar meu cashback' para abater o valor. Se cobrir 100%, nao passa pelo Mercado Pago."
            />
            <Step
              number="3"
              title="Voucher e QR"
              text="Compras digitais ja vem com um codigo OD-XXXX. Compras presenciais geram um token + QR para o parceiro escanear."
            />
          </div>
        </section>

        {/* Pedidos */}
        <section className="mt-8 rounded-md border border-[#dfe5ef] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#edf1f6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-black">Meus pedidos</h2>
            {pendingOrders.length > 0 && (
              <button
                type="button"
                onClick={() => void Promise.all(pendingOrders.slice(0, 5).map((order) => refreshOrderPayment(order.id)))}
                className="rounded-md bg-brand-ink px-4 py-2 text-sm font-black text-white"
              >
                Atualizar pagamentos pendentes
              </button>
            )}
          </div>
          <div className="divide-y divide-[#edf1f6]">
            {orders.length === 0 ? (
              <p className="px-5 py-5 text-sm font-bold text-[#68748a]">Nenhum pedido ainda.</p>
            ) : (
              orders.map((order) => (
                <article key={order.id} className="grid gap-4 px-5 py-4 sm:grid-cols-[5rem_1fr_auto] sm:items-center">
                  <div className="h-20 overflow-hidden rounded-md bg-[#e6ebf2]">
                    {order.imagem_url && <img src={assetUrl(order.imagem_url)} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div>
                    <h3 className="font-black">{order.produto_nome}</h3>
                    <p className="mt-1 text-sm font-semibold text-[#68748a]">
                      {labelOrderType(order)} · {labelOrderStatus(order.status)} · pagamento {labelPaymentStatus(order.payment_status)}
                    </p>
                    {(order.cashback_aplicado ?? 0) > 0 && (
                      <p className="mt-1 text-xs font-bold text-emerald-700">
                        Usou {money(order.cashback_aplicado ?? 0)} de cashback
                      </p>
                    )}
                    {(order.cashback_creditado ?? 0) > 0 && (
                      <p className="mt-1 text-xs font-bold text-brand-ink">
                        Ganhou {money(order.cashback_creditado ?? 0)} de cashback
                      </p>
                    )}
                    {order.voucher_code && (
                      <p className="mt-2 inline-flex items-center gap-2 rounded-md bg-brand-gold/20 px-2 py-1 text-xs font-black text-brand-ink">
                        Voucher {order.voucher_code}
                      </p>
                    )}
                  </div>
                  <div className="justify-self-end text-right">
                    <strong>{money(order.valor_pago_total)}</strong>
                    {order.payment_status === "pending" && (
                      <button
                        type="button"
                        onClick={() => void refreshOrderPayment(order.id)}
                        disabled={syncingOrders.includes(order.id)}
                        className="mt-3 block rounded-md border border-[#ccd5e2] bg-white px-3 py-2 text-xs font-black"
                      >
                        {syncingOrders.includes(order.id) ? "Verificando..." : "Verificar pagamento"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpenTimelineFor(openTimelineFor === order.id ? null : order.id)}
                      className="mt-2 block rounded-md border border-[#ccd5e2] bg-white px-3 py-2 text-xs font-black"
                    >
                      {openTimelineFor === order.id ? "Ocultar timeline" : "Ver timeline"}
                    </button>
                  </div>
                  {openTimelineFor === order.id && (
                    <div className="sm:col-span-3">
                      <OrderTimeline orderId={order.id} />
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        {/* Cadastro + notificacoes */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_24rem]">
          <section className="rounded-md border border-[#dfe5ef] bg-white">
            <div className="border-b border-[#edf1f6] px-5 py-4">
              <h2 className="text-lg font-black">Notificacoes</h2>
            </div>
            <div className="divide-y divide-[#edf1f6]">
              {notifications.length === 0 ? (
                <p className="px-5 py-5 text-sm font-bold text-[#68748a]">Nada por enquanto.</p>
              ) : (
                notifications.map((notification) => (
                  <div key={notification.id} className="px-5 py-4">
                    <h3 className="text-sm font-black">{notification.titulo}</h3>
                    <p className="mt-1 text-sm font-semibold leading-6 text-[#68748a]">
                      {notification.mensagem}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="grid gap-4">
            <InfoPanel title="Dados cadastrais">
              <p>{profile?.nome}</p>
              <p>{profile?.email}</p>
              <p>{profile?.telefone}</p>
              <p>CPF {profile?.cpf ?? "-"}</p>
            </InfoPanel>
            <InfoPanel title="Endereco">
              <p>{fullAddress || "Endereco nao localizado."}</p>
            </InfoPanel>
            <InfoPanel title="Localizacao">
              <p>Ative para receber alertas de beneficios proximos.</p>
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={() => marketplaceApi.setLocationConsent("granted")}
                  className="rounded-md bg-brand-gold px-3 py-2 text-sm font-black text-brand-ink"
                >
                  Permitir
                </button>
                <button
                  type="button"
                  onClick={() => marketplaceApi.setLocationConsent("revoked")}
                  className="rounded-md border border-[#ccd5e2] px-3 py-2 text-sm font-black"
                >
                  Revogar
                </button>
              </div>
            </InfoPanel>
          </div>
        </div>
      </section>
    </main>
  );
}

function labelOrderType(order: Order) {
  const labels: Record<string, string> = {
    produto_fisico: "Produto fisico",
    produto_digital: "Produto digital",
    servico: "Servico",
    voucher: "Voucher",
    beneficio_recorrente: "Beneficio recorrente",
    assinatura: "Assinatura",
    combo: "Combo"
  };
  return labels[order.offer_type ?? ""] ?? order.tipo_entrega;
}

function labelOrderStatus(status?: string) {
  const labels: Record<string, string> = {
    pendente_pagamento: "Aguardando pagamento",
    confirmado: "Confirmado",
    enviado: "Enviado",
    entregue: "Entregue",
    cancelado: "Cancelado"
  };
  return labels[status ?? ""] ?? (status || "Pendente");
}

function labelPaymentStatus(status?: string) {
  const labels: Record<string, string> = {
    pending: "aguardando confirmacao",
    approved: "aprovado",
    rejected: "recusado",
    refunded: "estornado",
    cancelled: "cancelado"
  };
  return labels[status ?? ""] ?? (status || "pendente");
}

function InfoPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-[#dfe5ef] bg-white p-5">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-3 grid gap-1 text-sm font-semibold leading-6 text-[#68748a]">{children}</div>
    </section>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-4">
      <span className="grid h-9 w-9 place-items-center rounded-md bg-brand-ink font-black text-white">{number}</span>
      <h3 className="mt-3 text-base font-black">{title}</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-[#5f6b7b]">{text}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[#dfe5ef] bg-white p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#68748a]">{label}</p>
      <strong className="mt-2 block text-2xl font-black">{value}</strong>
    </div>
  );
}

export default AccountPage;
