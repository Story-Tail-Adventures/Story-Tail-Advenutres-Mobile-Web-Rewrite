import Form from "next/form";

import { CLIENT_COPY } from "@/lib/agent/content";
import type { RosterQuery, TagFacet } from "@/lib/agent/clients";

/**
 * Screen 3.3.1's search box and filter chips.
 *
 * A GET FORM VIA `next/form`, not client state. The filters round-trip through the URL, so a
 * filtered roster is shareable, the back button means what it says, the page stays a server
 * component, and the whole thing works with JavaScript off — the same shape
 * `explore/results/FilterRail` uses, for the same reasons.
 *
 * THE CHIPS ARE REAL INPUTS. The prototype draws them as `<span className="chip">` with
 * selection encoded by appending " ✓" to the label. A span is not focusable, not announced
 * and not operable by keyboard, and a value of `"VIP ✓"` poisons the filter it is supposed
 * to drive. `.chip-filter` styles the checked state through `:has(input:checked)`, so an
 * uncontrolled group needs no React state at all.
 *
 * THE TAG CHIPS COME FROM THE BOOK, not from a constant. `client.tags` is free-form with no
 * vocabulary table, so the only honest source for "which tags does this agent use" is the
 * data — which is why `agent_client_roster_summary()` returns facets. The prototype's two
 * chip rows disagree with each other (`Active/VIP/Honeymoon/Family/Lead/Archived` on the
 * page, `Active/VIP/Honeymoon/New` in the rail) and both disagree with the schema; a
 * hardcoded row would have offered filters matching nothing.
 *
 * RESETTING THE PAGE IS THE POINT OF HAVING NO `page` INPUT HERE. Applying a filter while on
 * page 3 of the old result set would land past the end of the new one and render an empty
 * table over a non-zero count.
 */
export function ClientRosterFilters({
  query,
  facets,
}: {
  query: RosterQuery;
  facets: TagFacet[];
}) {
  return (
    <Form action="/agent/clients" className="mb-3 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="roster-q">
          {CLIENT_COPY.searchLabel}
        </label>
        <input
          id="roster-q"
          type="search"
          name="q"
          defaultValue={query.search}
          placeholder={CLIENT_COPY.searchPlaceholder}
          className="input h-9 min-w-0 flex-1 rounded-full px-4"
        />
        <button type="submit" className="btn btn-tonal btn-sm shrink-0">
          {CLIENT_COPY.searchLabel}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {/* Status is a RADIO pair, not two checkboxes: a client is active or archived and
            never both, and a control that can express an impossible state will be asked to. */}
        <fieldset className="contents">
          <legend className="sr-only">{CLIENT_COPY.filterStatusLabel}</legend>
          {(["active", "archived"] as const).map((value) => (
            <label key={value} className="chip chip-filter">
              <input
                type="radio"
                name="status"
                value={value}
                defaultChecked={query.status === value}
                className="sr-only"
              />
              {value === "active" ? CLIENT_COPY.filterActive : CLIENT_COPY.filterArchived}
            </label>
          ))}
        </fieldset>

        {facets.length > 0 && (
          <span aria-hidden className="mx-1 h-4 w-px bg-[var(--md-outline-variant)]" />
        )}

        <fieldset className="contents">
          <legend className="sr-only">{CLIENT_COPY.filterTagsLabel}</legend>
          {facets.map((f) => (
            <label key={f.tag} className="chip chip-filter">
              <input
                type="checkbox"
                name="tag"
                value={f.tag}
                defaultChecked={f.selected}
                className="sr-only"
              />
              {f.tag} · {f.count}
            </label>
          ))}
        </fieldset>
      </div>
    </Form>
  );
}
