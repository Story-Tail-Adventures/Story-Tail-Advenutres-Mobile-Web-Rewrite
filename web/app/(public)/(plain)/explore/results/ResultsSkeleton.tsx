import { RESULTS } from "./content";

const RAIL_GROUPS = [0, 1, 2];
const ROWS = [0, 1, 2];

/**
 * Loading UI for /explore/results (fidelity spec §5.7): header pill, the 220px rail with three
 * groups, three grey result rows. Same wrappers as the page so nothing jumps when it resolves.
 */
export function ResultsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-1 flex-col animate-pulse motion-reduce:animate-none">
      <p className="sr-only">{RESULTS.loading}</p>

      <div className="border-b border-outline-variant bg-surface-1 py-2 md:py-3.5">
        <div className="pub-container web:px-8">
          <div className="h-9 rounded-full bg-surface-3 md:h-11" />
          <div className="mt-2.5 flex gap-2 pb-1 web:hidden">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-7 w-20 rounded-lg bg-surface-3" />
            ))}
          </div>
        </div>
      </div>

      <div className="pub-container web:px-8 flex flex-1 gap-4 pt-3.5 pb-4.5 md:py-4">
        <div className="hidden w-55 shrink-0 flex-col gap-4 border-r border-outline-variant pr-4 web:flex">
          {RAIL_GROUPS.map((g) => (
            <div key={g} className="flex flex-col gap-2">
              <div className="h-4 w-24 rounded bg-surface-3" />
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-3.5 w-36 rounded bg-surface-3" />
              ))}
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between">
            <div className="h-6 w-56 rounded bg-surface-3" />
            <div className="h-8 w-28 rounded-lg bg-surface-3" />
          </div>
          {/* Same responsive shape as the results list (tablet rules scoped with md:max-web:). */}
          <div className="flex flex-col gap-2.5 md:max-web:grid md:max-web:grid-cols-2 md:max-web:gap-3.5">
            {ROWS.map((i) => (
              <div key={i} className="card h-60 bg-surface-3 web:h-30" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
