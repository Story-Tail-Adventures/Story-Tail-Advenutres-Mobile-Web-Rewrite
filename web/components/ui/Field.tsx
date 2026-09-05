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
  /**
   * Rendered between the input and its hint/error text — the password strength track on
   * 2.1.2 and 2.1.5. A slot rather than a second component so there stays exactly one
   * implementation of the label/aria-invalid/aria-describedby wiring.
   */
  meter?: React.ReactNode;
  /**
   * The id of a message OUTSIDE this field that also describes it — the group-level errors
   * on 2.1.10, which belong to a `<fieldset>` rather than to any one input.
   *
   * It has to arrive as a prop. `aria-describedby` on a fieldset is NOT inherited by the
   * controls inside it: assistive technology builds a control's description from its own
   * attribute, and only the `<legend>` feeds into the controls' accessible NAME. So a
   * group error attached only to the fieldset is never read out to somebody who tabs
   * straight into the group.
   */
  describedBy?: string;
}

export function Field({
  id,
  label,
  labelAction,
  error,
  hint,
  meter,
  describedBy: groupDescribedBy,
  className,
  ...props
}: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null, groupDescribedBy ?? null]
      .filter(Boolean)
      .join(" ") || undefined;

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

      {meter}

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
