import Link from "next/link";
import { cn } from "@/lib/cn";
import { effectiveMode, resultsHref, type SearchQuery } from "@/lib/public/search";
import { RESULTS } from "./content";

/**
 * "Gyasi's picks" / "Hotels".
 *
 * Two links, not a tablist: these are navigations, and `aria-current="page"` is the honest
 * attribute for "you are here". No JavaScript, like every other control on this page.
 *
 * `prefetch={false}` on the Hotels link is not a performance tweak — a hovered prefetch
 * would spend a metered provider request the visitor never asked for.
 */
export function ModeSwitch({ q }: { q: SearchQuery }) {
  const current = effectiveMode(q);
  const options = [
    { mode: "picks" as const, label: RESULTS.mode.picks },
    { mode: "hotels" as const, label: RESULTS.mode.hotels },
  ];

  return (
    <nav aria-label={RESULTS.mode.label} className="flex w-fit gap-0.5 rounded-full bg-surface-2 p-0.5">
      {options.map((option) => {
        const on = current === option.mode;
        return (
          <Link
            key={option.mode}
            href={resultsHref({ ...q, mode: option.mode })}
            aria-current={on ? "page" : undefined}
            prefetch={option.mode === "hotels" ? false : undefined}
            className={cn(
              "t-label-l tap-44 flex h-8 items-center rounded-full px-3.5 text-on-surface-variant",
              on && "bg-primary text-on-primary",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
