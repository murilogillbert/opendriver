import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { Icon, type IconName } from "./Icon";

type CommonProps = {
  label?: string;
  hint?: string;
  error?: string | null;
  leftIcon?: IconName;
  rightIcon?: IconName;
  fullWidth?: boolean;
  containerClassName?: string;
};

type InputProps = InputHTMLAttributes<HTMLInputElement> & CommonProps;

const BASE_FIELD =
  "w-full rounded-xl surface-inset border border-transparent px-4 py-3 text-body-md text-on-surface placeholder:text-on-surface-variant/70 " +
  "transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/25 " +
  "dark:text-dark-text dark:placeholder:text-dark-textMuted/70 disabled:cursor-not-allowed disabled:opacity-60";

function FieldLabel({ id, label, hint }: { id: string; label?: string; hint?: string }) {
  if (!label && !hint) return null;
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      {label ? (
        <label htmlFor={id} className="text-label-sm uppercase text-on-surface-variant dark:text-dark-textMuted">
          {label}
        </label>
      ) : (
        <span />
      )}
      {hint ? <span className="text-label-sm text-on-surface-variant/80 dark:text-dark-textMuted/80">{hint}</span> : null}
    </div>
  );
}

function FieldError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-1.5 flex items-center gap-1 text-label-sm font-bold text-danger">
      <Icon name="error" size={14} /> {error}
    </p>
  );
}

// Inset-style input: looks recessed into the surface, focus ring uses brand gold.
// Use this everywhere instead of raw <input> so the design stays consistent.
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, rightIcon, id: providedId, className = "", containerClassName = "", ...rest },
  ref
) {
  const generated = useId();
  const id = providedId ?? generated;
  return (
    <div className={containerClassName}>
      <FieldLabel id={id} label={label} hint={hint} />
      <div className="relative">
        {leftIcon ? (
          <Icon name={leftIcon} size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant dark:text-dark-textMuted" />
        ) : null}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? "true" : undefined}
          className={[
            BASE_FIELD,
            leftIcon ? "pl-11" : "",
            rightIcon ? "pr-11" : "",
            error ? "!border-danger focus:!border-danger focus:!ring-danger/25" : "",
            className
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />
        {rightIcon ? (
          <Icon name={rightIcon} size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant dark:text-dark-textMuted" />
        ) : null}
      </div>
      <FieldError error={error} />
    </div>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & CommonProps;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, id: providedId, className = "", containerClassName = "", rows = 4, ...rest },
  ref
) {
  const generated = useId();
  const id = providedId ?? generated;
  return (
    <div className={containerClassName}>
      <FieldLabel id={id} label={label} hint={hint} />
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        aria-invalid={error ? "true" : undefined}
        className={[
          BASE_FIELD,
          "min-h-[6rem] resize-y",
          error ? "!border-danger focus:!border-danger focus:!ring-danger/25" : "",
          className
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      />
      <FieldError error={error} />
    </div>
  );
});
