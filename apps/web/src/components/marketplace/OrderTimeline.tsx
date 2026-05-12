import { useEffect, useState } from "react";

import { marketplaceApi, money } from "../../lib/marketplaceApi";
import { Card, Chip, Icon, Skeleton } from "../ui";
import type { ChipTone } from "../ui";

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

const STATUS_TONE = (status: string): ChipTone => {
  if (status === "cancelado" || status === "estornado") return "danger";
  if (status === "entregue") return "success";
  if (status === "confirmado") return "info";
  return "warning";
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

  if (loading)
    return (
      <Card surface="bright" tactile rounded="2xl" padding="md" className="space-y-3">
        <Skeleton height={18} width="40%" />
        <Skeleton height={14} width="100%" />
        <Skeleton height={14} width="70%" />
      </Card>
    );
  if (error)
    return (
      <Card surface="bright" tactile rounded="2xl" padding="md" className="border-danger/30 bg-danger/10">
        <p className="flex items-center gap-2 text-body-sm font-bold text-danger">
          <Icon name="error" size={16} /> Erro ao carregar: {error}
        </p>
      </Card>
    );
  if (!data) return null;

  const currentStatus = data.order.status;
  const isCancelled = currentStatus === "cancelado" || currentStatus === "estornado";
  const currentIndex = STATUS_FLOW.findIndex((s) => s.key === currentStatus);

  const events = [...data.events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <Card surface="bright" tactile rounded="2xl" padding="lg">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">Pedido</p>
          <h3 className="mt-1 font-display text-title-lg text-on-surface dark:text-dark-text">
            #{data.order.public_code ?? data.order.id}
          </h3>
          <p className="mt-1 text-body-sm text-on-surface-variant dark:text-dark-textMuted">
            Total: <span className="font-bold text-on-surface dark:text-dark-text">{money(data.order.valor_pago_total)}</span>
          </p>
        </div>
        <Chip tone={STATUS_TONE(currentStatus)} uppercase>
          {STATUS_DICT[currentStatus] ?? currentStatus}
        </Chip>
      </header>

      {!isCancelled && (
        <ol className="mt-5 space-y-4">
          {STATUS_FLOW.map((step, i) => {
            const reached = i <= currentIndex;
            return (
              <li key={step.key} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 grid h-7 w-7 place-items-center rounded-pill text-label-sm font-bold ${
                    reached ? "bg-success text-white" : "bg-surface-container text-on-surface-variant dark:bg-dark-surfaceContainer dark:text-dark-textMuted"
                  }`}
                >
                  {reached ? <Icon name="check" size={14} /> : i + 1}
                </span>
                <div className="flex-1">
                  <p className={`text-body-md font-bold ${reached ? "text-on-surface dark:text-dark-text" : "text-on-surface-variant dark:text-dark-textMuted"}`}>
                    {step.label}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {events.length > 0 && (
        <details className="mt-5 rounded-2xl surface-inset px-4 py-3">
          <summary className="cursor-pointer text-label-bold text-on-surface dark:text-dark-text">
            Histórico completo
          </summary>
          <ul className="mt-3 space-y-3">
            {events.map((evt) => (
              <li key={evt.id} className="border-l-2 border-outline-variant pl-3 dark:border-dark-outline">
                <p className="text-body-sm font-bold text-on-surface dark:text-dark-text">
                  {STATUS_DICT[evt.status] ?? evt.status}
                </p>
                {evt.note && <p className="text-body-sm text-on-surface-variant dark:text-dark-textMuted">{evt.note}</p>}
                <p className="mt-0.5 text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
                  {new Date(evt.created_at).toLocaleString("pt-BR")}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
