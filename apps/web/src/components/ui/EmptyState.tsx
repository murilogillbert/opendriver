import type { ReactNode } from "react";

import { Icon, type IconName } from "./Icon";

export type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  tone?: "neutral" | "accent" | "warning";
  className?: string;
};

const TONE = {
  neutral: "text-on-surface-variant dark:text-dark-textMuted",
  accent: "text-accent-deep dark:text-accent-soft",
  warning: "text-warning"
} as const;

const ICON_BG = {
  neutral: "bg-surface-container dark:bg-dark-surfaceContainer",
  accent: "bg-accent/15",
  warning: "bg-warning/15"
} as const;

// Used everywhere a list/grid comes back empty. Big circular icon, gentle copy,
// optional action button. Replaces the ad-hoc bordered boxes scattered across pages.
export function EmptyState({
  title,
  description,
  icon = "search",
  action,
  tone = "neutral",
  className = ""
}: EmptyStateProps) {
  return (
    <div
      className={[
        "tactile-pop dot-grid flex flex-col items-center gap-4 rounded-2xl border border-outline-variant/70",
        "bg-surface-bright px-6 py-12 text-center",
        "dark:bg-dark-surface dark:border-dark-outline",
        className
      ].join(" ")}
    >
      <span className={`flex h-14 w-14 items-center justify-center rounded-pill ${ICON_BG[tone]} ${TONE[tone]}`}>
        <Icon name={icon} size={28} />
      </span>
      <div className="max-w-md space-y-1">
        <p className="font-display text-title-lg text-on-surface dark:text-dark-text">{title}</p>
        {description ? (
          <p className="text-body-md text-on-surface-variant dark:text-dark-textMuted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
