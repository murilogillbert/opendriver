import type { ReactNode } from "react";

export type MetaBarItem = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
};

// Horizontal metrics row used directly below the hero — the same "stats sliding out
// of the hero" pattern from the design reference. Internal vertical dividers, single
// tactile-pop shell, collapses to vertical on mobile.
export function MetaBar({ items, className = "" }: { items: MetaBarItem[]; className?: string }) {
  return (
    <div
      className={[
        "tactile-pop flex flex-col gap-5 rounded-2xl border border-outline-variant/70 bg-surface-bright",
        "p-5 sm:flex-row sm:items-stretch sm:divide-x sm:divide-outline-variant/60 sm:gap-0",
        "dark:bg-dark-surface dark:border-dark-outline dark:divide-dark-outline",
        className
      ].join(" ")}
    >
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="flex-1 sm:px-6">
          <p className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">{item.label}</p>
          <p className="mt-1 font-display text-headline-sm leading-none text-on-surface dark:text-dark-text">
            {item.value}
          </p>
          {item.hint ? <p className="mt-1 text-body-sm text-on-surface-variant dark:text-dark-textMuted">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

export default MetaBar;
