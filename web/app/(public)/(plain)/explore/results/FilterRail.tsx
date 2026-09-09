import Form from "next/form";
import Link from "next/link";
import type { BudgetBand, TripType, Vibe } from "@/content/public/types";
import { cn } from "@/lib/cn";
import { BUDGET_BAND_LABELS } from "@/lib/public/money";
import {
  BUDGET_BANDS,
  hasActiveFilters,
  TRIP_TYPE_LABELS,
  TRIP_TYPES,
  VIBE_LABELS,
  type SearchQuery,
} from "@/lib/public/search";
import { RESULTS } from "./content";
import { SortControl } from "./SortControl";

/** The four vibes the prototype's rail shows (C204: Adults-only, Family, Honeymoon, 5★). */
const RAIL_VIBES: readonly Vibe[] = ["adults-only", "family", "honeymoon", "five-star"];

interface FilterRailProps {
  q: SearchQuery;
  /** Unique per instance — the rail and the mobile sheet are both in the DOM. */
  idPrefix: string;
  /** The "FILTERS" overline; off inside the sheet, which has its own heading. */
  overline?: boolean;
  className?: string;
}

interface Option<T extends string> {
  value: T;
  label: string;
  checked: boolean;
}

function FilterGroup<T extends string>({
  legend,
  name,
  options,
}: {
  legend: string;
  name: "type" | "vibe" | "budget";
  options: readonly Option<T>[];
}) {
  return (
    <fieldset className="mb-3.5 min-w-0 border-0 p-0">
      <legend className="t-title-s mb-1.5 text-on-surface">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="t-filter flex min-h-11 items-center gap-2 py-1 text-on-surface-variant web:min-h-0"
        >
          <input type="checkbox" className="filter-box" name={name} value={option.value} defaultChecked={option.checked} />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Filter rail (design C204 aside; the prototype drew fake checkboxes — these are real). A GET
 * form via next/form so filters round-trip through the URL without JavaScript. Hidden inputs
 * carry the free-text search so applying a filter never drops the destination or dates.
 */
export function FilterRail({ q, idPrefix, overline = true, className }: FilterRailProps) {
  const types: Option<TripType>[] = TRIP_TYPES.map((t) => ({
    value: t,
    label: TRIP_TYPE_LABELS[t],
    checked: q.types.includes(t),
  }));
  const vibes: Option<Vibe>[] = RAIL_VIBES.map((v) => ({
    value: v,
    label: VIBE_LABELS[v],
    checked: q.vibes.includes(v),
  }));
  const budgets: Option<BudgetBand>[] = BUDGET_BANDS.map((b) => ({
    value: b,
    label: BUDGET_BAND_LABELS[b],
    checked: q.budgets.includes(b),
  }));

  return (
    <aside aria-label={RESULTS.filters.label} className={cn("min-w-0", className)}>
      <Form action="/explore/results" className="flex flex-col">
        {q.dest && <input type="hidden" name="dest" value={q.dest} />}
        {/* The stay rides through as in/out; `when` is only the pre-picker free-text fallback,
            and carrying both would let a stale label outlive the range it described. */}
        {q.checkIn && q.checkOut ? (
          <>
            <input type="hidden" name="in" value={q.checkIn} />
            <input type="hidden" name="out" value={q.checkOut} />
          </>
        ) : (
          q.when && <input type="hidden" name="when" value={q.when} />
        )}
        {q.travelers && <input type="hidden" name="travelers" value={String(q.travelers)} />}
        {q.topic && <input type="hidden" name="topic" value={q.topic} />}

        {overline && <p className="t-label mb-2 text-on-surface-variant">{RESULTS.filters.overline}</p>}

        <FilterGroup legend={RESULTS.filters.tripType} name="type" options={types} />
        <FilterGroup legend={RESULTS.filters.vibe} name="vibe" options={vibes} />
        <FilterGroup legend={RESULTS.filters.budget} name="budget" options={budgets} />
        <SortControl id={`${idPrefix}-sort`} value={q.sort} />

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-tonal btn-sm min-h-11 web:min-h-8">
            {RESULTS.filters.apply}
          </button>
          {hasActiveFilters(q) && (
            <Link href="/explore/results" className="btn btn-text btn-sm min-h-11 web:min-h-8">
              {RESULTS.filters.clear}
            </Link>
          )}
        </div>
      </Form>
    </aside>
  );
}
