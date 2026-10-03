import * as React from "react";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import OutlinedInput from "@mui/material/OutlinedInput";

/**
 * A labelled text input with optional error and hint text, on MUI's form primitives.
 *
 * Wires up the accessibility relationships that are easy to forget and impossible to
 * retrofit cheaply: label/input association, aria-invalid, and aria-describedby
 * pointing at whichever of hint/error is actually rendered.
 *
 * STRUCTURE IS THE LEGACY ONE, ON MUI PARTS. A stationary FormLabel above an OutlinedInput,
 * then the hint or error as FormHelperText — not MUI's floating-label TextField. Two reasons:
 * the label stays where the §2 forms were laid out around it (a floating label would change
 * every form's height), and the control is a plain native <input>, so a server-action form
 * receives the same FormData it always did. Colours, radius, the hover / focus / error
 * outline and the type are MUI's; the 44px box is the legacy one.
 *
 * Native attributes (name, value, required, autoComplete, inputMode, pattern, …) all reach
 * the <input>: the ones InputBase knows go in as props, everything else through inputProps.
 *
 * No "use client": 16 callers, most of them Server Components, render this with plain props.
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

/**
 * The label and control sx shared by Field, SelectField, TextareaField and DateField, so the
 * four line up on one form.
 *
 * Label: MUI's caption size (12px, the size its own shrunk labels use) at the legacy 1.3
 * line-height and 6px gap, so the label row keeps its height. Colour follows FormControl
 * state (text.secondary, primary when focused, error when invalid) — that part is MUI's.
 * Control: `size="small"` is MUI's 40px input; 44px is the legacy box (and §4.2's touch
 * minimum), so the root grows to it and the input centres inside.
 */
export const fieldLabelSx = {
  display: "block",
  mb: "6px",
  typography: "caption",
  lineHeight: 1.3,
} as const;
export const fieldInputSx = { minHeight: 44 } as const;

export function Field({
  id,
  label,
  labelAction,
  error,
  hint,
  meter,
  describedBy: groupDescribedBy,
  className,
  name,
  type,
  value,
  defaultValue,
  placeholder,
  autoComplete,
  autoFocus,
  readOnly,
  required,
  disabled,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  onKeyUp,
  ...inputAttrs
}: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    // The hint is only rendered when there is no error, so only point at it then.
    [error ? errorId : null, hint && !error ? hintId : null, groupDescribedBy ?? null]
      .filter(Boolean)
      .join(" ") || undefined;

  const labelNode = (
    <FormLabel htmlFor={id} sx={fieldLabelSx}>
      {label}
    </FormLabel>
  );

  return (
    <FormControl fullWidth error={Boolean(error)} disabled={disabled}>
      {labelAction ? (
        <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          {labelNode}
          {labelAction}
        </Box>
      ) : (
        labelNode
      )}

      <OutlinedInput
        id={id}
        name={name}
        type={type}
        value={value}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        readOnly={readOnly}
        // On the input only, not on FormControl: the legacy label drew no asterisk.
        required={required}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        size="small"
        sx={fieldInputSx}
        inputProps={{
          ...inputAttrs,
          // Legacy callers put text utilities (`font-mono tracking-[0.5em]`) on the <input>.
          className,
          // InputBase writes aria-invalid="false" when valid; the legacy contract is absent.
          "aria-invalid": error ? true : undefined,
          // Merged, not replaced: a caller's own aria-describedby (in the spread above)
          // used to win over ours, and dropping it would silence that description.
          "aria-describedby":
            [describedBy, inputAttrs["aria-describedby"]].filter(Boolean).join(" ") || undefined,
        }}
      />

      {meter}

      {hint && !error && <FormHelperText id={hintId}>{hint}</FormHelperText>}
      {error && <FormHelperText id={errorId}>{error}</FormHelperText>}
    </FormControl>
  );
}
