import type { ReactNode } from "react";

import { Card } from "./Card";
import { Icon, type IconName } from "./Icon";

export type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  tone?: "neutral" | "accent" | "success" | "info";
  className?: string;
};

const TONE = {
  neutral: "text-on-surface dark:text-dark-text",
  accent: "text-accent-deep dark:text-accent-soft",
  success: "text-success",
  info: "text-info"
} as const;

const ICON_TONE = {
  neutral: "bg-surface-container text-on-surface-variant dark:bg-dark-surfaceContainer dark:text-dark-textMuted",
  accent: "bg-accent/15 text-accent-deep dark:text-accent-soft",
  success: "bg-success/15 text-success",
  info: "bg-info/15 text-info"
} as const;

// "Big number" card used in dashboards (admin, partner) and the home metrics row.
// Mirrors the savings/economy widget from the design refs.
export function StatCard({ label, value, hint, icon, tone = "neutral", className = "" }: StatCardProps) {
  return (
    <Card surface="bright" tactile padding="md" rounded="2xl" className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">{label}</p>
          <p className={`mt-2 font-display text-headline-md leading-none ${TONE[tone]}`}>{value}</p>
          {hint ? <p className="mt-2 text-body-sm text-on-surface-variant dark:text-dark-textMuted">{hint}</p> : null}
        </div>
        {icon ? (
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-pill ${ICON_TONE[tone]}`}>
            <Icon name={icon} size={22} />
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export default StatCard;
