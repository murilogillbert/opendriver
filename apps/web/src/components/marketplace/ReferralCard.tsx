import { useEffect, useState } from "react";

import { marketplaceApi, money } from "../../lib/marketplaceApi";
import { Button, Card, Chip, Icon } from "../ui";
import type { ChipTone } from "../ui";

type ReferralData = Awaited<ReturnType<typeof marketplaceApi.myReferrals>>;

const STATUS_LABELS: Record<string, { label: string; tone: ChipTone }> = {
  pendente: { label: "Aguardando 1ª compra", tone: "neutral" },
  qualificado: { label: "Qualificado", tone: "info" },
  pago: { label: "Bônus pago", tone: "success" },
  cancelado: { label: "Cancelado", tone: "danger" }
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

  if (error) return null;

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
      `Te chamo aqui pro DriverHub — uma plataforma com benefícios e cashback pra motorista. Usa meu link e a gente ganha bônus juntos: ${link}`
    );
    window.open(`https://wa.me/?text=${message}`, "_blank", "noopener,noreferrer");
  };

  return (
    <Card surface="bright" tactile rounded="3xl" padding="lg" className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-success/25 blur-3xl" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <Chip tone="success" uppercase icon="star">
            Programa de indicação
          </Chip>
          <h3 className="mt-3 font-display text-headline-sm text-on-surface dark:text-dark-text">
            Indique e ganhe <span className="text-success">R$ 10</span> em cashback
          </h3>
          <p className="mt-1 text-body-md text-on-surface-variant dark:text-dark-textMuted">
            Você e a pessoa indicada ganham bônus após a primeira compra dela.
          </p>
        </div>
      </div>

      {data && (
        <>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Card surface="inset" rounded="xl" padding="md" className="flex-1 border-success/30">
              <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">Seu código</p>
              <p className="mt-1 font-mono text-headline-sm font-black tracking-widest text-success">{data.code}</p>
            </Card>
            <div className="flex gap-2">
              <Button variant="primary" leftIcon={copied ? "check" : "content_copy"} onClick={copyLink}>
                {copied ? "Copiado!" : "Copiar link"}
              </Button>
              <Button variant="secondary" leftIcon="arrow_forward" onClick={shareWhatsApp}>
                WhatsApp
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <Card surface="inset" rounded="xl" padding="sm" className="text-center border-0">
              <p className="text-label-sm text-on-surface-variant dark:text-dark-textMuted">Indicados</p>
              <p className="mt-1 font-display text-title-lg text-on-surface dark:text-dark-text">{data.stats.total_indicados}</p>
            </Card>
            <Card surface="inset" rounded="xl" padding="sm" className="text-center border-0">
              <p className="text-label-sm text-on-surface-variant dark:text-dark-textMuted">Qualificados</p>
              <p className="mt-1 font-display text-title-lg text-success">{data.stats.qualificados}</p>
            </Card>
            <Card surface="inset" rounded="xl" padding="sm" className="text-center border-0">
              <p className="text-label-sm text-on-surface-variant dark:text-dark-textMuted">Total ganho</p>
              <p className="mt-1 font-display text-title-lg text-success">{money(data.stats.total_ganho)}</p>
            </Card>
          </div>

          {data.recent.length > 0 && (
            <details className="mt-4 rounded-2xl surface-inset px-4 py-3">
              <summary className="cursor-pointer text-label-bold text-on-surface dark:text-dark-text">
                Últimas indicações ({data.recent.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {data.recent.map((ref) => {
                  const status = STATUS_LABELS[ref.status] ?? { label: ref.status, tone: "neutral" as ChipTone };
                  return (
                    <li key={ref.id} className="flex items-center justify-between text-body-sm">
                      <span className="flex items-center gap-2 font-bold text-on-surface dark:text-dark-text">
                        <Icon name="person" size={16} className="text-on-surface-variant dark:text-dark-textMuted" />
                        {ref.indicado_nome.split(" ")[0]}
                      </span>
                      <Chip tone={status.tone} size="sm" uppercase>
                        {status.label}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </>
      )}
    </Card>
  );
}
