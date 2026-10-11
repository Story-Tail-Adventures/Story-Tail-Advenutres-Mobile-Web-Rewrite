import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import MuiButton from "@mui/material/Button";
import OutlinedInput from "@mui/material/OutlinedInput";

import { CHECKBOX_FILTER_CHIP_SX } from "@/components/agent/TripRosterFilters";
import NextForm from "@/components/mui/NextForm";
import NextLink from "@/components/mui/NextLink";
import { OutlinedNativeSelect } from "@/components/mui/OutlinedNativeSelect";
import { Button } from "@/components/ui/Button";
import {
  COMMISSION_STATUS_FILTERS,
  isFiltered,
  type CommissionStatus,
  type LedgerQuery,
} from "@/lib/agent/commissionFilters";
import { COMMISSION_COPY } from "@/lib/agent/content";
import type { LedgerSupplier } from "@/lib/agent/commission";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * §3.7.2's filters: status, supplier, travel dates (Screen Inventory §3.7.2's list, less
 * "trip", which arrives as a URL parameter from Trip Detail rather than as a control).
 *
 * A GET FORM VIA `next/form`, like §3.3.1's and §3.4.1's: the filters live in the URL, so a
 * filtered ledger is shareable, the back button means what it says, the page stays a Server
 * Component, and it works with JavaScript off.
 *
 * NO `page` INPUT, for the reason TripRosterFilters gives: applying a filter from page 3
 * would land past the end of the new result set. The `trip` parameter DOES ride along as a
 * hidden input, because narrowing a one-trip view by status should not quietly widen it back
 * to every trip.
 *
 * Status chips are checkboxes, and none ticked means every status — the ledger opens on
 * all of it, where the trip list opens on work in progress.
 */
export function CommissionLedgerFilters({
  query,
  counts,
  suppliers,
}: {
  query: LedgerQuery;
  counts: Record<CommissionStatus, number>;
  suppliers: LedgerSupplier[];
}) {
  const picked = new Set(query.statuses);

  return (
    <Box
      component={NextForm}
      action="/agent/commission/ledger"
      sx={{ mb: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}
    >
      {query.tripId && <input type="hidden" name="trip" value={query.tripId} />}

      <Box component="fieldset" sx={FIELDSET_SX}>
        <Box component="legend" sx={VISUALLY_HIDDEN}>
          {COMMISSION_COPY.filterStatusLegend}
        </Box>
        {COMMISSION_STATUS_FILTERS.map((f) => (
          <Chip
            key={f.value}
            component="label"
            variant="outlined"
            sx={CHECKBOX_FILTER_CHIP_SX}
            label={
              <>
                <Box
                  component="input"
                  type="checkbox"
                  name="status"
                  value={f.value}
                  defaultChecked={picked.has(f.value)}
                  sx={VISUALLY_HIDDEN}
                />
                {f.label}
                <Box component="span" sx={{ ml: 0.5, opacity: 0.6 }}>
                  {counts[f.value]}
                </Box>
              </>
            }
          />
        ))}
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 1 }}>
        <Box sx={FIELD_SX}>
          <Box component="label" htmlFor="ledger-supplier" sx={LABEL_SX}>
            {COMMISSION_COPY.supplierLabel}
          </Box>
          <OutlinedNativeSelect
            id="ledger-supplier"
            name="supplier"
            defaultValue={query.supplierId ?? ""}
            sx={{ minWidth: 200 }}
          >
            <option value="">{COMMISSION_COPY.supplierAll}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.lineCount})
              </option>
            ))}
          </OutlinedNativeSelect>
        </Box>
        <Box sx={FIELD_SX}>
          <Box component="label" htmlFor="ledger-from" sx={LABEL_SX}>
            {COMMISSION_COPY.travelFromLabel}
          </Box>
          <OutlinedInput
            id="ledger-from"
            type="date"
            name="from"
            size="small"
            defaultValue={query.travelFrom ?? ""}
          />
        </Box>
        <Box sx={FIELD_SX}>
          <Box component="label" htmlFor="ledger-to" sx={LABEL_SX}>
            {COMMISSION_COPY.travelToLabel}
          </Box>
          <OutlinedInput
            id="ledger-to"
            type="date"
            name="to"
            size="small"
            defaultValue={query.travelTo ?? ""}
          />
        </Box>
        <Button type="submit" variant="tonal" size="sm">
          {COMMISSION_COPY.applyFilters}
        </Button>
        {isFiltered(query) && (
          <MuiButton
            component={NextLink}
            href="/agent/commission/ledger"
            variant="text"
            color="primary"
            size="small"
            sx={{ minHeight: 32 }}
          >
            {COMMISSION_COPY.clearFilters}
          </MuiButton>
        )}
      </Box>
    </Box>
  );
}

const FIELDSET_SX = {
  m: 0,
  p: 0,
  border: 0,
  minWidth: 0,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 0.75,
} as const;

/** A label stacked over its control, 4px apart. */
const FIELD_SX = { display: "flex", flexDirection: "column", gap: 0.5 } as const;

/** The caption-sized field label the other agent forms use. */
const LABEL_SX = { typography: "caption", fontWeight: 600, color: "text.secondary" } as const;
