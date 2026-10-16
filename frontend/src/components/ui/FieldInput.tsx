import type { InputHTMLAttributes } from 'react';

export interface FieldInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** `light` (default) is the fixed white auth panel. `ink` follows --cp-ink-rgb, for the dark customer canvas. */
  tone?: 'light' | 'ink';
  /** Keep the label for screen readers only, e.g. when a section heading already names the field. */
  hideLabel?: boolean;
}

// Static strings: Tailwind scans source text, so tones are pre-fused rather than interpolated.
const TONE = {
  light: {
    label: 'text-[#444]',
    input: 'bg-white text-[#141414]',
    border: 'border-[var(--cp-surface-border)]',
    hint: 'text-[#666]',
  },
  ink: {
    label: 'text-[rgb(var(--cp-ink-rgb))]/65',
    input:
      'bg-[rgb(var(--cp-ink-rgb))]/[0.04] text-[rgb(var(--cp-ink-rgb))] placeholder:text-[rgb(var(--cp-ink-rgb))]/40 disabled:opacity-50',
    border: 'border-[rgb(var(--cp-ink-rgb))]/20',
    hint: 'text-[rgb(var(--cp-ink-rgb))]/55',
  },
} as const;

export const FieldInput = ({
  label,
  hint,
  error,
  id,
  className,
  tone = 'light',
  hideLabel = false,
  ...rest
}: FieldInputProps) => {
  const palette = TONE[tone];
  return (
    <div className="mb-3.5">
      <label
        htmlFor={id}
        className={hideLabel ? 'sr-only' : `mb-1.5 block text-[13px] ${palette.label}`}
      >
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        className={[
          `min-h-10 w-full rounded-lg border px-3 text-sm ${palette.input}`,
          error ? 'border-danger' : palette.border,
          'transition-[border-color] duration-fast ease-out focus:border-brand focus:outline-none',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
      {hint ? <p className={`mt-0 mb-3.5 text-[13px] ${palette.hint}`}>{hint}</p> : null}
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </div>
  );
};

export default FieldInput;
