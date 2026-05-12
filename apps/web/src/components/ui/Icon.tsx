import type { CSSProperties } from "react";

export type IconName =
  | "account_circle"
  | "arrow_back"
  | "arrow_forward"
  | "build"
  | "check"
  | "check_circle"
  | "chevron_right"
  | "close"
  | "confirmation_number"
  | "content_copy"
  | "credit_card"
  | "devices"
  | "error"
  | "info"
  | "local_gas_station"
  | "location_on"
  | "logout"
  | "menu"
  | "my_location"
  | "payments"
  | "person"
  | "pix"
  | "qr_code_2"
  | "savings"
  | "search"
  | "shopping_bag"
  | "shopping_cart"
  | "star"
  | "storefront"
  | "sync"
  | "trending_up"
  | "verified"
  | "warning";

export type IconProps = {
  name: IconName;
  size?: number;
  filled?: boolean;
  weight?: 300 | 400 | 500 | 600 | 700;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
};

// Thin wrapper over Material Symbols Outlined. Keeps font-variation-settings consistent
// (so a "filled" star always reads the same), and ensures decorative icons get aria-hidden
// while labeled ones expose role="img".
export function Icon({ name, size = 20, filled = false, weight = 500, className = "", style, ariaLabel }: IconProps) {
  const decorative = !ariaLabel;
  return (
    <span
      className={`material-symbols-outlined select-none align-middle ${className}`}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={ariaLabel}
      style={{
        fontSize: `${size}px`,
        lineHeight: 1,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
        ...style
      }}
    >
      {name}
    </span>
  );
}

export default Icon;
