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
import { Button, Card, Chip, EmptyState, Icon, StatCard } from "../ui";
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
    <main className="min-h-screen bg-surface px-margin-mobile py-8 text-on-surface dark:bg-dark-bg dark:text-dark-text lg:px-margin-desktop">
      <section className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Chip tone="accent" uppercase icon="account_circle">
              Minha conta
            </Chip>
            <h1 className="mt-3 font-display text-headline-lg text-on-surface dark:text-dark-text">
              Olá, {profile?.nome ?? "motorista"}
            </h1>
            {profile?.email && (
              <p className="mt-1 text-body-sm text-on-surface-variant dark:text-dark-textMuted">
                {profile.email}
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            leftIcon="logout"
            onClick={() => {
              clearToken();
              navigate("/");
            }}
          >
            Sair
          </Button>
        </header>

        {/* Banner de cashback expirando em destaque (só aparece se houver) */}
        <div className="mt-6">
          <CashbackExpiringBanner />
        </div>

        {/* Programa de indicação — CTA viral */}
        <div className="mt-6">
          <ReferralCard />
        </div>

        {/* Hero do cashback — destaque máximo, com CTA explícito de uso. */}
        <Card surface="bright" tactile rounded="3xl" padding="lg" className="mt-6 relative isolate overflow-hidden">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />
          <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr_0.8fr]">
            <div>
              <Chip tone="accent" uppercase icon="savings">
                Sua carteira de cashback
              </Chip>
              <p className="mt-4 font-display text-display-lg leading-none tabular-nums text-on-surface dark:text-dark-text">
                <span className="gradient-text">{money(cashbackBalance)}</span>
              </p>
              <p className="mt-3 max-w-md text-body-md text-on-surface-variant dark:text-dark-textMuted">
                Você ganha <strong className="text-accent-deep dark:text-accent-soft">{cashback?.effective_rate ?? 2}%</strong> de cashback (nível {cashback?.tier ?? "Bronze"}) em cada compra. Use como desconto direto no próximo pedido.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  leftIcon="shopping_cart"
                  disabled={cashbackBalance <= 0}
                  onClick={() => navigate("/")}
                >
                  Usar agora no catálogo
                </Button>
                <Button variant="secondary" size="lg" leftIcon="info" onClick={() => document.getElementById("como-funciona")?.scrollIntoView({ behavior: "smooth" })}>
                  Como funciona
                </Button>
              </div>
            </div>
            <Card surface="inset" rounded="2xl" padding="md" className="border-0">
              <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
                Expira nos próximos 30 dias
              </p>
              <strong className="mt-2 block font-display text-headline-sm text-on-surface dark:text-dark-text">
                {money(cashback?.expiring_soon ?? 0)}
              </strong>
              {(cashback?.expiring_soon ?? 0) > 0 && (
                <p className="mt-2 flex items-center gap-1 text-label-sm font-bold text-warning">
                  <Icon name="warning" size={14} /> Use antes de expirar.
                </p>
              )}
            </Card>
            <Card surface="inset" rounded="2xl" padding="md" className="border-0">
              <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
                Movimentações recentes
              </p>
              <div className="mt-2 grid gap-1.5">
                {(cashback?.transactions ?? []).slice(0, 4).map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-2 border-t border-outline-variant/50 pt-1.5 text-body-sm font-bold first:border-t-0 first:pt-0 dark:border-dark-outline"
                  >
                    <span className="capitalize text-on-surface-variant dark:text-dark-textMuted">{tx.tipo}</span>
                    <span className={tx.tipo === "credito" || tx.tipo === "estornado" ? "text-success" : "text-danger"}>
                      {tx.tipo === "credito" || tx.tipo === "estornado" ? "+" : "−"}
                      {money(Number(tx.valor))}
                    </span>
                  </div>
                ))}
                {(cashback?.transactions ?? []).length === 0 && (
                  <span className="text-body-sm text-on-surface-variant dark:text-dark-textMuted">
                    Sem movimentações ainda. Faça uma compra para começar.
                  </span>
                )}
              </div>
            </Card>
          </div>
        </Card>

        {/* KPIs gerais — reais, calculados das compras. */}
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <StatCard label="Economia acumulada" value={money(savings.economia_total)} icon="trending_up" tone="success" />
          <StatCard label="Pedidos" value={savings.pedidos} icon="shopping_cart" />
          <StatCard label="Pagamentos aprovados" value={approvedPayments} icon="check_circle" tone="success" />
          <StatCard label="Nível" value={savings.nivel_atual} icon="star" tone="accent" />
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
            <div className="mt-4">
              <EmptyState
                title="Nenhum voucher digital ainda"
                description="Quando comprar um voucher digital, ele aparece aqui pronto pra uso."
                icon="confirmation_number"
              />
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
            <div className="mt-4">
              <EmptyState
                title="Sem benefícios ativos"
                description="Compre um serviço ou voucher presencial para ver o QR de resgate aqui."
                icon="qr_code_2"
              />
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
            <details className="mt-3 rounded-2xl border border-outline-variant/70 bg-surface-bright p-4 dark:border-dark-outline dark:bg-dark-surface">
              <summary className="cursor-pointer text-label-bold text-on-surface-variant dark:text-dark-textMuted">
                Mostrar benefícios usados ou expirados ({expiredOrUsedBenefits.length})
              </summary>
              <ul className="mt-3 grid gap-2">
                {expiredOrUsedBenefits.map((benefit) => (
                  <li key={`exp-${benefit.id}`} className="flex items-center justify-between border-t border-outline-variant/40 pt-2 text-body-sm first:border-t-0 first:pt-0 dark:border-dark-outline">
                    <span className="font-bold text-on-surface dark:text-dark-text">{benefit.produto_nome}</span>
                    <Chip tone="ghost" size="sm" uppercase>{benefit.status}</Chip>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* Como funciona */}
        <Card id="como-funciona" surface="bright" tactile rounded="3xl" padding="lg" className="mt-8">
          <Chip tone="ghost" uppercase>Guia rápido</Chip>
          <h2 className="mt-3 font-display text-headline-sm text-on-surface dark:text-dark-text">
            Como cashback e vouchers funcionam
          </h2>
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
              text="Compras digitais já vêm com um código OD-XXXX. Compras presenciais geram um token + QR para o parceiro escanear."
            />
          </div>
        </Card>

        {/* Pedidos */}
        <Card surface="bright" tactile rounded="3xl" padding="none" className="mt-8 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-outline-variant/60 px-6 py-4 dark:border-dark-outline sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display text-title-lg text-on-surface dark:text-dark-text">Meus pedidos</h2>
            {pendingOrders.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                leftIcon="sync"
                onClick={() => void Promise.all(pendingOrders.slice(0, 5).map((order) => refreshOrderPayment(order.id)))}
              >
                Atualizar pendentes
              </Button>
            )}
          </div>
          <div className="divide-y divide-outline-variant/40 dark:divide-dark-outline">
            {orders.length === 0 ? (
              <p className="px-6 py-6 text-body-sm font-bold text-on-surface-variant dark:text-dark-textMuted">
                Nenhum pedido ainda.
              </p>
            ) : (
              orders.map((order) => (
                <article key={order.id} className="grid gap-4 px-6 py-5 sm:grid-cols-[5rem_1fr_auto] sm:items-center">
                  <div className="h-20 overflow-hidden rounded-xl surface-inset">
                    {order.imagem_url ? (
                      <img src={assetUrl(order.imagem_url)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-on-surface-variant dark:text-dark-textMuted">
                        <Icon name="shopping_bag" size={24} />
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-display text-title-md text-on-surface dark:text-dark-text">{order.produto_nome}</h3>
                    <p className="mt-1 text-body-sm text-on-surface-variant dark:text-dark-textMuted">
                      {labelOrderType(order)} · {labelOrderStatus(order.status)} · pagamento {labelPaymentStatus(order.payment_status)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(order.cashback_aplicado ?? 0) > 0 && (
                        <Chip tone="success" size="sm" icon="payments">
                          Usou {money(order.cashback_aplicado ?? 0)}
                        </Chip>
                      )}
                      {(order.cashback_creditado ?? 0) > 0 && (
                        <Chip tone="accent" size="sm" icon="trending_up">
                          Ganhou {money(order.cashback_creditado ?? 0)}
                        </Chip>
                      )}
                      {order.voucher_code && (
                        <Chip tone="accent" size="sm" icon="confirmation_number">
                          Voucher {order.voucher_code}
                        </Chip>
                      )}
                    </div>
                  </div>
                  <div className="justify-self-end text-right">
                    <strong className="font-display text-title-lg text-on-surface dark:text-dark-text">
                      {money(order.valor_pago_total)}
                    </strong>
                    <div className="mt-3 flex flex-col gap-2">
                      {order.payment_status === "pending" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon="sync"
                          loading={syncingOrders.includes(order.id)}
                          onClick={() => void refreshOrderPayment(order.id)}
                        >
                          Verificar pagamento
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        rightIcon={openTimelineFor === order.id ? "close" : "chevron_right"}
                        onClick={() => setOpenTimelineFor(openTimelineFor === order.id ? null : order.id)}
                      >
                        {openTimelineFor === order.id ? "Ocultar" : "Ver timeline"}
                      </Button>
                    </div>
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
        </Card>

        {/* Cadastro + notificações */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_24rem]">
          <Card surface="bright" tactile rounded="3xl" padding="none" className="overflow-hidden">
            <div className="border-b border-outline-variant/60 px-6 py-4 dark:border-dark-outline">
              <h2 className="font-display text-title-lg text-on-surface dark:text-dark-text">Notificações</h2>
            </div>
            <div className="divide-y divide-outline-variant/40 dark:divide-dark-outline">
              {notifications.length === 0 ? (
                <p className="px-6 py-6 text-body-sm font-bold text-on-surface-variant dark:text-dark-textMuted">
                  Nada por enquanto.
                </p>
              ) : (
                notifications.map((notification) => (
                  <div key={notification.id} className="px-6 py-4">
                    <h3 className="font-bold text-on-surface dark:text-dark-text">{notification.titulo}</h3>
                    <p className="mt-1 text-body-sm text-on-surface-variant dark:text-dark-textMuted">
                      {notification.mensagem}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <div className="grid gap-4">
            <InfoPanel title="Dados cadastrais" icon="person">
              <p>{profile?.nome}</p>
              <p>{profile?.email}</p>
              <p>{profile?.telefone}</p>
              <p>CPF {profile?.cpf ?? "-"}</p>
            </InfoPanel>
            <InfoPanel title="Endereço" icon="location_on">
              <p>{fullAddress || "Endereço não localizado."}</p>
            </InfoPanel>
            <InfoPanel title="Localização" icon="my_location">
              <p>Ative para receber alertas de benefícios próximos.</p>
              <div className="mt-3 grid gap-2">
                <Button variant="accent" size="sm" leftIcon="check" onClick={() => marketplaceApi.setLocationConsent("granted")}>
                  Permitir
                </Button>
                <Button variant="secondary" size="sm" leftIcon="close" onClick={() => marketplaceApi.setLocationConsent("revoked")}>
                  Revogar
                </Button>
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

function InfoPanel({ title, icon, children }: { title: string; icon?: import("../ui").IconName; children: ReactNode }) {
  return (
    <Card surface="bright" tactile rounded="2xl" padding="md">
      <div className="flex items-center gap-2">
        {icon ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-accent/15 text-accent-deep dark:text-accent-soft">
            <Icon name={icon} size={18} />
          </span>
        ) : null}
        <h2 className="font-display text-title-md text-on-surface dark:text-dark-text">{title}</h2>
      </div>
      <div className="mt-3 grid gap-1 text-body-sm text-on-surface-variant dark:text-dark-textMuted">{children}</div>
    </Card>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <Card surface="inset" rounded="2xl" padding="md" className="border-0">
      <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-primary font-display text-title-md text-on-primary dark:bg-white dark:text-brand-ink">
        {number}
      </span>
      <h3 className="mt-3 font-display text-title-md text-on-surface dark:text-dark-text">{title}</h3>
      <p className="mt-2 text-body-sm text-on-surface-variant dark:text-dark-textMuted">{text}</p>
    </Card>
  );
}

export default AccountPage;
