import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export interface InquiryField {
  label: string;
  value: string;
  icon: IconName;
}

interface InquiryBarProps {
  fields: readonly InquiryField[];
  action: { label: string; href: string; icon?: IconName };
  /** Sticks under the top bar from `md` (topic pages). */
  sticky?: boolean;
  /** `compact` = the 2.0.4 header pill. */
  density?: "default" | "compact";
  /** Below `md`: a stacked card, a one-line summary pill, or nothing (topic pages use StickyCta). */
  mobile?: "stacked" | "summary" | "hidden";
  /** Text for the mobile summary pill ("Caribbean · Aug · 2 adults"). */
  summary?: string;
  /** Href of the mobile summary's "Edit" chip. */
  editHref?: string;
  className?: string;
}

/**
 * The read-only inquiry pill (design: StickyInquireBar, the C203/C204 search pills and the
 * M203/M204 mobile variants). Cells are display text; the CTA is a link. The real search
 * form on 2.0.3 is a separate component built on next/form.
 */
export function InquiryBar({
  fields,
  action,
  sticky = false,
  density = "default",
  mobile = "hidden",
  summary,
  editHref,
  className,
}: InquiryBarProps) {
  const compact = density === "compact";
  const pill = (
    <div className={cn("card hidden items-center rounded-full p-0 md:flex", sticky ? "shadow-1" : "shadow-2")}>
      {fields.map((field, index) => (
        <div
          key={field.label}
          className={cn(
            "flex-1 border-outline-variant",
            compact ? "flex items-center gap-1.5 px-3.5 py-2.5" : "px-4 py-2.5",
            index < fields.length - 1 && "border-r",
          )}
        >
          {compact ? (
            <>
              <Icon name={field.icon} size={12} className="text-brand-orange" />
              <span className="t-label-l text-on-surface">{field.value}</span>
              <span className="sr-only">({field.label})</span>
            </>
          ) : (
            <>
              <div className="t-label text-on-surface-variant">{field.label}</div>
              <div className="t-title-s mt-0.5 flex items-center gap-1.5 text-on-surface">
                <Icon name={field.icon} size={13} className="text-brand-orange" />
                {field.value}
              </div>
            </>
          )}
        </div>
      ))}
      <Link href={action.href} className={cn("btn btn-filled m-1", compact ? "btn-sm" : "h-11")}>
        {action.icon && <Icon name={action.icon} size={14} />}
        {action.label}
      </Link>
    </div>
  );

  return (
    <div
      className={cn(
        sticky && "sticky-under-topbar hidden border-b border-outline-variant bg-surface-1 py-3.5 md:block",
        className,
      )}
    >
      <div className={cn(sticky && "pub-container pub-container-wide")}>{pill}</div>

      {mobile === "stacked" && (
        <div className="card flex flex-col gap-2 p-3 md:hidden">
          {fields.map((field) => (
            <div key={field.label} className="flex items-center gap-2.5 border-b border-outline-variant py-1.5 last:border-0">
              <Icon name={field.icon} size={14} className="text-brand-orange" />
              <span className="t-label w-21.5 text-on-surface-variant">{field.label}</span>
              <span className="t-title-s text-on-surface">{field.value}</span>
            </div>
          ))}
        </div>
      )}

      {mobile === "summary" && (
        <div className="card flex items-center gap-2 rounded-full px-3 py-1.5 md:hidden">
          <Icon name="search" size={13} className="text-on-surface-variant" />
          <span className="t-label-l flex-1 truncate text-on-surface-variant">{summary}</span>
          {editHref && (
            <Link href={editHref} className="chip tap-44 h-6 px-2 text-on-surface">
              Edit
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
