import { useEffect, useState } from "react";

import { moneyBR, partnerApi } from "../../lib/partnerApi";

type DailyPoint = { dia: string; total: number; receita: number };
type TopProduct = { id: number; nome: string; resgates: number; receita: number };
type QrPerf = {
  id: number;
  label: string | null;
  token: string;
  status: string;
  scans: number;
  conversions: number;
  receita: number;
};

export default function PartnerAnalyticsTab() {
  const [days, setDays] = useState(30);
  const [redemptions, setRedemptions] = useState<DailyPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [qrPerf, setQrPerf] = useState<QrPerf[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      partnerApi.analyticsRedemptions(days),
      partnerApi.analyticsTopProducts(days),
      partnerApi.analyticsQrPerformance(days)
    ])
      .then(([r, t, q]) => {
        if (cancelled) return;
        setRedemptions(r);
        setTopProducts(t);
        setQrPerf(q);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  // Compute summary
  const totalResgates = redemptions.reduce((acc, p) => acc + Number(p.total ?? 0), 0);
  const totalReceita = redemptions.reduce((acc, p) => acc + Number(p.receita ?? 0), 0);
  const avgPerDay = redemptions.length > 0 ? totalResgates / redemptions.length : 0;

  // Bar chart max for scaling
  const maxTotal = Math.max(1, ...redemptions.map((p) => Number(p.total ?? 0)));

  return (
    <section className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-black text-slate-800">Analytics</h2>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-700"
        >
          <option value={7}>7 dias</option>
          <option value={30}>30 dias</option>
          <option value={90}>90 dias</option>
          <option value={180}>180 dias</option>
        </select>
      </header>

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-emerald-50 p-4">
              <p className="text-[0.65rem] font-black uppercase tracking-wider text-emerald-700">Resgates no periodo</p>
              <p className="mt-1 text-2xl font-black text-emerald-900">{totalResgates}</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-4">
              <p className="text-[0.65rem] font-black uppercase tracking-wider text-blue-700">Receita</p>
              <p className="mt-1 text-2xl font-black text-blue-900">{moneyBR(totalReceita)}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-4">
              <p className="text-[0.65rem] font-black uppercase tracking-wider text-amber-700">Media por dia</p>
              <p className="mt-1 text-2xl font-black text-amber-900">{avgPerDay.toFixed(1)}</p>
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-display text-base font-black text-slate-800">Resgates por dia</h3>
            {redemptions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Sem resgates no periodo.</p>
            ) : (
              <div className="mt-3 flex h-40 items-end gap-1 overflow-x-auto">
                {redemptions.map((p) => {
                  const heightPct = (Number(p.total ?? 0) / maxTotal) * 100;
                  return (
                    <div key={p.dia} className="flex min-w-[24px] flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t bg-emerald-600 transition-all"
                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                        title={`${p.dia}: ${p.total} resgates / ${moneyBR(p.receita)}`}
                      />
                      <span className="text-[0.55rem] text-slate-500 -rotate-45 whitespace-nowrap">
                        {new Date(p.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-display text-base font-black text-slate-800">Top produtos</h3>
            {topProducts.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Sem dados.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {topProducts.map((p, i) => (
                  <li key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                        {i + 1}
                      </span>
                      <span className="font-bold text-slate-800">{p.nome}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-black text-slate-800">{p.resgates} resgates</span>
                      <span className="block text-xs text-slate-500">{moneyBR(p.receita)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-display text-base font-black text-slate-800">Performance dos QR codes</h3>
            {qrPerf.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Voce ainda nao tem QR codes ativos.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {qrPerf.map((q) => {
                  const conversionRate = q.scans > 0 ? (q.conversions / q.scans) * 100 : 0;
                  return (
                    <li key={q.id} className="rounded-lg bg-slate-50 px-3 py-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">
                          {q.label ?? `QR #${q.id}`}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-wider ${
                            q.status === "ativo" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {q.status}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <p className="text-slate-500">Scans</p>
                          <p className="text-base font-black text-slate-800">{q.scans}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Compras</p>
                          <p className="text-base font-black text-emerald-700">{q.conversions}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Conversao</p>
                          <p className="text-base font-black text-blue-700">{conversionRate.toFixed(1)}%</p>
                        </div>
                      </div>
                      <p className="mt-1 text-right text-xs text-slate-600">Receita: <span className="font-bold text-slate-800">{moneyBR(q.receita)}</span></p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
