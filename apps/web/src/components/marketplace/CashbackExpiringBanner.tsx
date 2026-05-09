import { useEffect, useState } from "react";

import { marketplaceApi, money } from "../../lib/marketplaceApi";

type ExpiringInfo = {
  balance: number;
  total_expiring: number;
  next_expires_at: string | null;
};

export default function CashbackExpiringBanner() {
  const [info, setInfo] = useState<ExpiringInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    marketplaceApi
      .cashbackExpiring(30)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info || info.total_expiring <= 0) return null;

  // Days until next expiration
  const days = info.next_expires_at
    ? Math.max(0, Math.ceil((new Date(info.next_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="rounded-2xl border border-amber-300/50 bg-gradient-to-r from-amber-100 via-amber-50 to-yellow-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-200 text-xl">⏰</span>
        <div className="flex-1">
          <p className="text-xs font-black uppercase tracking-wider text-amber-700">Cashback expirando</p>
          <p className="mt-1 text-sm font-semibold text-amber-900">
            Voce tem <span className="font-black">{money(info.total_expiring)}</span> de cashback que vai expirar
            {days != null && days <= 30 ? (
              <>
                {" "}
                em <span className="font-black">{days === 0 ? "hoje" : `${days} dia${days === 1 ? "" : "s"}`}</span>
              </>
            ) : (
              " em breve"
            )}
            .
          </p>
          <p className="mt-1 text-xs text-amber-800/80">Use em qualquer compra antes de perder.</p>
        </div>
      </div>
    </div>
  );
}
