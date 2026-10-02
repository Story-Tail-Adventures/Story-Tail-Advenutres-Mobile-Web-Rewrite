import * as React from "react";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import NativeSelect from "@mui/material/NativeSelect";
import OutlinedInput from "@mui/material/OutlinedInput";
import { fieldInputSx, fieldLabelSx } from "./Field";

/**
 * A labelled `<select>`, wired for accessibility the same way [Field] wires an input.
 *
 * Deliberately a sibling of `Field` rather than a mode of it: the two share only the label
 * and hint/error wiring, and a component that took either `options` or `type` would be
 * doing two jobs badly. What they DO share is the OutlinedInput box (`fieldInputSx`), so a
 * country picker sitting beside a city input lines up.
 *
 * MUI's NativeSelect, not its Select: the control stays a real `<select>` with `name`, so a
 * server-action form receives the value with no JavaScript involved, and tests keep native
 * semantics. The arrow is MUI's stock one, which follows currentColor into the dark scheme.
 *
 * No "use client": the onboarding and agent forms that render this are Server Components.
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
  name,
  value,
  defaultValue,
  autoComplete,
  autoFocus,
  required,
  disabled,
  onChange,
  ...selectAttrs
}: SelectFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null, groupDescribedBy ?? null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <FormControl fullWidth error={Boolean(error)} disabled={disabled}>
      <FormLabel htmlFor={id} sx={fieldLabelSx}>
        {label}
      </FormLabel>

      <NativeSelect
        id={id}
        name={name}
        value={value}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required={required}
        onChange={onChange}
        input={<OutlinedInput size="small" sx={fieldInputSx} />}
        // Everything else (onBlur, onFocus, multiple, size, aria-*, data-*) goes straight onto
        // the <select>. InputBase types its own focus handlers for input/textarea only, and it
        // does call the inputProps ones, so this is the typed route for a select.
        inputProps={{
          ...selectAttrs,
          className,
          "aria-invalid": error ? true : undefined,
          // Merged, not replaced: a caller's own aria-describedby (in the spread above)
          // used to win over ours, and dropping it would silence that description.
          "aria-describedby":
            [describedBy, selectAttrs["aria-describedby"]].filter(Boolean).join(" ") || undefined,
        }}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>

      {hint && !error && <FormHelperText id={hintId}>{hint}</FormHelperText>}
      {error && <FormHelperText id={errorId}>{error}</FormHelperText>}
    </FormControl>
  );
}
