import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * A labelled text input with optional error and hint text.
 *
 * Wires up the accessibility relationships that are easy to forget and impossible to
 * retrofit cheaply: label/input association, aria-invalid, and aria-describedby
 * pointing at whichever of hint/error is actually rendered.
 */

export interface FieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  /** Rendered on the label row, right-aligned — e.g. the "Forgot?" link on 2.1.1. */
  labelAction?: React.ReactNode;
  error?: string;
  hint?: string;
}

export function Field({
  id,
  label,
  labelAction,
  error,
  hint,
  className,
  ...props
}: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div>
      {labelAction ? (
        <div className="flex items-baseline justify-between">
          <label className="field-label" htmlFor={id}>
            {label}
          </label>
          {labelAction}
        </div>
      ) : (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}

      <input
        id={id}
        className={cn("input", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />

      {hint && !error && (
        <p id={hintId} className="t-body-s mt-1.5 text-on-surface-variant">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="t-body-s mt-1.5 text-error">
          {error}
        </p>
      )}
    </div>
  );
}
