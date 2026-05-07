import { useEffect, useState } from "react";

import { assetUrl } from "../../lib/assets";
import { CheckinPageData, marketplaceApi, money } from "../../lib/marketplaceApi";

type CheckinPageProps = {
  token: string;
};

function CheckinPage({ token }: CheckinPageProps) {
  const [data, setData] = useState<CheckinPageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    marketplaceApi
      .loadCheckin(token)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        // Fire analytics — don't block the page if it fails.
        marketplaceApi.trackCheckin(token).catch(() => undefined);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "checkin_not_found");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const goToCheckout = (productId: number) => {
    const target = `/checkout/${productId}?c=${encodeURIComponent(token)}`;
    window.history.pushState(null, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  if (error) {
    return (
      <main className="min-h-screen bg-[#f6f8fb] px-5 py-10 text-[#111827]">
        <section className="mx-auto max-w-xl rounded-md border border-red-200 bg-red-50 p-6">
          <h1 className="font-display text-2xl font-black text-red-800">QR code indisponivel</h1>
          <p className="mt-2 text-sm font-bold text-red-700">
            Este check-in expirou ou esta pausado. Procure um atendente do parceiro.
          </p>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#f6f8fb] px-5 py-10 text-[#111827]">
        <p className="mx-auto max-w-xl text-sm font-bold text-[#68748a]">Carregando ofertas do parceiro...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#111827]">
      <section className="mx-auto max-w-3xl">
        <header className="rounded-md border border-[#dfe5ef] bg-white p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-gold">Check-in Open Driver</p>
          <h1 className="mt-2 font-display text-3xl font-black">{data.partner.nome}</h1>
          <p className="mt-2 text-sm font-semibold text-[#68748a]">
            {data.location?.nome ?? `${data.partner.cidade}/${data.partner.estado}`}
            {data.location?.endereco ? ` — ${data.location.endereco}` : ""}
          </p>
          {data.qrcode.label && (
            <p className="mt-3 inline-block rounded-md bg-brand-gold/20 px-3 py-1 text-xs font-black text-brand-ink">
              {data.qrcode.label}
            </p>
          )}
          <p className="mt-4 text-sm font-bold text-[#425166]">
            Compre uma das ofertas abaixo e ganhe cashback automatico para usar nas proximas compras.
          </p>
        </header>

        <ul className="mt-6 grid gap-4">
          {data.products.length === 0 ? (
            <li className="rounded-md border border-[#dfe5ef] bg-white p-6 text-sm font-bold text-[#68748a]">
              Nenhuma oferta vinculada a este check-in ainda.
            </li>
          ) : (
            data.products.map((product) => (
              <li key={product.id} className="rounded-md border border-[#dfe5ef] bg-white p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="h-24 w-32 overflow-hidden rounded-md bg-[#e6ebf2]">
                    {product.imagem_url && <img src={assetUrl(product.imagem_url)} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="flex-1">
                    <h2 className="font-black text-lg">{product.nome}</h2>
                    <p className="mt-1 text-sm font-semibold text-[#68748a]">{product.descricao_curta}</p>
                    <div className="mt-2 flex items-center gap-3 text-sm">
                      <span className="line-through text-[#7a8496] font-bold">{money(product.preco_original)}</span>
                      <strong className="text-xl font-black">{money(product.preco_desconto)}</strong>
                      {product.cashback_percent != null && product.cashback_percent > 0 && (
                        <span className="rounded-md bg-brand-gold/20 px-2 py-1 text-xs font-black text-brand-ink">
                          +{product.cashback_percent}% cashback
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => goToCheckout(product.id)}
                    className="rounded-md bg-brand-gold px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-brand-ink"
                  >
                    Comprar
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}

export default CheckinPage;
