import type { HTMLAttributes, ReactNode } from "react";

import { Icon, type IconName } from "./Icon";

export type ChipTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "inverse" | "ghost";

const TONE: Record<ChipTone, string> = {
  neutral: "bg-surface-container text-on-surface dark:bg-dark-surfaceElevated dark:text-dark-text",
  accent: "bg-accent/15 text-accent-deep border border-accent/30 dark:text-accent-soft",
  success: "bg-success/15 text-success border border-success/30",
  warning: "bg-warning/15 text-warning border border-warning/30",
  danger: "bg-danger/15 text-danger border border-danger/30",
  info: "bg-info/15 text-info border border-info/30",
  inverse: "bg-inverse-surface text-inverse-on-surface",
  ghost: "bg-transparent text-on-surface-variant border border-outline-variant dark:text-dark-textMuted dark:border-dark-outline"
};

export type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: ChipTone;
  icon?: IconName;
  size?: "sm" | "md";
  uppercase?: boolean;
  children?: ReactNode;
};

// Pill-shaped status indicator. Uses 8px radius from the design spec (between cards
// at 24px and inputs at 12px) for a deliberate visual contrast.
export function Chip({
  tone = "neutral",
  icon,
  size = "md",
  uppercase = false,
  className = "",
  children,
  ...rest
}: ChipProps) {
  const sizing = size === "sm" ? "text-[10px] px-2 py-0.5 gap-1" : "text-label-sm px-3 py-1 gap-1.5";
  return (
    <span
      className={[
        "inline-flex items-center rounded-pill font-bold whitespace-nowrap",
        sizing,
        uppercase ? "uppercase tracking-[0.12em]" : "",
        TONE[tone],
        className
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 12 : 14} /> : null}
      {children}
    </span>
  );
}

export default Chip;
