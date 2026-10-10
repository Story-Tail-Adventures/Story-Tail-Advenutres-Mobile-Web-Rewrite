import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormLabel from "@mui/material/FormLabel";
import InputBase from "@mui/material/InputBase";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import NextForm from "@/components/mui/NextForm";
import { DateRangePicker } from "@/components/public/DateRangePicker";
import { Icon } from "@/components/ui/Icon";
import { EXPLORE } from "@/app/(public)/(hero)/explore/content";
import { SEARCH_GLYPH, SEARCH_PLACEHOLDER, TAP_TARGET } from "@/lib/mui/sx";
import { todayIso } from "@/lib/public/dates";
import { effectiveMode, resultsHref, SEARCH_TIME_ZONE, type SearchQuery } from "@/lib/public/search";
import { RESULTS } from "./content";
import { inquirySummary } from "./filters";

/**
 * The results header pill (design C204), as a REAL form.
 *
 * It used to be `InquiryBar` — read-only cells plus an "Update" button linking to /explore —
 * and that link went to a BLANK search form. Changing one thing about a search meant retyping
 * all of it, which is the opposite of what a button called "Update" promises.
 *
 * `InquiryBar` (the three topic pages' sticky bar) became a form too, in October 2026, but it
 * stays a separate component: it carries nothing forward from a previous search, has no
 * mobile variant, and on two of the three pages it submits to the quote request instead.
 *
 * EDITING HAPPENS IN PLACE rather than by navigating to /explore, for two reasons. This route
 * is already dynamic (it reads searchParams), so a form here costs nothing, while making
 * /explore read them would turn the main public landing page from static to dynamic — and
 * BRD §15.1 makes SEO load-bearing for exactly that page. And it is simply fewer steps.
 *
 * EVERYTHING NOT IN THE FORM RIDES AS A HIDDEN INPUT. Filters, sort, topic and mode live in
 * the URL too, and a form that posted only the three visible fields would silently clear
 * them — the same trap `FilterRail` avoids from the other direction.
 *
 * ON MUI, STILL A SERVER COMPONENT. The md+ pill is an outlined Paper that IS the next/form
 * (`component={NextForm}`, the client reference in components/mui — Form forwards className
 * and ref to its <form>), with InputBase cells
 * and the artboard's divider rules. Below md the summary row became an MUI Accordion: it
 * keeps its own expanded state, so it needs no handler from here and no client island, and it
 * is keyed on the search so a new result set renders it collapsed again — the one thing the
 * old `<details>` could not do.
 */
/** Anchor target, so an empty state can send someone back to the form on this page. */
export const SEARCH_ANCHOR = "update-search";

/** `.t-label`: 12px, medium, loosely tracked — the stacked card's cell labels. */
const CELL_LABEL_SX = {
  width: 76,
  flexShrink: 0,
  typography: "caption",
  fontWeight: 500,
  letterSpacing: "0.4px",
  lineHeight: 1.3,
  color: "text.secondary",
} as const;

export function SearchUpdateBar({ q }: { q: SearchQuery }) {
  const today = todayIso(SEARCH_TIME_ZONE);
  const mode = effectiveMode(q);

  const carried = (
    <>
      {/* `mode` is written explicitly, not derived: an update that clears the dates would
          otherwise silently drop the visitor from Hotels back to the curated catalog. */}
      <input type="hidden" name="mode" value={mode} />
      {q.topic && <input type="hidden" name="topic" value={q.topic} />}
      {q.sort !== "best-fit" && <input type="hidden" name="sort" value={q.sort} />}
      {q.types.map((t) => <input key={t} type="hidden" name="type" value={t} />)}
      {q.vibes.map((v) => <input key={v} type="hidden" name="vibe" value={v} />)}
      {q.budgets.map((b) => <input key={b} type="hidden" name="budget" value={b} />)}
      {q.stars.map((s) => <input key={s} type="hidden" name="star" value={s} />)}
      {q.amenities.map((a) => <input key={a} type="hidden" name="amenity" value={a} />)}
      {q.rates.map((r) => <input key={r} type="hidden" name="rate" value={r} />)}
    </>
  );

  const cells = (compact: boolean) => {
    // Compact: the artboard's pill cell (px 1.75, py 1.25, a vertical rule between cells).
    // Stacked: the mobile card row (a bottom rule, a 76px label column, a 44px control).
    const cellSx = compact
      ? { minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 0.75, px: 1.75, py: 1.25, borderRight: 1, borderColor: "divider" }
      : { minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 1.25, py: 0.75, borderBottom: 1, borderColor: "divider" };
    // InputBase, the bare input: the cell draws the box, so the control itself has no padding
    // and takes the cell's type. Compact is body2/500 as the artboard sets its cell text.
    const inputSx = compact
      ? { flex: 1, minWidth: 0, typography: "body2", fontWeight: 500, "& .MuiInputBase-input": { p: 0, height: "auto" }, ...SEARCH_PLACEHOLDER }
      : { flex: 1, minWidth: 0, typography: "subtitle1", "& .MuiInputBase-input": { p: 0, height: "auto", minHeight: 44 }, ...SEARCH_PLACEHOLDER };

    return (
      <>
        <Box sx={cellSx}>
          <Box component="span" sx={SEARCH_GLYPH}>
            <Icon name="map" size={compact ? 12 : 14} />
          </Box>
          {!compact && (
            <FormLabel htmlFor="update-dest" sx={CELL_LABEL_SX}>
              {RESULTS.pill.destination}
            </FormLabel>
          )}
          <InputBase
            id={compact ? "update-dest-compact" : "update-dest"}
            name="dest"
            type="text"
            defaultValue={q.dest ?? ""}
            placeholder={RESULTS.pill.anywhere}
            autoComplete="off"
            inputProps={{ maxLength: 60, "aria-label": compact ? RESULTS.pill.destination : undefined }}
            sx={inputSx}
          />
        </Box>

        <Box sx={{ ...cellSx, ...(compact && { gap: 0 }) }}>
          {!compact && (
            <Box component="span" sx={SEARCH_GLYPH}>
              <Icon name="calendar" size={14} />
            </Box>
          )}
          {!compact && (
            <Typography component="span" sx={CELL_LABEL_SX}>
              {RESULTS.pill.dates}
            </Typography>
          )}
          <DateRangePicker
            idPrefix={compact ? "update-compact" : "update-stacked"}
            label={RESULTS.pill.dates}
            placeholder={RESULTS.pill.flexibleDates}
            today={today}
            defaultCheckIn={q.checkIn}
            defaultCheckOut={q.checkOut}
            variant={compact ? "compact" : "stacked"}
            copy={EXPLORE.dates}
          />
        </Box>

        <Box sx={{ ...cellSx, borderRight: 0, borderBottom: 0 }}>
          <Box component="span" sx={SEARCH_GLYPH}>
            <Icon name="user" size={compact ? 12 : 14} />
          </Box>
          {!compact && (
            <FormLabel htmlFor="update-travelers" sx={CELL_LABEL_SX}>
              {RESULTS.pill.travelers}
            </FormLabel>
          )}
          <InputBase
            id={compact ? "update-travelers-compact" : "update-travelers"}
            name="travelers"
            type="number"
            defaultValue={q.travelers ?? ""}
            placeholder="2"
            inputProps={{
              inputMode: "numeric",
              min: 1,
              max: 20,
              "aria-label": compact ? RESULTS.pill.travelers : undefined,
            }}
            sx={inputSx}
          />
        </Box>
      </>
    );
  };

  return (
    <Box id={SEARCH_ANCHOR} sx={{ scrollMarginTop: 80 }}>
      {/* md+ — the C204 pill, editable. The Paper is the form. */}
      <Paper
        component={NextForm}
        action="/explore/results"
        role="search"
        aria-label={RESULTS.header.updateLabel}
        variant="outlined"
        sx={{ display: { xs: "none", md: "flex" }, alignItems: "center" }}
      >
        {carried}
        {cells(true)}
        <MuiButton
          type="submit"
          variant="contained"
          size="small"
          sx={{ m: 0.5, flexShrink: 0, minHeight: 32, px: "16px", whiteSpace: "nowrap" }}
        >
          {RESULTS.header.update}
        </MuiButton>
      </Paper>

      {/* Below md — the summary stays, and opens the same form in place rather than sending
          anyone to another page. Keyed on the search so it collapses once a new result set
          renders; uncontrolled otherwise, so this stays a Server Component. */}
      <Accordion
        key={resultsHref(q)}
        disableGutters
        // A div, not MUI's default h3: this summary sits above the page's h1 on a phone.
        slots={{ heading: "div" }}
        sx={{ display: { md: "none" }, "&::before": { display: "none" } }}
      >
        <AccordionSummary
          id="update-search-summary"
          aria-controls="update-search-panel"
          sx={{
            ...TAP_TARGET,
            px: 1.5,
            minHeight: 44,
            "&.Mui-expanded": { minHeight: 44 },
            "& .MuiAccordionSummary-content": { alignItems: "center", gap: 1, my: 0.75, minWidth: 0 },
          }}
        >
          <Box component="span" sx={{ display: "inline-flex", flexShrink: 0, color: "text.secondary" }}>
            <Icon name="search" size={13} />
          </Box>
          <Typography
            component="span"
            variant="body2"
            noWrap
            sx={{ flex: 1, minWidth: 0, fontWeight: 500, color: "text.secondary" }}
          >
            {inquirySummary(q)}
          </Typography>
          {/* A span: the summary is a button, and a div inside a button is invalid. */}
          <Chip component="span" size="small" variant="outlined" label={RESULTS.header.edit} />
        </AccordionSummary>
        <AccordionDetails sx={{ p: 1.5, pt: 0 }}>
          <Box
            component={NextForm}
            action="/explore/results"
            role="search"
            aria-label={RESULTS.header.updateLabel}
            sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
          >
            {carried}
            {cells(false)}
            <MuiButton type="submit" variant="contained" sx={{ mt: 1, minHeight: 40, px: "24px", gap: 1 }}>
              <Icon name="search" size={16} />
              {RESULTS.header.update}
            </MuiButton>
          </Box>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
