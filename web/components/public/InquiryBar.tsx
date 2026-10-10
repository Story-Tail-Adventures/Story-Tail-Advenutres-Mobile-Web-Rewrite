import { Fragment } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import InputBase from "@mui/material/InputBase";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { EXPLORE } from "@/app/(public)/(hero)/explore/content";
import { QUOTE_PATH } from "@/app/quote/href";
import NextForm from "@/components/mui/NextForm";
import { DateRangePicker } from "@/components/public/DateRangePicker";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { Topic } from "@/content/public/types";
import { SEARCH_GLYPH, SEARCH_PILL_INPUT } from "@/lib/mui/sx";
import { todayIso } from "@/lib/public/dates";
import { SEARCH_TIME_ZONE, type ResultsMode } from "@/lib/public/search";
import { Container } from "./Container";

export interface InquiryField {
  /**
   * The query param the cell writes. `dates` is not one: it is the slot the DateRangePicker
   * fills, and the picker writes `in` and `out` itself. `vibe` is free text, so it belongs on
   * a quote bar only: the results page reads `vibe` as its allow-listed filter and would
   * silently drop anything typed.
   */
  name: "dest" | "dates" | "travelers" | "vibe";
  label: string;
  /**
   * Shown while the cell is empty. The topic's example, never a pre-chosen value: a
   * submitted bar carries only what the visitor actually typed or picked.
   */
  placeholder: string;
  icon: IconName;
  type: "text" | "number" | "dates";
}

interface InquiryBarProps {
  fields: readonly InquiryField[];
  /**
   * Where the bar submits. `results` opens the search (Cruises' live sailings); `quote`
   * hands the values to the quote request through /quote (Caribbean, Honeymoons). `hidden`
   * rides along as hidden inputs — the mode or topic the page implies.
   */
  form:
    | { to: "results"; label: string; hidden: { mode: ResultsMode } }
    | { to: "quote"; label: string; hidden: { topic: Topic } };
  action: { label: string; icon?: IconName };
}

/**
 * The sticky band the pill sits in. `.sticky-under-topbar` (public.css) owns position / top /
 * z-index and stays on the element as that hook; the paint is here.
 */
const STICKY_BAND = {
  display: { xs: "none", md: "block" },
  py: 1.75,
  bgcolor: "surface.1",
  borderBottom: 1,
  borderColor: "divider",
} as const;

/** Above this many cells, the bar wraps to two rows below `web` (Screen Inventory §2.0 tablet). */
const ONE_ROW_MAX = 3;

/**
 * The topic pages' inquiry pill (design: StickyInquireBar on C208 / C209 / C210), as a REAL
 * form. It used to be display text plus a link, so nothing on it could be changed and the
 * button carried none of it.
 *
 * Same cells as the 2.0.3 search pill (`explore/SearchBar.tsx`, sharing its sx from
 * lib/mui/sx): a caption label over a borderless InputBase, and the shared DateRangePicker for
 * dates. The cells start EMPTY with the topic's example as the placeholder, so a bar left
 * alone sends a broad search rather than one the visitor never chose.
 *
 * The Paper IS the form, because the cells are its children. A results bar is next/form
 * (`component={NextForm}`, a client reference), which prefetches /explore/results. A quote
 * bar is a plain GET form: its target is a route handler that redirects, and next/form only
 * prefetches and soft-navigates to pages. Both work without JavaScript.
 *
 * FOUR CELLS DO NOT FIT ONE ROW ON A TABLET. A text input cannot wrap the way the old display
 * text did, so at 800px "Anywhere romantic" read "Anywhere romanti" and typing scrolled the
 * start of a Vibe out of view. So a bar with more than three cells is a two-column grid from
 * `md` to `web` (the Screen Inventory's "inquire bar wraps to two rows"), each cell ruled off
 * by its own borders, and turns back into the artboard's single row with Dividers from `web`.
 * The three-cell Cruises bar fits one row at `md` and never wraps.
 *
 * Still a Server Component. `today` is resolved here, as SearchBar does, so the picker's
 * first render matches the server's; the pages revalidate hourly so it stays current.
 *
 * Below `md` the bar is not drawn at all; topic pages use StickyCta there (§4.4).
 */
export function InquiryBar({ fields, form, action }: InquiryBarProps) {
  const today = todayIso(SEARCH_TIME_ZONE);
  const wraps = fields.length > ONE_ROW_MAX;
  // In the two-column grid, an even count puts the button on a row of its own; an odd count
  // sits it beside the last cell.
  const buttonOwnRow = fields.length % 2 === 0;
  const lastRow = Math.floor((fields.length - 1) / 2);

  const results = form.to === "results";

  return (
    <Box className="sticky-under-topbar" sx={STICKY_BAND}>
      <Container size="wide">
        <Paper
          component={results ? NextForm : "form"}
          action={results ? "/explore/results" : QUOTE_PATH}
          method={results ? undefined : "get"}
          // A quote bar asks for a quote, not a search; a named <form> is its own landmark.
          role={results ? "search" : undefined}
          aria-label={form.label}
          elevation={1}
          sx={{
            display: { xs: "none", md: wraps ? "grid" : "flex", web: "flex" },
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            // Stretched in the grid so the cells in a row share one height and their rules meet;
            // the picker cell is a few px taller than a text cell, which left a step otherwise.
            alignItems: { md: wraps ? "stretch" : "center", web: "center" },
            color: "text.primary",
          }}
        >
          {Object.entries(form.hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {fields.map((field, index) => {
            const id = `inquiry-${field.name}`;
            const numeric = field.type === "number";
            const row = Math.floor(index / 2);
            const hasRightNeighbour = index % 2 === 0 && index + 1 < fields.length;
            const hasRowBelow = row < lastRow || buttonOwnRow;
            return (
              <Fragment key={field.name}>
                {index > 0 && (
                  <Divider
                    orientation="vertical"
                    flexItem
                    sx={wraps ? { display: { md: "none", web: "block" } } : undefined}
                  />
                )}
                <Box
                  sx={{
                    minWidth: 0,
                    flex: 1,
                    px: 2,
                    py: 1.25,
                    ...(wraps && {
                      borderColor: "divider",
                      borderRight: { md: hasRightNeighbour ? 1 : 0, web: 0 },
                      borderBottom: { md: hasRowBelow ? 1 : 0, web: 0 },
                    }),
                  }}
                >
                  {/* For dates this names the picker's trigger, whose id is `${idPrefix}-dates`. */}
                  <Typography
                    component="label"
                    htmlFor={id}
                    variant="caption"
                    sx={{ display: "block", lineHeight: 1.2, color: "text.secondary" }}
                  >
                    {field.label}
                  </Typography>
                  {field.type === "dates" ? (
                    <DateRangePicker
                      idPrefix="inquiry"
                      label={field.label}
                      placeholder={field.placeholder}
                      today={today}
                      variant="pill"
                      copy={EXPLORE.dates}
                    />
                  ) : (
                    <Box sx={{ mt: 0.25, display: "flex", alignItems: "center", gap: 0.75 }}>
                      <Box component="span" sx={SEARCH_GLYPH}>
                        <Icon name={field.icon} size={13} />
                      </Box>
                      <InputBase
                        id={id}
                        name={field.name}
                        type={field.type}
                        placeholder={field.placeholder}
                        autoComplete="off"
                        fullWidth
                        inputProps={{
                          inputMode: numeric ? "numeric" : undefined,
                          min: numeric ? 1 : undefined,
                          max: numeric ? 20 : undefined,
                          maxLength: numeric ? undefined : 60,
                        }}
                        sx={SEARCH_PILL_INPUT}
                      />
                    </Box>
                  )}
                </Box>
              </Fragment>
            );
          })}
          <MuiButton
            type="submit"
            variant="contained"
            startIcon={action.icon ? <Icon name={action.icon} size={14} /> : undefined}
            sx={{
              m: 0.5,
              minHeight: 44,
              flexShrink: 0,
              whiteSpace: "nowrap",
              ...(wraps && { gridColumn: buttonOwnRow ? "1 / -1" : "auto", justifySelf: "end", alignSelf: "center" }),
            }}
          >
            {action.label}
          </MuiButton>
        </Paper>
      </Container>
    </Box>
  );
}
