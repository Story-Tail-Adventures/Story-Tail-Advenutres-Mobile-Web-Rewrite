import * as React from "react";
import MuiCard, { type CardProps as MuiCardProps } from "@mui/material/Card";

export type CardVariant = "default" | "flat" | "tonal" | "elevated";

/**
 * The legacy card classes on stock MUI (docs/Design-System.md §8):
 *   card       → Card (elevation 1 on background.paper = surface.1)
 *   card-flat  → Card variant="outlined" on surface.2
 *   card-tonal → Card elevation={0} on surface.3 (the §8 table says Paper; Card is Paper plus
 *                the `overflow: hidden` the legacy .card had, so every variant clips alike)
 *   card-elev  → Card elevation={2}
 * Radius and shadows are MUI's. The legacy .card also drew a 1px outline-variant border
 * around its shadow; stock MUI does not, and the prototype dropped it too.
 */
const VARIANT_PROPS: Record<CardVariant, Pick<MuiCardProps, "variant" | "elevation" | "sx">> = {
  default: {},
  flat: { variant: "outlined", sx: { bgcolor: "surface.2" } },
  tonal: { elevation: 0, sx: { bgcolor: "surface.3" } },
  elevated: { elevation: 2 },
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

/**
 * Callers lay out the inside and recolour through `sx`. A caller's `sx` REPLACES the
 * variant's (it is a plain prop spread, not a merge), so `flat` / `tonal` with an `sx` must
 * restate their `bgcolor`; no caller does that today. A className still reaches the MUI root,
 * but it has to be a class some CSS file defines (test/class-allowlist.test.ts).
 *
 * No "use client": 24 callers are Server Components.
 */
export function Card({ variant = "default", ...props }: CardProps) {
  return <MuiCard {...VARIANT_PROPS[variant]} {...props} />;
}
