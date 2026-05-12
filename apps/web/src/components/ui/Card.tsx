import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export type CardSurface = "default" | "bright" | "glass" | "glass-light" | "inverse" | "inset";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  surface?: CardSurface;
  tactile?: boolean;
  padding?: "none" | "sm" | "md" | "lg" | "xl";
  rounded?: "md" | "lg" | "xl" | "2xl" | "3xl";
  bordered?: boolean;
  children?: ReactNode;
};

const SURFACE: Record<CardSurface, string> = {
  default: "bg-surface-bright text-on-surface dark:bg-dark-surface dark:text-dark-text",
  bright: "bg-white text-on-surface dark:bg-dark-surfaceElevated dark:text-dark-text",
  glass: "glass-card text-white",
  "glass-light": "glass-card-light text-on-surface",
  inverse: "bg-inverse-surface text-inverse-on-surface",
  inset: "surface-inset text-on-surface dark:text-dark-text"
};

const PADDING = {
  none: "p-0",
  sm: "p-3",
  md: "p-5",
  lg: "p-6 md:p-8",
  xl: "p-8 md:p-10"
};

const ROUNDED = {
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl"
};

// Single primitive used by every card-like surface in the app. Combines:
//   - surface tone (light bright / dark surface / glass overlay / inverse hero / inset well)
//   - optional tactile-pop shadow
//   - flexible padding + radius
// Bordered defaults to `true` only for non-glass variants (glass already paints a border).
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    surface = "default",
    tactile = false,
    padding = "md",
    rounded = "2xl",
    bordered,
    className = "",
    children,
    ...rest
  },
  ref
) {
  const wantsBorder = bordered ?? (surface !== "glass" && surface !== "glass-light");
  return (
    <div
      ref={ref}
      className={[
        SURFACE[surface],
        PADDING[padding],
        ROUNDED[rounded],
        wantsBorder ? "border border-outline-variant/70 dark:border-dark-outline" : "",
        tactile ? "tactile-pop" : "",
        "transition-colors",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
});

export default Card;
