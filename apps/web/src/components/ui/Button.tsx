import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: IconName;
  rightIcon?: IconName;
  loading?: boolean;
  loadingLabel?: string;
  children?: ReactNode;
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-label-sm",
  md: "px-6 py-3 text-label-bold",
  lg: "px-8 py-4 text-body-lg font-bold"
};

// Variant classes are split so we can stack tactile-pop only where it makes sense.
// `primary` is ink-on-bone (Material 3 "primary"), `accent` is the brand gold action.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary tactile-pop tactile-pressed hover:opacity-95 disabled:opacity-50 " +
    "dark:bg-white dark:text-brand-ink",
  accent:
    "bg-accent text-on-accent tactile-pop tactile-pressed shadow-gold hover:brightness-105 disabled:opacity-50",
  secondary:
    "bg-surface-bright text-on-surface border border-outline-variant tactile-pop tactile-pressed hover:bg-surface-container " +
    "dark:bg-dark-surfaceElevated dark:text-dark-text dark:border-dark-outline",
  outline:
    "bg-transparent text-on-surface border border-outline-variant hover:bg-surface-container " +
    "dark:text-dark-text dark:border-dark-outline dark:hover:bg-dark-surfaceElevated",
  ghost:
    "bg-transparent text-on-surface hover:bg-surface-container " +
    "dark:text-dark-text dark:hover:bg-dark-surface",
  danger:
    "bg-danger text-white tactile-pop tactile-pressed hover:brightness-110 disabled:opacity-50"
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "primary",
    size = "md",
    fullWidth = false,
    leftIcon,
    rightIcon,
    loading = false,
    loadingLabel,
    disabled,
    className = "",
    children,
    type = "button",
    ...rest
  },
  ref
) {
  const iconSize = size === "lg" ? 22 : size === "sm" ? 16 : 18;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? "true" : undefined}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-pill font-bold transition-all duration-200",
        "disabled:cursor-not-allowed focus-ring",
        fullWidth ? "w-full" : "",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {loading ? (
        <>
          <Icon name="sync" size={iconSize} className="animate-spin" />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        <>
          {leftIcon ? <Icon name={leftIcon} size={iconSize} /> : null}
          {children}
          {rightIcon ? <Icon name={rightIcon} size={iconSize} /> : null}
        </>
      )}
    </button>
  );
});

export default Button;
