import * as React from "react";
import { Icon } from "./Icon";
import { cn } from "@/lib/cn";

/**
 * A labelled `<select>`, wired for accessibility the same way [Field] wires an input.
 *
 * Deliberately a sibling of `Field` rather than a mode of it: the two share only the label
 * and hint/error wiring, and a component that took either `options` or `type` would be
 * doing two jobs badly. What they DO share is the `.input` box, so a country picker sitting
 * beside a city input lines up.
 *
 * The chevron is an overlay rather than a `background-image`, because a background SVG
 * cannot read `currentColor` and would need one hex per scheme.
 */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id" | "children"> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  options: readonly SelectOption[];
  /** Rendered first with an empty value — "no answer" as a real choice, not a default. */
  placeholder?: string;
  /** The id of a message outside this field that also describes it — see [Field]. */
  describedBy?: string;
}

export function SelectField({
  id,
  label,
  error,
  hint,
  options,
  placeholder,
  describedBy: groupDescribedBy,
  className,
  ...props
}: SelectFieldProps) {
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

      <div className="relative">
        <select
          id={id}
          className={cn("input", className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon
          name="chevron_down"
          size={16}
          className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-on-surface-variant"
        />
      </div>

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
