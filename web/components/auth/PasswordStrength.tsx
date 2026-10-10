"use client";

import { useState } from "react";
import LinearProgress from "@mui/material/LinearProgress";
import { Field, type FieldProps } from "@/components/ui/Field";
import { passwordStrength, strengthMessage } from "@/lib/validation/password-strength";

/**
 * A password field with the strength meter from the prototype (design: C212 and C215 — a
 * 4px track under the input with a coloured fill, and a line of text under that).
 *
 * **The password itself never enters React state.** Only the derived score and message do.
 * That is the reason this reads `event.target.value` and throws the value away rather than
 * being a controlled input: a controlled password would sit in component state, in every
 * re-render's props, and in whatever a devtools snapshot or an error boundary happens to
 * capture. The input stays uncontrolled and the server action reads it out of FormData,
 * exactly as on 2.1.1.
 *
 * The track is MUI's LinearProgress, as on the converted artboards, and is `aria-hidden` —
 * it carries no information the hint text does not already say, and the hint is already
 * wired into the field's `aria-describedby`. `color="inherit"` so the fill follows a palette
 * path per score; MUI paints a 30% tint of that colour as the track for `inherit`, which is
 * swapped for the flat outline-variant track the legacy meter drew.
 */

export interface PasswordStrengthFieldProps extends Omit<FieldProps, "hint" | "meter"> {
  /** Shown before anything is typed: the policy, stated once, without nagging. */
  idleHint: string;
}

/** Indexed by score 0–4. Nothing typed yet reads as "not there", not as "wrong". */
const TONE = ["outline.main", "error.main", "brand.main", "brand.main", "success.main"] as const;

export function PasswordStrengthField({
  idleHint,
  onChange,
  ...props
}: PasswordStrengthFieldProps) {
  const [score, setScore] = useState(0);
  const [message, setMessage] = useState("");

  return (
    <Field
      {...props}
      hint={message || idleHint}
      onChange={(event) => {
        const { value } = event.target;
        setScore(passwordStrength(value).score);
        setMessage(strengthMessage(value));
        onChange?.(event);
      }}
      meter={
        <LinearProgress
          variant="determinate"
          value={(score / 4) * 100}
          color="inherit"
          aria-hidden="true"
          sx={{
            mt: 0.75,
            height: 4,
            borderRadius: 0.5,
            color: TONE[score],
            bgcolor: "outline.variant",
            "&::before": { display: "none" },
            "& .MuiLinearProgress-bar": { borderRadius: 0.5 },
          }}
        />
      }
    />
  );
}
