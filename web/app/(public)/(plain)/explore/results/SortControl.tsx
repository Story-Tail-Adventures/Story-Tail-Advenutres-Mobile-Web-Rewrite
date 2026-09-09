import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  effectiveMode,
  resultsHref,
  SORT_LABELS,
  sortKeysFor,
  type ResultsMode,
  type SearchQuery,
  type SortKey,
} from "@/lib/public/search";
import { RESULTS } from "./content";

/** Labelled sort `<select>` inside the filter form (FilterRail / FilterSheet). */
export function SortControl({ id, value, mode }: { id: string; value: SortKey; mode: ResultsMode }) {
  // The provider has no "price high to low", so hotels mode does not offer one rather than
  // faking it over a single page of results.
  const keys = sortKeysFor(mode);
  return (
    <div className="mt-1 mb-3.5">
      <label htmlFor={id} className="t-title-s mb-1.5 block text-on-surface">
        {RESULTS.sort.label}
      </label>
      <select id={id} name="sort" defaultValue={value} className="input t-filter h-10 px-3 text-on-surface">
        {keys.map((key) => (
          <option key={key} value={key}>
            {SORT_LABELS[key]}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The "Sort · Best fit ▾" chip in the results header (design C204). A native `<details>` menu
 * of links, so it needs no JavaScript: each option is the current search with `sort` changed.
 * Keyed on the current sort so a pick closes the menu after navigation. Reuses the `.faq`
 * rules from public.css purely for the hidden marker and the rotating chevron.
 */
export function SortMenu({ q }: { q: SearchQuery }) {
  const mode = effectiveMode(q);
  const keys = sortKeysFor(mode);
  // A sort the mode cannot honour still shows as "Best fit" and keeps its URL value, so
  // switching back to the curated catalog restores it.
  const shown = keys.includes(q.sort) ? q.sort : "best-fit";
  return (
    <details key={q.sort} className="faq relative shrink-0">
      <summary className="chip chip-filter tap-44 h-8 cursor-pointer px-3 text-on-surface">
        {RESULTS.sort.chip(SORT_LABELS[shown])}
        <Icon name="chevron_down" size={12} className="faq-chevron" />
      </summary>
      <ul className="card absolute top-full right-0 z-20 mt-1 min-w-45 p-1 shadow-2">
        {keys.map((key) => {
          const current = key === shown;
          return (
            <li key={key}>
              <Link
                href={resultsHref({ ...q, sort: key })}
                prefetch={mode === "hotels" ? false : undefined}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "t-filter flex min-h-9 items-center rounded-sm px-3 text-on-surface hover:bg-surface-3",
                  current && "bg-secondary-container text-on-secondary-container",
                )}
              >
                {SORT_LABELS[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
