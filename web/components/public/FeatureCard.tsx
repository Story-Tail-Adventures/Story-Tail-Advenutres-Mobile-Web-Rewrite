import * as React from "react";
import MuiAvatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiCard from "@mui/material/Card";
import Typography, { type TypographyProps } from "@mui/material/Typography";
import { Icon, type IconName } from "@/components/ui/Icon";

interface FeatureCardProps {
  icon: IconName;
  /** Coloured square behind the icon, or a bare icon. */
  iconTone?: "primary" | "secondary" | "bare";
  /** Square size in px: 32 / 36 / 40 / 44. */
  iconSize?: 32 | 36 | 40 | 44;
  overline?: string;
  title: string;
  body?: string;
  /** Stacked card (steps, pillars, intro band) or icon-beside-text row (mobile lists). */
  layout?: "stack" | "row";
  card?: boolean;
  /** Extra content under the body (e.g. a ScriptureLine). */
  footer?: React.ReactNode;
  /**
   * The legacy type-ramp name for the title; it picks the MUI variant now (see TITLE_VARIANT).
   * Kept as the prop callers already pass. An unknown name falls back to `h5` and is also
   * forwarded as a class, so nothing a page passes is silently lost.
   */
  titleClass?: string;
  as?: "h3" | "h4" | "div";
  className?: string;
}

const GLYPH: Record<32 | 36 | 40 | 44, number> = { 32: 15, 36: 16, 40: 20, 44: 20 };

/** `.t-title-l` (22/600) → h5, `.t-title` (18/600) → h6, `.t-title-s` (15/600) → subtitle1. */
const TITLE_VARIANT: Record<string, TypographyProps["variant"]> = {
  "t-title-l": "h5",
  "t-title": "h6",
  "t-title-s": "subtitle1",
};

/**
 * Icon + overline + title + body (design: the step cards and pillars on 2.0.2, the intro
 * band on 2.0.8, the "what you can do here" rows on mobile 2.0.1). The glyph is MUI's
 * rounded Avatar on the primary or secondary container, the way the converted 2.0.2
 * artboard draws its step cards and pillars.
 */
export function FeatureCard({
  icon,
  iconTone = "primary",
  iconSize = 40,
  overline,
  title,
  body,
  layout = "stack",
  card = true,
  footer,
  titleClass = "t-title-l",
  as: Heading = "h3",
  className,
}: FeatureCardProps) {
  const titleVariant = TITLE_VARIANT[titleClass] ?? "h5";
  const titleClassName = titleVariant === TITLE_VARIANT[titleClass] ? undefined : titleClass;

  const glyph =
    iconTone === "bare" ? (
      <Box component="span" sx={{ display: "inline-flex", flexShrink: 0, color: "brand.main" }}>
        <Icon name={icon} size={20} />
      </Box>
    ) : (
      <MuiAvatar
        variant="rounded"
        aria-hidden="true"
        sx={{
          width: iconSize,
          height: iconSize,
          flexShrink: 0,
          bgcolor: iconTone === "primary" ? "primary.container" : "secondary.container",
          color: iconTone === "primary" ? "primary.onContainer" : "secondary.onContainer",
        }}
      >
        <Icon name={icon} size={GLYPH[iconSize]} />
      </MuiAvatar>
    );

  const Root = card ? MuiCard : Box;

  if (layout === "row") {
    return (
      <Root className={className} sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, ...(card && { p: 1.75 }) }}>
        {glyph}
        <Box sx={{ minWidth: 0 }}>
          {overline && (
            <Typography
              component="p"
              variant="overline"
              sx={{ display: "block", color: "brand.main", fontWeight: 600, lineHeight: 1.3 }}
            >
              {overline}
            </Typography>
          )}
          <Typography component={Heading} variant={titleVariant} className={titleClassName} sx={{ color: "text.primary" }}>
            {title}
          </Typography>
          {body && (
            <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.25, color: "text.secondary" }}>
              {body}
            </Typography>
          )}
          {footer}
        </Box>
      </Root>
    );
  }

  return (
    <Root className={className} sx={{ display: "flex", flexDirection: "column", ...(card && { p: 2.25 }) }}>
      {glyph}
      {overline && (
        <Typography
          component="p"
          variant="overline"
          sx={{ display: "block", mt: iconTone === "bare" ? 1 : 1.5, color: "brand.main", fontWeight: 600, lineHeight: 1.3 }}
        >
          {overline}
        </Typography>
      )}
      <Typography
        component={Heading}
        variant={titleVariant}
        className={titleClassName}
        sx={{ mt: 0.5, mb: 0.75, color: "text.primary" }}
      >
        {title}
      </Typography>
      {body && (
        <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          {body}
        </Typography>
      )}
      {footer}
    </Root>
  );
}
