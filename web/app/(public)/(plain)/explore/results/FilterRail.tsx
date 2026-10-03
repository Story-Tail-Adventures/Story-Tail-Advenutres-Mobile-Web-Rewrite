import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormGroup from "@mui/material/FormGroup";
import FormLabel from "@mui/material/FormLabel";
import Typography from "@mui/material/Typography";
import NextForm from "@/components/mui/NextForm";
import NextLink from "@/components/mui/NextLink";
import type { BudgetBand, TripType, Vibe } from "@/content/public/types";
import { BUDGET_BAND_LABELS } from "@/lib/public/money";
import {
  BUDGET_BANDS,
  effectiveMode,
  hasActiveFilters,
  HOTEL_AMENITIES,
  RATE_BANDS,
  STAR_CLASSES,
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

/** Apply / Clear: 44px tall in the sheet (a thumb target), the small 32px button on the web rail. */
const ACTION_SX = { minHeight: { xs: 44, web: 32 }, px: "16px", whiteSpace: "nowrap" } as const;

/**
 * One checkbox group, as the C204 artboard draws it: a real `<fieldset>` (FormControl) with a
 * real `<legend>` (FormLabel), and MUI Checkboxes carrying `name` / `value` / `defaultChecked`
 * so the GET form submits exactly what the hand-drawn `.filter-box` inputs did.
 *
 * NOT FormControlLabel, though the artboard uses it. This is a Server Component, and
 * FormControlLabel reads `control.props.disabled` off the element it is handed — an element
 * that has crossed the server/client boundary does not expose `props` that way, and the page
 * threw at SSR ("Cannot read properties of undefined (reading 'disabled')"). The row is the
 * same <label> + Checkbox + body2 text FormControlLabel renders, including its 11px outdent,
 * composed here from parts that take plain props. Rows are 44px below web for the sheet; at
 * web the artboard's compact 4px checkbox padding.
 */
function FilterGroup<T extends string>({
  legend,
  name,
  options,
}: {
  legend: string;
  name: "type" | "vibe" | "budget" | "star" | "amenity" | "rate";
  options: readonly Option<T>[];
}) {
  return (
    <FormControl component="fieldset" fullWidth sx={{ mb: 1.75, minWidth: 0 }}>
      <FormLabel component="legend" sx={{ mb: 0.25, typography: "subtitle1", color: "text.primary" }}>
        {legend}
      </FormLabel>
      <FormGroup>
        {options.map((option) => (
          <Box
            // The checked state is in the key on purpose. MUI's Checkbox reads `defaultChecked`
            // once, at mount, so when the URL changes the filters (applying them, a chip link,
            // "clear") a kept instance would show its OLD state and MUI warns about it. A new
            // key remounts the box with the state the URL now says.
            key={`${option.value}:${option.checked ? "on" : "off"}`}
            component="label"
            sx={{ display: "flex", alignItems: "center", ml: "-11px", minHeight: { xs: 44, web: 0 }, cursor: "pointer" }}
          >
            <Checkbox size="small" name={name} value={option.value} defaultChecked={option.checked} sx={{ py: 0.5 }} />
            <Typography component="span" variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
              {option.label}
            </Typography>
          </Box>
        ))}
      </FormGroup>
    </FormControl>
  );
}

/**
 * Filter rail (design C204 aside; the prototype drew fake checkboxes — these are real). A GET
 * form via next/form so filters round-trip through the URL without JavaScript. Hidden inputs
 * carry the free-text search so applying a filter never drops the destination or dates.
 *
 * The rail's own frame (220px, right rule, hidden below web) is the caller's: the page wraps
 * this in that Box, and the sheet gives it the dialog's padding instead.
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

  const mode = effectiveMode(q);

  const stars: Option<string>[] = STAR_CLASSES.map((s) => ({
    value: s,
    label: RESULTS.hotels.starClassLabel(Number(s)),
    checked: q.stars.includes(s),
  }));
  const amenities: Option<string>[] = HOTEL_AMENITIES.map((a) => ({
    value: a.id,
    label: a.label,
    checked: q.amenities.includes(a.id),
  }));
  const rates: Option<string>[] = RATE_BANDS.map((b) => ({
    value: b.id,
    label: b.label,
    checked: q.rates.includes(b.id),
  }));

  return (
    <Box component="aside" aria-label={RESULTS.filters.label} className={className} sx={{ minWidth: 0 }}>
      <Box component={NextForm} action="/explore/results" sx={{ display: "flex", flexDirection: "column" }}>
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
        {q.mode && <input type="hidden" name="mode" value={q.mode} />}

        {overline && (
          <Typography variant="overline" sx={{ display: "block", mb: 1, lineHeight: 1.3, color: "text.secondary" }}>
            {RESULTS.filters.overline}
          </Typography>
        )}

        {/* The two vocabularies do not overlap: a "Cruise" checkbox in a hotel list is
            incoherent, and a per-person trip budget is a different axis from a nightly room
            rate. So each mode renders its own groups and ECHOES the other's as hidden
            inputs — never both, which would double-submit — so a mode switch is lossless. */}
        {mode === "cruises" ? (
          /* Cruises have no filter vocabulary on the public surface yet — the catalog is
             departure-ordered and carries no fare to band. Everything is echoed so a mode
             switch back to picks or hotels restores what was set. */
          <>
            {q.types.map((t) => <input key={t} type="hidden" name="type" value={t} />)}
            {q.vibes.map((v) => <input key={v} type="hidden" name="vibe" value={v} />)}
            {q.budgets.map((b) => <input key={b} type="hidden" name="budget" value={b} />)}
            {q.stars.map((s) => <input key={s} type="hidden" name="star" value={s} />)}
            {q.amenities.map((a) => <input key={a} type="hidden" name="amenity" value={a} />)}
            {q.rates.map((r) => <input key={r} type="hidden" name="rate" value={r} />)}
          </>
        ) : mode === "hotels" ? (
          <>
            <FilterGroup legend={RESULTS.hotels.starRating} name="star" options={stars} />
            <FilterGroup legend={RESULTS.hotels.amenities} name="amenity" options={amenities} />
            <FilterGroup legend={RESULTS.hotels.nightlyRate} name="rate" options={rates} />
            {q.types.map((t) => <input key={t} type="hidden" name="type" value={t} />)}
            {q.vibes.map((v) => <input key={v} type="hidden" name="vibe" value={v} />)}
            {q.budgets.map((b) => <input key={b} type="hidden" name="budget" value={b} />)}
          </>
        ) : (
          <>
            <FilterGroup legend={RESULTS.filters.tripType} name="type" options={types} />
            <FilterGroup legend={RESULTS.filters.vibe} name="vibe" options={vibes} />
            <FilterGroup legend={RESULTS.filters.budget} name="budget" options={budgets} />
            {q.stars.map((s) => <input key={s} type="hidden" name="star" value={s} />)}
            {q.amenities.map((a) => <input key={a} type="hidden" name="amenity" value={a} />)}
            {q.rates.map((r) => <input key={r} type="hidden" name="rate" value={r} />)}
          </>
        )}
        <SortControl id={`${idPrefix}-sort`} value={q.sort} mode={mode} />

        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          {/* Legacy .btn-tonal → outlined secondary; .btn-text → text primary (Design-System §8). */}
          <MuiButton type="submit" variant="outlined" color="secondary" size="small" sx={ACTION_SX}>
            {RESULTS.filters.apply}
          </MuiButton>
          {hasActiveFilters(q) && (
            <MuiButton component={NextLink} href="/explore/results" variant="text" color="primary" size="small" sx={ACTION_SX}>
              {RESULTS.filters.clear}
            </MuiButton>
          )}
        </Box>
      </Box>
    </Box>
  );
}
