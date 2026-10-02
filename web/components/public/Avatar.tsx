import MuiAvatar from "@mui/material/Avatar";
import type { SxProps, Theme } from "@mui/material/styles";

interface AvatarProps {
  initials: string;
  /** Diameter in px. 36 is the legacy `.avatar`; larger sizes scale the type with the circle. */
  size?: number;
  /** Brand burgundy on white is the prototype's agent avatar; tertiary is the default. */
  tone?: "brand" | "tertiary";
  className?: string;
  /** Accessible name; omit for decorative use next to the person's printed name. */
  label?: string;
  /** Plain objects only: Server Components render this (AdvisorCard grows it at `md`). */
  sx?: SxProps<Theme>;
}

/**
 * Initials avatar on MUI's Avatar (design: the "GS" agent avatar in the top bar, the
 * testimonial monograms, and Gyasi's portrait until a real one exists).
 *
 * `component="span"`: the legacy element was a span, and several callers (the agent roster,
 * PublicAuthCluster's link) sit it inside inline content where a div would be invalid.
 * The box is the legacy one — `size` px square, type at 36% of the diameter — so no caller
 * reflows. Colours are palette paths: tertiary container by default; the brand tone is the
 * scheme-independent burgundy (`brandSource.burgundy`, :root-only in tokens.css) on white,
 * exactly as the legacy `bg-brand-burgundy text-white` was.
 */
export function Avatar({ initials, size = 36, tone = "tertiary", className, label, sx }: AvatarProps) {
  const fontSize = Math.max(10, Math.round(size * 0.36));
  return (
    <MuiAvatar
      component="span"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      sx={[
        {
          width: size,
          height: size,
          fontSize,
          fontWeight: 600,
          lineHeight: 1,
          flexShrink: 0,
          userSelect: "none",
          bgcolor: tone === "brand" ? "brandSource.burgundy" : "tertiary.container",
          color: tone === "brand" ? "common.white" : "tertiary.onContainer",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {initials}
    </MuiAvatar>
  );
}
