import { useEffect, useState } from "react";

import { marketplaceApi, money } from "../../lib/marketplaceApi";
import { Icon } from "../ui";

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

  const days = info.next_expires_at
    ? Math.max(0, Math.ceil((new Date(info.next_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="tactile-pop rounded-2xl border border-warning/40 bg-warning/10 px-5 py-4 dark:border-warning/30">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-warning/20 text-warning">
          <Icon name="warning" size={22} filled />
        </span>
        <div className="flex-1">
          <p className="text-label-sm uppercase text-warning">Cashback expirando</p>
          <p className="mt-1 text-body-md text-on-surface dark:text-dark-text">
            Você tem <strong>{money(info.total_expiring)}</strong> de cashback que vai expirar
            {days != null && days <= 30 ? (
              <>
                {" "}em <strong>{days === 0 ? "hoje" : `${days} dia${days === 1 ? "" : "s"}`}</strong>
              </>
            ) : (
              " em breve"
            )}
            .
          </p>
          <p className="mt-1 text-body-sm text-on-surface-variant dark:text-dark-textMuted">
            Use em qualquer compra antes de perder.
          </p>
        </div>
      </div>
    </div>
  );
}
