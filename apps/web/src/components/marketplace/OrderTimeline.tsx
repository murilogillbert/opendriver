import { useEffect, useState } from "react";

import { marketplaceApi, money } from "../../lib/marketplaceApi";

type Timeline = Awaited<ReturnType<typeof marketplaceApi.orderTimeline>>;

const STATUS_FLOW: Array<{ key: string; label: string }> = [
  { key: "pendente_pagamento", label: "Aguardando pagamento" },
  { key: "confirmado", label: "Pagamento aprovado" },
  { key: "enviado", label: "Enviado" },
  { key: "entregue", label: "Entregue" }
];

const STATUS_DICT: Record<string, string> = {
  pendente_pagamento: "Aguardando pagamento",
  confirmado: "Pagamento aprovado",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
  estornado: "Estornado"
};

export default function OrderTimeline({ orderId }: { orderId: number }) {
  const [data, setData] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    marketplaceApi
      .orderTimeline(orderId)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) return <p className="text-sm text-slate-500">Carregando timeline...</p>;
  if (error) return <p className="text-sm text-rose-600">Erro: {error}</p>;
  if (!data) return null;

  const currentStatus = data.order.status;
  const isCancelled = currentStatus === "cancelado" || currentStatus === "estornado";
  const currentIndex = STATUS_FLOW.findIndex((s) => s.key === currentStatus);

  // Sort events from oldest to newest for display
  const events = [...data.events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">Pedido</p>
          <h3 className="mt-0.5 font-display text-lg font-black text-slate-800">
            #{data.order.public_code ?? data.order.id}
          </h3>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            Total: <span className="font-black">{money(data.order.valor_pago_total)}</span>
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[0.65rem] font-black uppercase tracking-wider ${
            isCancelled
              ? "bg-rose-100 text-rose-800"
              : currentStatus === "entregue"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {STATUS_DICT[currentStatus] ?? currentStatus}
        </span>
      </header>

      {!isCancelled && (
        <ol className="mt-5 space-y-4">
          {STATUS_FLOW.map((step, i) => {
            const reached = i <= currentIndex;
            return (
              <li key={step.key} className="flex items-start gap-3">
                <span
                  className={`mt-1 grid h-6 w-6 place-items-center rounded-full text-[0.7rem] font-black ${
                    reached ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {reached ? "✓" : i + 1}
                </span>
                <div className="flex-1">
                  <p className={`text-sm font-bold ${reached ? "text-slate-800" : "text-slate-400"}`}>
                    {step.label}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {events.length > 0 && (
        <details className="mt-5 rounded-xl bg-slate-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-bold text-slate-700">Historico completo</summary>
          <ul className="mt-3 space-y-3">
            {events.map((evt) => (
              <li key={evt.id} className="border-l-2 border-slate-300 pl-3">
                <p className="text-sm font-bold text-slate-800">
                  {STATUS_DICT[evt.status] ?? evt.status}
                </p>
                {evt.note && <p className="text-xs text-slate-600">{evt.note}</p>}
                <p className="mt-0.5 text-[0.65rem] uppercase tracking-wider text-slate-400">
                  {new Date(evt.created_at).toLocaleString("pt-BR")}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
