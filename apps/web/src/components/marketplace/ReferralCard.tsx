import { useEffect, useState } from "react";

import { marketplaceApi, money } from "../../lib/marketplaceApi";

type ReferralData = Awaited<ReturnType<typeof marketplaceApi.myReferrals>>;

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  pendente: { label: "Aguardando 1ª compra", tone: "bg-slate-100 text-slate-700" },
  qualificado: { label: "Qualificado", tone: "bg-emerald-100 text-emerald-800" },
  pago: { label: "Bonus pago", tone: "bg-emerald-200 text-emerald-900" },
  cancelado: { label: "Cancelado", tone: "bg-rose-100 text-rose-800" }
};

export default function ReferralCard() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    marketplaceApi
      .myReferrals()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return null; // silently hide if user is not authenticated, etc.

  const link = data ? `${window.location.origin}/?ref=${data.code}` : "";

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const shareWhatsApp = () => {
    const message = encodeURIComponent(
      `Te chamo aqui pro Open Driver — uma plataforma com beneficios e cashback pra motorista. Usa meu link e a gente ganha bonus juntos: ${link}`
    );
    window.open(`https://wa.me/?text=${message}`, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-emerald-700">Programa de Indicacao</p>
          <h3 className="mt-1 font-display text-xl font-black text-slate-800">
            Indique e ganhe <span className="text-emerald-700">R$ 10</span> em cashback
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Voce e a pessoa indicada ganham um bonus apos a primeira compra dela.
          </p>
        </div>
        <span className="hidden text-4xl sm:block">🎁</span>
      </div>

      {data && (
        <>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 rounded-xl border border-emerald-300 bg-white px-4 py-3">
              <p className="text-[0.65rem] font-black uppercase tracking-wider text-slate-500">Seu codigo</p>
              <p className="mt-0.5 font-mono text-2xl font-black tracking-widest text-emerald-800">{data.code}</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyLink}
                className="rounded-full bg-emerald-700 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-emerald-800"
              >
                {copied ? "Copiado!" : "Copiar link"}
              </button>
              <button
                type="button"
                onClick={shareWhatsApp}
                className="rounded-full border border-emerald-700 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-700 transition hover:bg-emerald-50"
              >
                WhatsApp
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-white/70 px-3 py-2">
              <p className="text-xs font-bold text-slate-500">Indicados</p>
              <p className="text-xl font-black text-slate-800">{data.stats.total_indicados}</p>
            </div>
            <div className="rounded-xl bg-white/70 px-3 py-2">
              <p className="text-xs font-bold text-slate-500">Qualificados</p>
              <p className="text-xl font-black text-emerald-700">{data.stats.qualificados}</p>
            </div>
            <div className="rounded-xl bg-white/70 px-3 py-2">
              <p className="text-xs font-bold text-slate-500">Total ganho</p>
              <p className="text-xl font-black text-emerald-800">{money(data.stats.total_ganho)}</p>
            </div>
          </div>

          {data.recent.length > 0 && (
            <details className="mt-4 rounded-xl bg-white/60 px-4 py-3">
              <summary className="cursor-pointer text-sm font-bold text-slate-700">
                Ultimas indicacoes ({data.recent.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {data.recent.map((ref) => {
                  const status = STATUS_LABELS[ref.status] ?? { label: ref.status, tone: "bg-slate-100 text-slate-700" };
                  return (
                    <li key={ref.id} className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-700">{ref.indicado_nome.split(" ")[0]}</span>
                      <span className={`rounded-full px-3 py-1 text-[0.65rem] font-black uppercase tracking-wider ${status.tone}`}>
                        {status.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
