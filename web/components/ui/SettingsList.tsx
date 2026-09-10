import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/icon-paths";
import { cn } from "@/lib/cn";

/**
 * The grouped settings list. Screen Inventory §2.5 is mostly this shape: 2.5.1's eight
 * tiles, 2.5.7's panels, 2.5.8's providers, 2.5.9's rows and 2.5.11's cards are all the
 * same row under different headings. §3.12 Agent Settings will want it too, which is why it
 * lives in `components/ui/` rather than `components/client/`.
 *
 * WHY A ROW IS A LINK, A BUTTON, OR A PLAIN DIV — and why it is never given an `onClick`.
 * These render inside async server components. A function cannot cross the RSC boundary: it
 * typechecks, it survives unit tests (which render in-process, so the boundary is never
 * crossed), and it throws at runtime. So a row takes an `href`, or it takes nothing and
 * renders inert. Anything genuinely interactive belongs in its own `"use client"` leaf.
 *
 * A DISABLED ROW KEEPS ITS PLACE. §2.5 has several destinations whose backend does not exist
 * yet, and the §2.2 rule is to render them disabled with a reason rather than hide them — a
 * list that grows an item per release moves every other item under the reader's cursor. The
 * reason replaces the subtitle rather than sitting beside it, because two lines of grey on a
 * dimmed row is unreadable.
 */

export type SettingsRowProps = {
  icon?: IconName;
  title: string;
  /** Say what is INSIDE, in data ("4 files · 1 expiring soon"), not what the screen does. */
  sub?: string;
  href?: string;
  /** Renders inert and dimmed, with `reason` in place of `sub`. */
  disabled?: boolean;
  reason?: string;
  /** Right-hand slot: a value, a status chip, a `"use client"` control. Suppresses the chevron. */
  trailing?: React.ReactNode;
  danger?: boolean;
  first?: boolean;
};

export function SettingsRow({
  icon,
  title,
  sub,
  href,
  disabled = false,
  reason,
  trailing,
  danger = false,
  first = false,
}: SettingsRowProps) {
  const inner = (
    <>
      {icon && (
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
            danger
              ? "bg-error-container text-on-error-container"
              : "bg-secondary-container text-on-secondary-container",
          )}
          aria-hidden="true"
        >
          <Icon name={icon} size={17} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("t-title-s block", danger && "text-error")}>{title}</span>
        {(disabled ? reason : sub) && (
          <span className="t-body-s block truncate text-on-surface-variant">
            {disabled ? reason : sub}
          </span>
        )}
      </span>
      {trailing ?? (!disabled && href ? (
        <Icon name="chevron_right" size={16} className="shrink-0 text-on-surface-variant" />
      ) : null)}
    </>
  );

  const base = cn(
    "flex w-full items-center gap-3 px-4 py-3 text-left",
    !first && "border-t border-outline-variant",
    disabled && "opacity-55",
  );

  if (disabled) {
    return (
      <div className={base} aria-disabled="true" title={reason}>
        {inner}
        {reason && <span className="sr-only">{title} — {reason}</span>}
      </div>
    );
  }

  if (href) {
    return (
      <Link href={href} className={cn(base, "transition-colors hover:bg-surface-2")}>
        {inner}
      </Link>
    );
  }

  return <div className={base}>{inner}</div>;
}

/**
 * One card of rows under an optional uppercase heading. The heading is a plain label rather
 * than a real heading element unless `headingLevel` says otherwise — most §2.5 groups are
 * organisational, not navigational landmarks.
 */
export function SettingsGroup({
  label,
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-5 first:mt-0", className)}>
      {label && (
        <h2 className="t-label mb-2 px-1 tracking-wide text-on-surface-variant">{label}</h2>
      )}
      <Card className="overflow-hidden p-0">{children}</Card>
    </section>
  );
}
