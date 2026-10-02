import * as React from "react";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import OutlinedInput from "@mui/material/OutlinedInput";
import { fieldLabelSx } from "./Field";

/**
 * A labelled `<textarea>`, wired the same way [Field] wires an input.
 *
 * Shares the OutlinedInput chrome so it lines up beside one. `multiline` with an explicit
 * `inputComponent="textarea"` keeps it a plain native textarea with a fixed `rows` — MUI's
 * default multiline swaps in TextareaAutosize, which grows with content and needs JS; a
 * fixed box is what the forms were laid out around. The textarea does not carry the 44px
 * minimum: its height comes from `rows`, as before.
 *
 * No "use client": the forms that render this are Server Components.
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
  name,
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
  ...textareaAttrs
}: TextareaFieldProps) {
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
      <OutlinedInput
        id={id}
        name={name}
        value={value}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        readOnly={readOnly}
        required={required}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        multiline
        inputComponent="textarea"
        // MUI's multiline sets resize: none; the legacy textarea could be dragged taller.
        sx={{ "& textarea": { resize: "vertical" } }}
        rows={rows}
        size="small"
        inputProps={{
          ...textareaAttrs,
          className,
          // InputBase passes its `type` ("text") to the element; a textarea has none.
          type: undefined,
          "aria-invalid": error ? true : undefined,
          // Merged, not replaced: a caller's own aria-describedby (in the spread above)
          // used to win over ours, and dropping it would silence that description.
          "aria-describedby":
            [describedBy, textareaAttrs["aria-describedby"]].filter(Boolean).join(" ") || undefined,
        }}
      />
      {hint && !error && <FormHelperText id={hintId}>{hint}</FormHelperText>}
      {error && <FormHelperText id={errorId}>{error}</FormHelperText>}
    </FormControl>
  );
}
