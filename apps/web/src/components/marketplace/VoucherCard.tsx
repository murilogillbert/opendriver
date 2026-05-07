import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { assetUrl } from "../../lib/assets";

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
      className={`overflow-hidden rounded-md border bg-white shadow-soft ${
        usableStatus ? "border-brand-gold/50" : "border-[#e2e8f0] opacity-80"
      }`}
    >
      <div className="grid gap-4 p-5 sm:grid-cols-[6rem_1fr]">
        <div className="h-24 w-24 overflow-hidden rounded-md bg-[#e6ebf2]">
          {props.imagemUrl && (
            <img src={assetUrl(props.imagemUrl)} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-lg font-black leading-tight">{props.produtoNome}</h3>
            {props.status && (
              <span
                className={`rounded-md px-2 py-1 text-xs font-black uppercase tracking-[0.1em] ${
                  usableStatus ? "bg-emerald-50 text-emerald-700" : "bg-[#fef2f2] text-red-700"
                }`}
              >
                {props.status}
              </span>
            )}
          </div>
          <p className="text-xs font-semibold leading-5 text-[#5f6b7b]">
            {channelHint(props.offerType, props.deliveryMethod)} {limitLabel}.
            {props.expiresAt &&
              ` Expira em ${new Date(props.expiresAt).toLocaleDateString("pt-BR")}.`}
          </p>
        </div>
      </div>

      {props.voucherCode && (
        <div className="grid gap-2 border-t border-[#edf1f6] bg-[#f8fafc] px-5 py-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6c7788]">Codigo do voucher</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-white px-3 py-2 font-mono text-sm font-black text-[#0f172a]">
              {props.voucherCode}
            </code>
            <button
              type="button"
              onClick={() => void copy(props.voucherCode!, "voucher")}
              className="rounded-md border border-[#cbd5e1] bg-white px-3 py-2 text-xs font-black text-[#475569]"
            >
              {copiedVoucher ? "Copiado!" : "Copiar codigo"}
            </button>
          </div>
        </div>
      )}

      {token && (
        <div className="grid gap-3 border-t border-[#edf1f6] px-5 py-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6c7788]">
            Token de resgate (mostre ao parceiro)
          </p>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR ${token}`}
                className="h-32 w-32 rounded-md border border-[#e2e8f0] bg-white p-1"
              />
            ) : (
              <div className="grid h-32 w-32 place-items-center rounded-md border border-dashed border-[#cbd5e1] text-xs font-bold text-[#64748b]">
                Gerando QR...
              </div>
            )}
            <div className="grid gap-2 self-center">
              <code className="rounded-md bg-[#0f172a] px-3 py-2 text-center font-mono text-lg font-black tracking-[0.2em] text-white">
                {token}
              </code>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copy(token, "token")}
                  className="rounded-md border border-[#cbd5e1] bg-white px-3 py-2 text-xs font-black text-[#475569]"
                >
                  {copiedToken ? "Copiado!" : "Copiar token"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFullscreen(true)}
                  className="rounded-md bg-brand-ink px-3 py-2 text-xs font-black text-white"
                >
                  Mostrar no balcao
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {props.usageRules && (
        <div className="border-t border-[#edf1f6] bg-[#fefce8] px-5 py-3 text-xs font-semibold leading-5 text-[#854d0e]">
          <strong className="font-black">Regras de uso:</strong> {props.usageRules}
        </div>
      )}

      {showFullscreen && qrDataUrl && (
        <button
          type="button"
          onClick={() => setShowFullscreen(false)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-6"
          aria-label="Fechar QR"
        >
          <div className="grid max-w-md gap-4 rounded-md bg-white p-6 text-center">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#6c7788]">
              Aproxime para o parceiro escanear
            </p>
            <h2 className="font-display text-xl font-black">{props.produtoNome}</h2>
            <img
              src={qrDataUrl}
              alt={`QR ${token}`}
              className="mx-auto h-72 w-72 rounded-md bg-white p-2"
            />
            <code className="rounded-md bg-[#0f172a] px-4 py-3 font-mono text-xl font-black tracking-[0.24em] text-white">
              {token}
            </code>
            <p className="text-xs font-bold text-[#64748b]">Toque para fechar</p>
          </div>
        </button>
      )}
    </article>
  );
}

export default VoucherCard;
