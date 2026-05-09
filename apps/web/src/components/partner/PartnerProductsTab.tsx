import { FormEvent, useEffect, useState } from "react";

import {
  PartnerProduct,
  PartnerProductInput,
  friendlyPartnerError,
  moneyBR,
  partnerApi
} from "../../lib/partnerApi";

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  ativo: { label: "Ativo", tone: "bg-emerald-100 text-emerald-800" },
  pausado: { label: "Pausado", tone: "bg-amber-100 text-amber-800" },
  rascunho: { label: "Rascunho", tone: "bg-slate-100 text-slate-700" },
  esgotado: { label: "Esgotado", tone: "bg-rose-100 text-rose-800" }
};

const OFFER_TYPES = [
  { value: "produto_fisico", label: "Produto físico" },
  { value: "produto_digital", label: "Produto digital" },
  { value: "servico", label: "Serviço" },
  { value: "voucher", label: "Voucher" },
  { value: "beneficio_recorrente", label: "Benefício recorrente" },
  { value: "combo", label: "Combo" }
];

const DELIVERY_METHODS = [
  { value: "presencial", label: "Presencial (QR)" },
  { value: "digital", label: "Digital" },
  { value: "fisica", label: "Física (entrega)" }
];

const emptyForm: PartnerProductInput = {
  nome: "",
  descricao_curta: "",
  descricao: "",
  offer_type: "servico",
  delivery_method: "presencial",
  preco_original: 0,
  preco_desconto: 0,
  cashback_percent: 0,
  estoque: null,
  status: "rascunho"
};

export default function PartnerProductsTab() {
  const [products, setProducts] = useState<PartnerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PartnerProduct | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PartnerProductInput>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await partnerApi.listProducts();
      setProducts(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
    setError(null);
  };

  const startEdit = (p: PartnerProduct) => {
    setEditing(p);
    setForm({
      nome: p.nome,
      descricao_curta: p.descricao_curta,
      descricao: p.descricao_curta, // descricao_longa not in list — fall back to short
      offer_type: p.offer_type,
      delivery_method: p.delivery_method,
      preco_original: Number(p.preco_original),
      preco_desconto: Number(p.preco_desconto),
      cashback_percent: p.cashback_percent != null ? Number(p.cashback_percent) : 0,
      estoque: p.estoque,
      imagem_url: p.imagem_url,
      status: p.status as "ativo" | "pausado" | "rascunho"
    });
    setShowForm(true);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editing) {
        await partnerApi.updateProduct(editing.id, form);
      } else {
        await partnerApi.createProduct(form);
      }
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(friendlyPartnerError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const togglePause = async (p: PartnerProduct) => {
    const newStatus = p.status === "ativo" ? "pausado" : "ativo";
    try {
      await partnerApi.updateProduct(p.id, { status: newStatus });
      await refresh();
    } catch (err) {
      setError(friendlyPartnerError(err));
    }
  };

  const remove = async (p: PartnerProduct) => {
    if (!window.confirm(`Excluir "${p.nome}"?`)) return;
    try {
      await partnerApi.deleteProduct(p.id);
      await refresh();
    } catch (err) {
      setError(friendlyPartnerError(err));
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-xl font-black text-slate-800">Meus produtos</h2>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-black uppercase tracking-wider text-white transition hover:bg-emerald-800"
        >
          + Novo produto
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-display text-lg font-black text-slate-800">
            {editing ? `Editar: ${editing.nome}` : "Novo produto"}
          </h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col text-xs font-bold text-slate-700">
              Nome *
              <input
                required
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>

            <label className="flex flex-col text-xs font-bold text-slate-700">
              Tipo *
              <select
                value={form.offer_type}
                onChange={(e) => setForm({ ...form, offer_type: e.target.value })}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              >
                {OFFER_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col text-xs font-bold text-slate-700 sm:col-span-2">
              Descricao curta * (max 280 chars)
              <input
                required
                maxLength={280}
                value={form.descricao_curta}
                onChange={(e) => setForm({ ...form, descricao_curta: e.target.value })}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>

            <label className="flex flex-col text-xs font-bold text-slate-700 sm:col-span-2">
              Descricao completa *
              <textarea
                required
                rows={4}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>

            <label className="flex flex-col text-xs font-bold text-slate-700">
              Preco original *
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={form.preco_original}
                onChange={(e) => setForm({ ...form, preco_original: Number(e.target.value) })}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>

            <label className="flex flex-col text-xs font-bold text-slate-700">
              Preco com desconto *
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={form.preco_desconto}
                onChange={(e) => setForm({ ...form, preco_desconto: Number(e.target.value) })}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>

            <label className="flex flex-col text-xs font-bold text-slate-700">
              Cashback (%)
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.cashback_percent ?? 0}
                onChange={(e) => setForm({ ...form, cashback_percent: Number(e.target.value) })}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>

            <label className="flex flex-col text-xs font-bold text-slate-700">
              Estoque (vazio = ilimitado)
              <input
                type="number"
                min="0"
                value={form.estoque ?? ""}
                onChange={(e) =>
                  setForm({ ...form, estoque: e.target.value === "" ? null : Number(e.target.value) })
                }
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>

            <label className="flex flex-col text-xs font-bold text-slate-700">
              Entrega
              <select
                value={form.delivery_method}
                onChange={(e) => setForm({ ...form, delivery_method: e.target.value })}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              >
                {DELIVERY_METHODS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col text-xs font-bold text-slate-700">
              Status
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as "ativo" | "pausado" | "rascunho" })}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              >
                <option value="rascunho">Rascunho</option>
                <option value="ativo">Ativo</option>
                <option value="pausado">Pausado</option>
              </select>
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-emerald-700 px-5 py-2 text-xs font-black uppercase tracking-wider text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              {submitting ? "Salvando..." : editing ? "Salvar alteracoes" : "Criar produto"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-full border border-slate-300 px-5 py-2 text-xs font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando produtos...</p>
      ) : products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
          Voce ainda nao cadastrou nenhum produto. Clique em "Novo produto" pra comecar.
        </p>
      ) : (
        <ul className="space-y-2">
          {products.map((p) => {
            const status = STATUS_LABELS[p.status] ?? { label: p.status, tone: "bg-slate-100 text-slate-700" };
            return (
              <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-800">{p.nome}</h4>
                      <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-wider ${status.tone}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{p.descricao_curta}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {moneyBR(p.preco_desconto)}{" "}
                      {p.preco_original > p.preco_desconto && (
                        <span className="text-xs text-slate-400 line-through">{moneyBR(p.preco_original)}</span>
                      )}
                      {p.cashback_percent && p.cashback_percent > 0 ? (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                          {p.cashback_percent}% cashback
                        </span>
                      ) : null}
                    </p>
                    {p.estoque != null && (
                      <p className="text-xs text-slate-500">Estoque: {p.estoque}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="rounded-full border border-slate-300 px-3 py-1 text-[0.65rem] font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePause(p)}
                      className="rounded-full border border-amber-400 px-3 py-1 text-[0.65rem] font-black uppercase tracking-wider text-amber-700 hover:bg-amber-50"
                    >
                      {p.status === "ativo" ? "Pausar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      className="rounded-full border border-rose-400 px-3 py-1 text-[0.65rem] font-black uppercase tracking-wider text-rose-700 hover:bg-rose-50"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
