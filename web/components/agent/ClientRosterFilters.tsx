import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import OutlinedInput from "@mui/material/OutlinedInput";

import NextForm from "@/components/mui/NextForm";
import { Button } from "@/components/ui/Button";
import { ChipInput } from "@/components/ui/Chip";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { RosterQuery, TagFacet } from "@/lib/agent/clients";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

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
 * to drive. `ChipInput` (components/ui/Chip) is that control on MUI's Chip: a visually
 * hidden input inside the chip's own label, outlined at rest, filled secondary once ticked,
 * the theme's focus ring when the input has keyboard focus — all through `:has()`, so an
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

/**
 * A fieldset that contributes its chips to the parent's flex row rather than boxing them
 * (the legacy Tailwind `contents`), so the status pair, the rule and the tag chips wrap as
 * one line.
 */
const CONTENTS_FIELDSET_SX = { display: "contents", m: 0, p: 0, border: 0, minWidth: 0 } as const;

export function ClientRosterFilters({
  query,
  facets,
}: {
  query: RosterQuery;
  facets: TagFacet[];
}) {
  return (
    <Box
      component={NextForm}
      action="/agent/clients"
      sx={{ mb: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}
    >
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Box component="label" htmlFor="roster-q" sx={VISUALLY_HIDDEN}>
          {CLIENT_COPY.searchLabel}
        </Box>
        <OutlinedInput
          id="roster-q"
          type="search"
          name="q"
          defaultValue={query.search}
          placeholder={CLIENT_COPY.searchPlaceholder}
          size="small"
          sx={{ flex: 1, minWidth: 0 }}
        />
        <Button type="submit" variant="tonal" size="sm">
          {CLIENT_COPY.searchLabel}
        </Button>
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
        {/* Status is a RADIO pair, not two checkboxes: a client is active or archived and
            never both, and a control that can express an impossible state will be asked to. */}
        <Box component="fieldset" sx={CONTENTS_FIELDSET_SX}>
          <Box component="legend" sx={VISUALLY_HIDDEN}>
            {CLIENT_COPY.filterStatusLabel}
          </Box>
          {(["active", "archived"] as const).map((value) => (
            <ChipInput
              key={value}
              type="radio"
              name="status"
              value={value}
              defaultChecked={query.status === value}
              label={value === "active" ? CLIENT_COPY.filterActive : CLIENT_COPY.filterArchived}
            />
          ))}
        </Box>

        {facets.length > 0 && (
          <Divider
            orientation="vertical"
            aria-hidden="true"
            sx={{ mx: 0.5, height: 16, alignSelf: "center" }}
          />
        )}

        <Box component="fieldset" sx={CONTENTS_FIELDSET_SX}>
          <Box component="legend" sx={VISUALLY_HIDDEN}>
            {CLIENT_COPY.filterTagsLabel}
          </Box>
          {facets.map((f) => (
            <ChipInput
              key={f.tag}
              type="checkbox"
              name="tag"
              value={f.tag}
              defaultChecked={f.selected}
              label={`${f.tag} · ${f.count}`}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}
