import { FormEvent, useEffect, useState } from "react";

import { PartnerPayout, friendlyPartnerError, moneyBR, partnerApi } from "../../lib/partnerApi";

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  solicitado: { label: "Solicitado", tone: "bg-amber-100 text-amber-800" },
  em_analise: { label: "Em analise", tone: "bg-blue-100 text-blue-800" },
  aprovado: { label: "Aprovado", tone: "bg-indigo-100 text-indigo-800" },
  pago: { label: "Pago", tone: "bg-emerald-100 text-emerald-800" },
  rejeitado: { label: "Rejeitado", tone: "bg-rose-100 text-rose-800" },
  cancelado: { label: "Cancelado", tone: "bg-slate-200 text-slate-700" }
};

export default function PartnerPayoutsTab() {
  const [payouts, setPayouts] = useState<PartnerPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [bankInfo, setBankInfo] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await partnerApi.listPayouts();
      setPayouts(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await partnerApi.requestPayout({
        amount: Number(amount),
        bank_info: bankInfo,
        notes: notes || undefined
      });
      setAmount("");
      setBankInfo("");
      setNotes("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(friendlyPartnerError(err, "Nao foi possivel solicitar o saque."));
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (id: number) => {
    if (!window.confirm("Cancelar essa solicitacao?")) return;
    try {
      await partnerApi.cancelPayout(id);
      await refresh();
    } catch (err) {
      setError(friendlyPartnerError(err));
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-xl font-black text-slate-800">Solicitar saque</h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-black uppercase tracking-wider text-white transition hover:bg-emerald-800"
          >
            + Nova solicitacao
          </button>
        )}
      </header>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="flex flex-col text-xs font-bold text-slate-700">
            Valor do saque (R$) *
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
            />
          </label>

          <label className="flex flex-col text-xs font-bold text-slate-700">
            Dados bancarios * (banco, agencia, conta, ou chave Pix)
            <textarea
              required
              rows={3}
              value={bankInfo}
              onChange={(e) => setBankInfo(e.target.value)}
              placeholder="Ex.: Pix CNPJ 12.345.678/0001-90 ou Banco do Brasil ag 1234 cc 56789-0"
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
            />
          </label>

          <label className="flex flex-col text-xs font-bold text-slate-700">
            Observacao (opcional)
            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-emerald-700 px-5 py-2 text-xs font-black uppercase tracking-wider text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              {submitting ? "Enviando..." : "Solicitar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="rounded-full border border-slate-300 px-5 py-2 text-xs font-black uppercase tracking-wider text-slate-700"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <h3 className="mt-4 font-display text-lg font-black text-slate-800">Historico</h3>

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : payouts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
          Nenhuma solicitacao ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {payouts.map((p) => {
            const status = STATUS_LABELS[p.status] ?? { label: p.status, tone: "bg-slate-100 text-slate-700" };
            const canCancel = p.status === "solicitado" || p.status === "em_analise";
            return (
              <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-800">Saque #{p.id}</h4>
                      <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-wider ${status.tone}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-1 text-2xl font-black text-slate-800">{moneyBR(p.amount)}</p>
                    <p className="text-xs text-slate-500">
                      Solicitado em {new Date(p.requested_at).toLocaleString("pt-BR")}
                    </p>
                    {p.paid_at && (
                      <p className="text-xs text-emerald-700">
                        Pago em {new Date(p.paid_at).toLocaleString("pt-BR")}
                      </p>
                    )}
                    {p.rejected_at && (
                      <p className="text-xs text-rose-700">
                        Rejeitado em {new Date(p.rejected_at).toLocaleString("pt-BR")}
                      </p>
                    )}
                    {p.admin_notes && (
                      <p className="mt-1 text-xs italic text-slate-600">Nota do admin: {p.admin_notes}</p>
                    )}
                  </div>
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => cancel(p.id)}
                      className="rounded-full border border-rose-400 px-3 py-1 text-[0.65rem] font-black uppercase tracking-wider text-rose-700 hover:bg-rose-50"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
