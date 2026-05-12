export type ProgressBarProps = {
  /** 0-100 (clamped). Anything < 0 is treated as 0; > 100 caps at 100. */
  value: number;
  tone?: "accent" | "success" | "info" | "danger";
  size?: "sm" | "md" | "lg";
  label?: string;
  hint?: string;
  className?: string;
};

const TONE = {
  accent: "bg-accent",
  success: "bg-success",
  info: "bg-info",
  danger: "bg-danger"
} as const;

const SIZE = {
  sm: "h-1.5",
  md: "h-2",
  lg: "h-3"
} as const;

// Inset progress bar — track looks recessed, fill uses brand gold by default.
// Mirrors the "physical hardware" feel from the tactile design system.
export function ProgressBar({ value, tone = "accent", size = "md", label, hint, className = "" }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className={className}>
      {(label || hint) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-label-sm text-on-surface-variant dark:text-dark-textMuted">
          {label ? <span className="font-bold">{label}</span> : <span />}
          {hint ? <span>{hint}</span> : null}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className={[
          "surface-inset w-full overflow-hidden rounded-pill",
          SIZE[size]
        ].join(" ")}
      >
        <div
          className={`h-full rounded-pill transition-[width] duration-500 ease-out ${TONE[tone]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default ProgressBar;
