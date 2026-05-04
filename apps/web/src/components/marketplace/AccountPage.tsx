import { ReactNode, useEffect, useState } from "react";

import { assetUrl } from "../../lib/assets";
import {
  AuthUser,
  BenefitActivation,
  clearToken,
  marketplaceApi,
  money,
  Notification,
  Order,
  SavingsSummary
} from "../../lib/marketplaceApi";

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [savings, setSavings] = useState<SavingsSummary>(defaultSavings);
  const [profile, setProfile] = useState<(AuthUser & Record<string, string>) | null>(null);

  useEffect(() => {
    void Promise.all([
      marketplaceApi.me(),
      marketplaceApi.myOrders(),
      marketplaceApi.myBenefits(),
      marketplaceApi.mySavings(),
      marketplaceApi.myNotifications()
    ])
      .then(([me, orderData, benefitData, savingsData, notificationData]) => {
        setProfile(me);
        setOrders(orderData);
        setBenefits(benefitData);
        setSavings(savingsData);
        setNotifications(notificationData);
      })
      .catch(() => {
        window.history.pushState(null, "", "/entrar");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
  }, []);

  const vouchers = orders.filter((order) => order.offer_type === "voucher" || Boolean(order.voucher_code));
  const services = orders.filter((order) => order.offer_type === "servico");
  const digitalProducts = orders.filter(
    (order) => order.offer_type === "produto_digital" || order.delivery_method === "digital"
  );
  const approvedPayments = orders.filter((order) => order.payment_status === "approved").length;
  const activeBenefits = benefits.filter((benefit) => benefit.status === "active");
  const fullAddress = profile
    ? [profile.endereco, profile.numero, profile.complemento, profile.bairro, profile.cidade, profile.estado, profile.cep]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#111827]">
      <section className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-gold">
              Minha conta
            </p>
            <h1 className="mt-2 font-display text-3xl font-black">Ola, {profile?.nome ?? "Cliente"}</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              clearToken();
              window.history.pushState(null, "", "/");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
            className="rounded-md border border-[#ccd5e2] bg-white px-4 py-2 text-sm font-black"
          >
            Sair
          </button>
        </header>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Metric label="Economia acumulada" value={money(savings.economia_total)} />
          <Metric label="Pedidos" value={savings.pedidos} />
          <Metric label="Nivel" value={savings.nivel_atual} />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Metric label="Meus vouchers" value={vouchers.length} />
          <Metric label="Servicos adquiridos" value={services.length} />
          <Metric label="Digitais liberados" value={digitalProducts.length} />
          <Metric label="Pagamentos aprovados" value={approvedPayments} />
          <Metric label="Beneficios ativos" value={activeBenefits.length} />
        </div>

        <section className="mt-6 rounded-md border border-[#dfe5ef] bg-white p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-gold">
                Regra de nivel mensal
              </p>
              <h2 className="mt-2 text-xl font-black">
                Adquira 5 produtos e/ou beneficios no mes para passar de nivel.
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#68748a]">
                Seu nivel e calculado automaticamente com base nos pedidos confirmados, enviados ou entregues dentro do mes atual.
              </p>
            </div>
            <div className="rounded-md bg-[#f6f8fb] p-4 md:min-w-64">
              <div className="flex items-center justify-between text-sm font-black">
                <span>{savings.aquisicoes_mes}/{savings.meta_mensal}</span>
                <span>{savings.nivel_status === "nivel_liberado" ? "Nivel liberado" : `Faltam ${savings.faltam_para_subir}`}</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#e1e7f0]">
                <span
                  className="block h-full rounded-full bg-brand-gold"
                  style={{
                    width: `${Math.min((savings.aquisicoes_mes / savings.meta_mensal) * 100, 100)}%`
                  }}
                />
              </div>
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#68748a]">
                Proximo nivel: {savings.proximo_nivel}
              </p>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
          <section className="rounded-md border border-[#dfe5ef] bg-white">
            <div className="border-b border-[#edf1f6] px-5 py-4">
              <h2 className="text-lg font-black">Meus pedidos</h2>
            </div>
            <div className="divide-y divide-[#edf1f6]">
              {orders.length === 0 ? (
                <p className="px-5 py-5 text-sm font-bold text-[#68748a]">
                  Nenhum pedido ainda.
                </p>
              ) : (
                orders.map((order) => (
                  <article key={order.id} className="grid gap-4 px-5 py-4 sm:grid-cols-[5rem_1fr_auto] sm:items-center">
                    <div className="h-20 overflow-hidden rounded-md bg-[#e6ebf2]">
                      {order.imagem_url && <img src={assetUrl(order.imagem_url)} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div>
                      <h3 className="font-black">{order.produto_nome}</h3>
                      <p className="mt-1 text-sm font-semibold text-[#68748a]">
                        {labelOrderType(order)} | {order.status} | entrega {order.delivery_method ?? order.tipo_entrega}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#68748a]">
                        Pagamento {order.payment_status ?? "pendente"} via {order.payment_method ?? "-"} | economia {money(order.economia_total)}
                      </p>
                      {order.voucher_code && (
                        <p className="mt-2 inline-block rounded-md bg-brand-gold/20 px-2 py-1 text-xs font-black">
                          Voucher {order.voucher_code}
                        </p>
                      )}
                    </div>
                    <strong>{money(order.valor_pago_total)}</strong>
                  </article>
                ))
              )}
            </div>
          </section>

          <div className="grid gap-6">
            <InfoPanel title="Dados cadastrais">
              <p>{profile?.nome}</p>
              <p>{profile?.email}</p>
              <p>{profile?.telefone}</p>
              <p>CPF {profile?.cpf ?? "-"}</p>
            </InfoPanel>
            <InfoPanel title="Endereco">
              <p>{fullAddress || "Endereco nao localizado."}</p>
            </InfoPanel>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <OrderGroup title="Meus vouchers" orders={vouchers} empty="Nenhum voucher liberado ainda." />
          <OrderGroup title="Meus servicos adquiridos" orders={services} empty="Nenhum servico adquirido ainda." />
          <OrderGroup title="Produtos digitais liberados" orders={digitalProducts} empty="Nenhum produto digital liberado ainda." />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
          <section className="rounded-md border border-[#dfe5ef] bg-white">
            <div className="border-b border-[#edf1f6] px-5 py-4">
              <h2 className="text-lg font-black">Beneficios ativos</h2>
            </div>
            <div className="divide-y divide-[#edf1f6]">
              {benefits.length === 0 ? (
                <p className="px-5 py-5 text-sm font-bold text-[#68748a]">Nenhum beneficio ativado ainda.</p>
              ) : (
                benefits.map((benefit) => (
                  <div key={benefit.id} className="grid gap-4 px-5 py-4 sm:grid-cols-[5rem_1fr_auto] sm:items-center">
                    <div className="h-20 overflow-hidden rounded-md bg-[#e6ebf2]">
                      {benefit.imagem_url && <img src={assetUrl(benefit.imagem_url)} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div>
                      <h3 className="font-black">{benefit.product_nome}</h3>
                      <p className="mt-1 text-sm font-semibold text-[#68748a]">
                        Codigo {benefit.activation_code} | {benefit.status}
                      </p>
                    </div>
                    <span className="rounded-md bg-brand-gold/20 px-2 py-1 text-xs font-black">
                      {benefit.offer_type ?? "beneficio"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <InfoPanel title="Localizacao">
            <p>Ative para receber alertas quando houver beneficio disponivel em parceiro proximo.</p>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => marketplaceApi.setLocationConsent("granted")}
                className="rounded-md bg-brand-gold px-3 py-2 text-sm font-black text-brand-ink"
              >
                Permitir alertas por localizacao
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!navigator.geolocation) return;
                  navigator.geolocation.getCurrentPosition((position) => {
                    void marketplaceApi.sendLocationEvent({
                      latitude: position.coords.latitude,
                      longitude: position.coords.longitude,
                      accuracy_meters: Math.round(position.coords.accuracy),
                      event_type: "nearby"
                    });
                  });
                }}
                className="rounded-md bg-brand-ink px-3 py-2 text-sm font-black text-white"
              >
                Detectar parceiro proximo
              </button>
              <button
                type="button"
                onClick={() => marketplaceApi.setLocationConsent("revoked")}
                className="rounded-md border border-[#ccd5e2] px-3 py-2 text-sm font-black"
              >
                Revogar permissao
              </button>
            </div>
          </InfoPanel>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
          <section className="rounded-md border border-[#dfe5ef] bg-white">
            <div className="border-b border-[#edf1f6] px-5 py-4">
              <h2 className="text-lg font-black">Historico de pagamentos</h2>
            </div>
            <div className="divide-y divide-[#edf1f6]">
              {orders.length === 0 ? (
                <p className="px-5 py-5 text-sm font-bold text-[#68748a]">Nenhum pagamento registrado.</p>
              ) : (
                orders.map((order) => (
                  <div key={`payment-${order.id}`} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <h3 className="text-sm font-black">{order.public_code}</h3>
                      <p className="mt-1 text-sm font-semibold text-[#68748a]">
                        {order.payment_method ?? "-"} | {order.payment_status ?? "pendente"}
                      </p>
                    </div>
                    <strong>{money(order.valor_pago_total)}</strong>
                  </div>
                ))
              )}
            </div>
          </section>

          <aside className="rounded-md border border-[#dfe5ef] bg-white">
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
          </aside>
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

function InfoPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-[#dfe5ef] bg-white p-5">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-3 grid gap-1 text-sm font-semibold leading-6 text-[#68748a]">{children}</div>
    </section>
  );
}

function OrderGroup({ title, orders, empty }: { title: string; orders: Order[]; empty: string }) {
  return (
    <section className="rounded-md border border-[#dfe5ef] bg-white">
      <div className="border-b border-[#edf1f6] px-5 py-4">
        <h2 className="text-lg font-black">{title}</h2>
      </div>
      <div className="divide-y divide-[#edf1f6]">
        {orders.length === 0 ? (
          <p className="px-5 py-5 text-sm font-bold text-[#68748a]">{empty}</p>
        ) : (
          orders.slice(0, 5).map((order) => (
            <div key={`${title}-${order.id}`} className="px-5 py-4">
              <h3 className="text-sm font-black">{order.produto_nome}</h3>
              <p className="mt-1 text-sm font-semibold text-[#68748a]">
                {order.status} | {order.payment_status ?? "pendente"}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
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
