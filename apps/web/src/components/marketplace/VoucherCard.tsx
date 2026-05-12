import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { assetUrl } from "../../lib/assets";
import { Button, Chip, Icon } from "../ui";

type VoucherCardProps = {
  produtoNome: string;
  imagemUrl?: string | null;
  voucherCode?: string | null;
  redemptionToken?: string | null;
  status?: string | null;
  redemptionLimit?: number | null;
  redemptionCount?: number;
  expiresAt?: string | null;
  usageRules?: string | null;
  offerType?: string | null;
  deliveryMethod?: string | null;
  // Used for analytics or order linkage. Not rendered.
  orderPublicCode?: string | null;
};

const channelHint = (offerType?: string | null, deliveryMethod?: string | null) => {
  if (deliveryMethod === "presencial") return "Presencial — apresente o QR ou o token ao parceiro.";
  if (offerType === "voucher") return "Voucher digital — use no app/site do parceiro.";
  if (offerType === "produto_digital") return "Produto digital — acesse o conteudo na area do cliente do parceiro.";
  if (offerType === "servico") return "Servico presencial — apresente o token ao chegar no parceiro.";
  return "Apresente o codigo ou QR para o parceiro validar o resgate.";
};

function VoucherCard(props: VoucherCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedVoucher, setCopiedVoucher] = useState(false);

  const token = props.redemptionToken?.trim() || null;

  useEffect(() => {
    if (!token) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(token, { margin: 1, width: 480, errorCorrectionLevel: "M" })
      .then((value) => {
        if (!cancelled) setQrDataUrl(value);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const copy = async (value: string, kind: "token" | "voucher") => {
    try {
      await navigator.clipboard.writeText(value);
      if (kind === "token") {
        setCopiedToken(true);
        window.setTimeout(() => setCopiedToken(false), 1500);
      } else {
        setCopiedVoucher(true);
        window.setTimeout(() => setCopiedVoucher(false), 1500);
      }
    } catch {
      // Clipboard API may be blocked (insecure context) — keep silent and let the user select manually.
    }
  };

  const exhausted = props.status === "esgotado";
  const expired = props.status === "expirado";
  const cancelled = props.status === "cancelado";
  const usableStatus = !exhausted && !expired && !cancelled;
  const limitLabel = props.redemptionLimit != null
    ? `${props.redemptionCount ?? 0}/${props.redemptionLimit} usos`
    : "uso ilimitado";

  return (
    <article
      className={`tactile-pop overflow-hidden rounded-2xl border bg-surface-bright transition dark:bg-dark-surface ${
        usableStatus ? "border-accent/50" : "border-outline-variant/60 opacity-80 dark:border-dark-outline"
      }`}
    >
      <div className="grid gap-4 p-5 sm:grid-cols-[6rem_1fr]">
        <div className="h-24 w-24 overflow-hidden rounded-xl surface-inset">
          {props.imagemUrl ? (
            <img src={assetUrl(props.imagemUrl)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-on-surface-variant dark:text-dark-textMuted">
              <Icon name="confirmation_number" size={28} />
            </div>
          )}
        </div>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-display text-title-md text-on-surface dark:text-dark-text">{props.produtoNome}</h3>
            {props.status && (
              <Chip tone={usableStatus ? "success" : "danger"} size="sm" uppercase>
                {props.status}
              </Chip>
            )}
          </div>
          <p className="text-body-sm text-on-surface-variant dark:text-dark-textMuted">
            {channelHint(props.offerType, props.deliveryMethod)} {limitLabel}.
            {props.expiresAt && ` Expira em ${new Date(props.expiresAt).toLocaleDateString("pt-BR")}.`}
          </p>
        </div>
      </div>

      {props.voucherCode && (
        <div className="grid gap-2 border-t border-outline-variant/60 px-5 py-4 surface-inset dark:border-dark-outline">
          <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">Código do voucher</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-xl bg-surface-bright px-3 py-2 font-mono text-body-md font-bold text-on-surface dark:bg-dark-surfaceElevated dark:text-dark-text">
              {props.voucherCode}
            </code>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={copiedVoucher ? "check" : "content_copy"}
              onClick={() => void copy(props.voucherCode!, "voucher")}
            >
              {copiedVoucher ? "Copiado!" : "Copiar código"}
            </Button>
          </div>
        </div>
      )}

      {token && (
        <div className="grid gap-3 border-t border-outline-variant/60 px-5 py-4 dark:border-dark-outline">
          <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
            Token de resgate (mostre ao parceiro)
          </p>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR ${token}`}
                className="h-32 w-32 rounded-xl border border-outline-variant bg-white p-1 dark:border-dark-outline"
              />
            ) : (
              <div className="grid h-32 w-32 place-items-center rounded-xl border border-dashed border-outline-variant text-body-sm font-bold text-on-surface-variant dark:border-dark-outline dark:text-dark-textMuted">
                <span className="inline-flex items-center gap-1"><Icon name="sync" size={14} className="animate-spin" /> Gerando...</span>
              </div>
            )}
            <div className="grid gap-2 self-center">
              <code className="rounded-xl bg-inverse-surface px-3 py-2 text-center font-mono text-title-lg font-black tracking-[0.2em] text-inverse-on-surface">
                {token}
              </code>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={copiedToken ? "check" : "content_copy"}
                  onClick={() => void copy(token, "token")}
                >
                  {copiedToken ? "Copiado!" : "Copiar token"}
                </Button>
                <Button variant="primary" size="sm" leftIcon="qr_code_2" onClick={() => setShowFullscreen(true)}>
                  Mostrar no balcão
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {props.usageRules && (
        <div className="border-t border-outline-variant/60 bg-warning/10 px-5 py-3 text-body-sm text-on-surface-variant dark:border-dark-outline dark:bg-warning/10">
          <strong className="text-warning">Regras de uso:</strong> {props.usageRules}
        </div>
      )}

      {showFullscreen && qrDataUrl && (
        <button
          type="button"
          onClick={() => setShowFullscreen(false)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-6 backdrop-blur"
          aria-label="Fechar QR"
        >
          <div className="grid max-w-md gap-4 rounded-3xl bg-white p-8 text-center shadow-glass">
            <Chip tone="accent" uppercase className="mx-auto">Aproxime para o parceiro escanear</Chip>
            <h2 className="font-display text-headline-sm text-on-surface">{props.produtoNome}</h2>
            <img
              src={qrDataUrl}
              alt={`QR ${token}`}
              className="mx-auto h-72 w-72 rounded-2xl bg-white p-2"
            />
            <code className="rounded-xl bg-inverse-surface px-4 py-3 font-mono text-headline-sm font-black tracking-[0.24em] text-inverse-on-surface">
              {token}
            </code>
            <p className="text-body-sm font-bold text-on-surface-variant">Toque para fechar</p>
          </div>
        </button>
      )}
    </article>
  );
}

export default VoucherCard;
