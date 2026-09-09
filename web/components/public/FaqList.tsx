import { Icon } from "@/components/ui/Icon";
import type { FaqItem } from "@/content/public/types";
import { cn } from "@/lib/cn";

interface FaqListProps {
  items: readonly FaqItem[];
  /** Shared `name` makes the group an exclusive accordion in browsers that support it. */
  name?: string;
  /** Open the first item, as the artboards do. */
  defaultOpenFirst?: boolean;
  /** Answer type: 13px (About) or 14px (About Gyasi). */
  answerSize?: "s" | "m";
  className?: string;
}

/**
 * Native <details>/<summary> FAQ — no JavaScript, keyboard-operable, and the question is a
 * real heading inside the summary so the outline stays intact.
 */
export function FaqList({
  items,
  name = "faq",
  defaultOpenFirst = true,
  answerSize = "s",
  className,
}: FaqListProps) {
  return (
    <div className={cn("flex flex-col gap-2 md:gap-2.5", className)}>
      {items.map((item, index) => (
        <details
          key={item.q}
          name={name}
          open={defaultOpenFirst && index === 0}
          className="faq card p-0"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3 md:px-4 md:py-3.5">
            <h3 className="t-title-s text-on-surface">{item.q}</h3>
            <Icon name="chevron_down" size={16} className="faq-chevron shrink-0 text-on-surface-variant" />
          </summary>
          <p
            className={cn(
              "px-3.5 pb-3 text-on-surface-variant md:px-4 md:pb-3.5",
              answerSize === "m" ? "t-body" : "t-body-s",
            )}
          >
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}
