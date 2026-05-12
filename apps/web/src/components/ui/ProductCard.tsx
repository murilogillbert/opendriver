import type { ReactNode } from "react";

import { assetUrl } from "../../lib/assets";
import { money, Product } from "../../lib/marketplaceApi";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { Icon, type IconName } from "./Icon";

export type ProductCardProps = {
  product: Product;
  onBuy?: (product: Product) => void;
  onDetails?: (product: Product) => void;
  buyLabel?: string;
  detailsLabel?: string;
  highlight?: ReactNode;
  variant?: "default" | "feature";
};

const OFFER_TYPE_LABEL: Record<string, string> = {
  produto_fisico: "Produto físico",
  produto_digital: "Produto digital",
  servico: "Serviço",
  voucher: "Voucher",
  beneficio_recorrente: "Benefício recorrente",
  assinatura: "Assinatura",
  combo: "Combo"
};

const DELIVERY_LABEL: Record<string, { label: string; icon: IconName }> = {
  digital: { label: "Entrega digital", icon: "devices" },
  presencial: { label: "Resgate no parceiro", icon: "storefront" },
  fisica: { label: "Entrega física", icon: "local_gas_station" }
};

function offerLabel(product: Product) {
  return OFFER_TYPE_LABEL[product.offer_type ?? ""] ?? "Oferta";
}

function deliveryLabel(product: Product) {
  return DELIVERY_LABEL[product.delivery_method ?? ""] ?? null;
}

function discountPercent(product: Product) {
  const original = Number(product.preco_original) || 0;
  const discounted = Number(product.preco_desconto) || 0;
  if (original <= 0 || discounted >= original) return 0;
  return Math.round(((original - discounted) / original) * 100);
}

// Tactile product tile shared by every catalog grid in the app. Two variants:
//   - "default": balanced 3-up grid card
//   - "feature": taller hero card with bigger image, used in flash-deal rows
export function ProductCard({
  product,
  onBuy,
  onDetails,
  buyLabel = "Quero esta oferta",
  detailsLabel = "Ver detalhes",
  highlight,
  variant = "default"
}: ProductCardProps) {
  const delivery = deliveryLabel(product);
  const off = discountPercent(product);
  const imageHeight = variant === "feature" ? "h-64 sm:h-80" : "h-44 sm:h-48";

  return (
    <Card surface="bright" tactile padding="none" rounded="2xl" className="group flex flex-col overflow-hidden">
      <div className={`relative ${imageHeight} surface-inset overflow-hidden`}>
        {product.imagem_url ? (
          <img
            src={assetUrl(product.imagem_url)}
            alt={product.nome}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-on-surface-variant dark:text-dark-textMuted">
            <Icon name="shopping_bag" size={48} />
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <Chip tone="inverse" size="sm" uppercase>
            {offerLabel(product)}
          </Chip>
          {delivery ? (
            <Chip tone="ghost" size="sm" uppercase icon={delivery.icon}>
              {delivery.label}
            </Chip>
          ) : null}
        </div>
        {off > 0 ? (
          <span className="absolute right-3 top-3 rounded-pill bg-accent px-3 py-1 text-label-sm font-bold text-on-accent shadow-gold">
            -{off}%
          </span>
        ) : null}
        {highlight ? (
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 rounded-xl bg-inverse-surface/85 px-3 py-2 text-label-sm font-bold text-inverse-on-surface backdrop-blur">
            {highlight}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="space-y-1">
          {product.partner_nome ? (
            <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
              {product.partner_nome}
            </p>
          ) : null}
          <h3 className="font-display text-title-lg text-on-surface dark:text-dark-text">{product.nome}</h3>
          <p className="line-clamp-2 text-body-sm text-on-surface-variant dark:text-dark-textMuted">
            {product.descricao_curta}
          </p>
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div>
            {Number(product.preco_original) > Number(product.preco_desconto) ? (
              <p className="text-label-sm text-on-surface-variant line-through dark:text-dark-textMuted">
                {money(Number(product.preco_original))}
              </p>
            ) : null}
            <p className="font-display text-headline-sm text-on-surface dark:text-dark-text">
              {money(Number(product.preco_desconto))}
            </p>
            {Number(product.economia_mensal_estimada ?? 0) > 0 ? (
              <p className="mt-1 text-label-sm font-bold text-accent-deep dark:text-accent-soft">
                Economia ~ {money(Number(product.economia_mensal_estimada))}/mês
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            {onDetails ? (
              <Button variant="ghost" size="sm" onClick={() => onDetails(product)} rightIcon="chevron_right">
                {detailsLabel}
              </Button>
            ) : null}
            {onBuy ? (
              <Button variant="accent" size="sm" onClick={() => onBuy(product)} leftIcon="shopping_cart">
                {buyLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default ProductCard;
