import * as React from "react";
import MuiChip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";

/**
 * A chip that is really a checkbox or a radio.
 *
 * The prototype (`C2111_PreferencesCapture`) draws chips as `<span className="chip">` with
 * selection encoded by appending " ✓" to the label. Neither survives contact with a real
 * form: a span is not focusable, not announced and not operable by keyboard, and a value of
 * `"Caribbean ✓"` poisons every comparison, filter and P2 search join downstream.
 *
 * So the control is a real input, visually hidden inside its own label. The MUI Chip is the
 * label (`component="label"`), and the selected state is styled through `:has(input:checked)`
 * — which means an uncontrolled group needs no React state at all, and the whole form still
 * works with JavaScript off, matching how the rest of §2.1 is built.
 *
 * Look: the §8 mapping — `Chip variant="outlined"` at rest, filled `color="secondary"` when
 * selected, which is how every converted screen draws a chosen filter chip. The focus ring is
 * the theme's curated one (2px primary, 2px offset), drawn on the chip when the hidden input
 * has keyboard focus. Height stays the legacy 28px so chip rows keep their rhythm.
 *
 * No "use client": the onboarding form that renders these is a Server Component.
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
    <MuiChip
      component="label"
      variant="outlined"
      className={className}
      label={
        <>
          <input type={type} className="sr-only" {...props} />
          {label}
        </>
      }
      sx={{
        height: 28,
        "&:has(input:enabled)": { cursor: "pointer" },
        "&:has(input:disabled)": { opacity: 0.38 },
        "&:has(input:checked)": {
          bgcolor: "secondary.main",
          color: "secondary.contrastText",
          borderColor: "secondary.main",
        },
        "&:has(input:focus-visible)": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: "2px",
        },
      }}
    />
  );
}

/**
 * The wrapping row a chip group sits in. Wraps rather than scrolls: Screen-Inventory §4.4
 * calls these "scrollable chip groups", but a horizontal scroller hides options on a screen
 * whose instruction is "tag what's true", and the mechanism must not defeat the purpose.
 */
export function ChipGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Stack direction="row" useFlexGap spacing={1} className={className} sx={{ flexWrap: "wrap" }}>
      {children}
    </Stack>
  );
}
