import { useEffect, useState } from "react";

import {
  clearToken,
  marketplaceApi,
  money,
  Notification,
  Order
} from "../../lib/marketplaceApi";

function AccountPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [savings, setSavings] = useState({ economia_total: 0, pedidos: 0 });
  const [name, setName] = useState("Cliente");

  useEffect(() => {
    void Promise.all([
      marketplaceApi.me(),
      marketplaceApi.myOrders(),
      marketplaceApi.mySavings(),
      marketplaceApi.myNotifications()
    ])
      .then(([me, orderData, savingsData, notificationData]) => {
        setName(me.nome);
        setOrders(orderData);
        setSavings(savingsData);
        setNotifications(notificationData);
      })
      .catch(() => {
        window.history.pushState(null, "", "/entrar");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
  }, []);

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#111827]">
      <section className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-gold">
              Minha conta
            </p>
            <h1 className="mt-2 font-display text-3xl font-black">Ola, {name}</h1>
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
          <Metric label="Nivel" value={savings.economia_total >= 1000 ? "Ouro" : savings.economia_total >= 500 ? "Prata" : "Bronze"} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
          <section className="rounded-md border border-[#dfe5ef] bg-white">
            <div className="border-b border-[#edf1f6] px-5 py-4">
              <h2 className="text-lg font-black">Meus pedidos e vouchers</h2>
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
                      {order.imagem_url && <img src={order.imagem_url} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div>
                      <h3 className="font-black">{order.produto_nome}</h3>
                      <p className="mt-1 text-sm font-semibold text-[#68748a]">
                        {order.tipo_entrega} · {order.status} · economia {money(order.economia_total)}
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[#dfe5ef] bg-white p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#68748a]">{label}</p>
      <strong className="mt-2 block text-2xl font-black">{value}</strong>
    </div>
  );
}

export default AccountPage;
