import * as React from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

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
  titleClass?: string;
  as?: "h3" | "h4" | "div";
  className?: string;
}

const SQUARE: Record<32 | 36 | 40 | 44, string> = {
  32: "size-8 rounded-sm",
  36: "size-9 rounded-sm",
  40: "size-10 rounded-xl",
  44: "size-11 rounded-md",
};

const GLYPH: Record<32 | 36 | 40 | 44, number> = { 32: 15, 36: 16, 40: 20, 44: 20 };

/**
 * Icon + overline + title + body (design: the step cards and pillars on 2.0.2, the intro
 * band on 2.0.8, the "what you can do here" rows on mobile 2.0.1).
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
  const glyph =
    iconTone === "bare" ? (
      <Icon name={icon} size={20} className="text-brand-orange" />
    ) : (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center",
          SQUARE[iconSize],
          iconTone === "primary"
            ? "bg-primary-container text-on-primary-container"
            : "bg-secondary-container text-on-secondary-container",
        )}
      >
        <Icon name={icon} size={GLYPH[iconSize]} />
      </span>
    );

  if (layout === "row") {
    return (
      <div className={cn(card && "card p-3.5", "flex items-start gap-3", className)}>
        {glyph}
        <div className="min-w-0">
          {overline && <p className="t-label-s text-brand-orange">{overline}</p>}
          <Heading className={cn(titleClass, "text-on-surface")}>{title}</Heading>
          {body && <p className="t-body-s mt-0.5 text-on-surface-variant">{body}</p>}
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(card && "card p-4.5", "flex flex-col", className)}>
      {glyph}
      {overline && <p className={cn("t-label-s text-brand-orange", iconTone === "bare" ? "mt-2" : "mt-3")}>{overline}</p>}
      <Heading className={cn(titleClass, "mt-1 mb-1.5 text-on-surface")}>{title}</Heading>
      {body && <p className="t-body-s text-on-surface-variant">{body}</p>}
      {footer}
    </div>
  );
}
