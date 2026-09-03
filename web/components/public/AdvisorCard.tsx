import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { ADVISOR, claim } from "@/content/public/proof";
import { cn } from "@/lib/cn";
import { Avatar } from "./Avatar";

interface AdvisorCardProps {
  /** `bio` (2.0.2), `planned` (2.0.5 aside), `note` (2.0.10 letter). */
  variant: "bio" | "planned" | "note";
  title?: string;
  body?: React.ReactNode;
  overline?: string;
  action?: { label: string; href: string };
  className?: string;
}

/**
 * Gyasi's card in its three prototype shapes. The portrait is the initials avatar until a
 * real photograph is supplied (decision 4); stats come from the claims registry.
 */
export function AdvisorCard({ variant, title, body, overline, action, className }: AdvisorCardProps) {
  if (variant === "bio") {
    return (
      <div className={cn("card advisor-bio-grid bg-surface-2 p-4 md:p-5.5", className)}>
        <Avatar initials={ADVISOR.initials} tone="brand" size={72} className="md:size-30 md:text-4xl" label={ADVISOR.name} />
        <div>
          <h2 className="t-title-s md:t-title-l text-on-surface">{title ?? `Meet ${ADVISOR.name} · ${ADVISOR.title}`}</h2>
          <p className="t-body-s md:t-body mt-1.5 text-on-surface-variant">{body ?? ADVISOR.shortBio}</p>
          <ul className="t-label mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-on-surface-variant">
            <li className="inline-flex items-center gap-1">
              <Icon name="star" size={12} filled className="text-brand-sunset" /> {claim("ratingValue")} · {claim("reviewCount")} reviews
            </li>
            <li className="inline-flex items-center gap-1">
              <Icon name="users" size={12} /> {claim("travelersServed")} travelers
            </li>
            <li className="inline-flex items-center gap-1">
              <Icon name="shield" size={12} /> {claim("credClia")}
            </li>
          </ul>
        </div>
      </div>
    );
  }

  if (variant === "planned") {
    return (
      <div className={cn("card flex items-center gap-2.5 p-3.5 md:p-4", className)}>
        <Avatar initials={ADVISOR.initials} tone="brand" size={36} />
        <div className="min-w-0 flex-1">
          <p className="t-title-s text-on-surface">{title}</p>
          <p className="t-body-s text-on-surface-variant">{body ?? "Caribbean specialist"}</p>
        </div>
        {action && (
          <Link href={action.href} className="btn btn-text btn-sm">
            {action.label}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className={cn("card advisor-note-grid bg-surface-2 p-3.5 md:px-7 md:py-6", className)}>
      <Avatar initials={ADVISOR.initials} tone="brand" size={44} className="md:size-14" />
      <div>
        <p className="t-label-s text-brand-orange">{overline ?? "A NOTE FROM GYASI"}</p>
        <div className="t-body-s md:t-body-l mt-1.5 text-pretty text-on-surface">{body}</div>
      </div>
    </div>
  );
}
