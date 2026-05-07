import { useEffect, useState } from "react";
import QRCode from "qrcode";

type QrCodePreviewProps = {
  url: string;
  filename: string;
  size?: number;
};

function QrCodePreview({ url, filename, size = 96 }: QrCodePreviewProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 512, errorCorrectionLevel: "M" })
      .then((value) => {
        if (!cancelled) setDataUrl(value);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const download = () => {
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${filename}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (!dataUrl) {
    return <span className="text-xs font-bold text-[#94a3b8]">Gerando...</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <img
        src={dataUrl}
        alt={`QR ${filename}`}
        width={size}
        height={size}
        className="rounded-md border border-[#e2e8f0] bg-white"
      />
      <button
        type="button"
        onClick={download}
        className="rounded-md bg-[#0ea5e9] px-2.5 py-1.5 text-xs font-black text-white"
      >
        Baixar PNG
      </button>
    </div>
  );
}

export default QrCodePreview;
