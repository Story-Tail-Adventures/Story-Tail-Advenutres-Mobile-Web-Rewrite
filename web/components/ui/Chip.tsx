import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * A chip that is really a checkbox or a radio.
 *
 * The prototype (`C2111_PreferencesCapture`) draws chips as `<span className="chip">` with
 * selection encoded by appending " ✓" to the label. Neither survives contact with a real
 * form: a span is not focusable, not announced and not operable by keyboard, and a value of
 * `"Caribbean ✓"` poisons every comparison, filter and P2 search join downstream.
 *
 * So the control is a real input, visually hidden inside its own label. `.chip-filter`
 * styles the selected state through `:has(input:checked)`, which means an uncontrolled
 * group needs no React state at all — and the whole form still works with JavaScript off,
 * matching how the rest of §2.1 is built.
 */

export interface ChipInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "className"
> {
  label: string;
  type?: "checkbox" | "radio";
  className?: string;
}

export function ChipInput({
  label,
  type = "checkbox",
  className,
  ...props
}: ChipInputProps) {
  return (
    <label className={cn("chip chip-filter", className)}>
      <input type={type} className="sr-only" {...props} />
      {label}
    </label>
  );
}

/** The wrapping row a chip group sits in. Wraps rather than scrolls — see components.css. */
export function ChipGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("chip-group", className)}>{children}</div>;
}
