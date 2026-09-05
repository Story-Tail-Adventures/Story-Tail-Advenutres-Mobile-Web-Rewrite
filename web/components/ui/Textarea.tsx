import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * A labelled `<textarea>`, wired the same way [Field] wires an input.
 *
 * Shares `.input`'s box so it lines up beside one, with the fixed height and the
 * single-line `line-height` overridden — those are what make `.input` an input.
 */

export interface TextareaFieldProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id"
> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** The id of a message outside this field that also describes it — see [Field]. */
  describedBy?: string;
}

export function TextareaField({
  id,
  label,
  error,
  hint,
  describedBy: groupDescribedBy,
  className,
  rows = 3,
  ...props
}: TextareaFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null, groupDescribedBy ?? null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        className={cn("input h-auto py-2.5 leading-normal", className)}
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
