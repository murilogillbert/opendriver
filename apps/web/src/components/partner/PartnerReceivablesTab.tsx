import { useEffect, useState } from "react";

import { PartnerReceivable, moneyBR, partnerApi } from "../../lib/partnerApi";

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  pendente: { label: "Pendente", tone: "bg-amber-100 text-amber-800" },
  fechado: { label: "Fechado p/ pagamento", tone: "bg-blue-100 text-blue-800" },
  pago: { label: "Pago", tone: "bg-emerald-100 text-emerald-800" },
  cancelado: { label: "Cancelado", tone: "bg-rose-100 text-rose-800" }
};

export default function PartnerReceivablesTab() {
  const [items, setItems] = useState<PartnerReceivable[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    partnerApi
      .receivables(statusFilter ? { status: statusFilter } : undefined)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  // Sums per status
  const sums = items.reduce<Record<string, number>>((acc, r) => {
    const key = r.status ?? "outro";
    acc[key] = (acc[key] ?? 0) + Number(r.valor ?? 0);
    return acc;
  }, {});

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-black text-slate-800">Extrato de recebiveis</h2>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-700"
        >
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="fechado">Fechado p/ pagamento</option>
          <option value="pago">Pago</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-amber-50 p-3">
          <p className="text-[0.65rem] font-black uppercase tracking-wider text-amber-700">Pendentes</p>
          <p className="mt-1 text-lg font-black text-amber-900">{moneyBR(sums.pendente ?? 0)}</p>
        </div>
        <div className="rounded-xl bg-blue-50 p-3">
          <p className="text-[0.65rem] font-black uppercase tracking-wider text-blue-700">Fechado</p>
          <p className="mt-1 text-lg font-black text-blue-900">{moneyBR(sums.fechado ?? 0)}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3">
          <p className="text-[0.65rem] font-black uppercase tracking-wider text-emerald-700">Pago</p>
          <p className="mt-1 text-lg font-black text-emerald-900">{moneyBR(sums.pago ?? 0)}</p>
        </div>
        <div className="rounded-xl bg-slate-100 p-3">
          <p className="text-[0.65rem] font-black uppercase tracking-wider text-slate-700">Total</p>
          <p className="mt-1 text-lg font-black text-slate-900">
            {moneyBR(items.reduce((acc, r) => acc + Number(r.valor ?? 0), 0))}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
          Nenhum recebivel no periodo.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => {
            const status = STATUS_LABELS[r.status] ?? { label: r.status, tone: "bg-slate-100 text-slate-700" };
            return (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-800">{r.descricao || "Recebivel"}</h4>
                      <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-wider ${status.tone}`}>
                        {status.label}
                      </span>
                    </div>
                    {r.produto_nome && (
                      <p className="mt-1 text-sm text-slate-700">
                        <span className="font-semibold">Produto:</span> {r.produto_nome}
                      </p>
                    )}
                    {r.cliente_nome && (
                      <p className="text-sm text-slate-600">
                        <span className="font-semibold">Cliente:</span> {r.cliente_nome.split(" ")[0]}
                      </p>
                    )}
                    {r.redeemed_at && (
                      <p className="text-xs text-slate-500">
                        Resgate: {new Date(r.redeemed_at).toLocaleString("pt-BR")}
                      </p>
                    )}
                    {r.due_date && (
                      <p className="text-xs text-slate-500">
                        Previsto: {new Date(r.due_date).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                  <p className="text-right text-xl font-black text-slate-800">{moneyBR(r.valor)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
