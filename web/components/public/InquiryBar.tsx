import { Fragment } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import InputBase from "@mui/material/InputBase";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { EXPLORE } from "@/app/(public)/(hero)/explore/content";
import { QUOTE_PATH, type QuoteTopic } from "@/app/quote/href";
import NextForm from "@/components/mui/NextForm";
import { DateRangePicker } from "@/components/public/DateRangePicker";
import { Icon, type IconName } from "@/components/ui/Icon";
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
   * rides along as hidden inputs — the mode or topic the page implies. Typed per target, so a
   * quote bar cannot name a topic /quote would bounce to /explore.
   */
  form:
    | { to: "results"; label: string; hidden: { mode: ResultsMode } }
    | { to: "quote"; label: string; hidden: { topic: QuoteTopic } };
  action: { label: string; icon?: IconName };
  /** Sticks under the top bar from `md` (topic pages). */
  sticky?: boolean;
}

/** The brand-orange glyph beside a value, as every search cell draws it. */
const GLYPH = { display: "inline-flex", flexShrink: 0, color: "brand.main" } as const;

/**
 * The sticky band the pill sits in on topic pages. `.sticky-under-topbar` (public.css) owns
 * position / top / z-index and stays on the element as that hook; the paint is here.
 */
const STICKY_BAND = {
  display: { xs: "none", md: "block" },
  py: 1.75,
  bgcolor: "surface.1",
  borderBottom: 1,
  borderColor: "divider",
} as const;

/** The artboard's pill: a Paper with the cells as flex children and Dividers between them. */
const PILL = { display: { xs: "none", md: "flex" }, alignItems: "center", color: "text.primary" } as const;

/**
 * A borderless input in the cell's own type, so the pill reads as text until you type in it.
 * The hints carry the artboard's values, so they get full-opacity `text.secondary` (the dates
 * cell's colour) rather than MUI's 42% `currentColor`, which falls under 4.5:1.
 */
const PILL_INPUT = {
  typography: "subtitle2",
  lineHeight: 1.2,
  "& .MuiInputBase-input": { height: "auto", py: "2px" },
  "& .MuiInputBase-input::placeholder": { color: "text.secondary", opacity: 1 },
} as const;

/**
 * The topic pages' inquiry pill (design: StickyInquireBar on C208 / C209 / C210), as a REAL
 * form. It used to be display text plus a link, so nothing on it could be changed and the
 * button carried none of it.
 *
 * Same cells as the 2.0.3 search pill (`explore/SearchBar.tsx`): a caption label over a
 * borderless InputBase, and the shared DateRangePicker for dates. The cells start EMPTY with
 * the topic's example as the placeholder, so a bar left alone sends a broad search rather
 * than one the visitor never chose.
 *
 * The Paper IS the form, because the cells are its flex children. A results bar is next/form
 * (`component={NextForm}`, a client reference), which prefetches /explore/results. A quote
 * bar is a plain GET form: its target is a route handler that redirects, and next/form only
 * prefetches and soft-navigates to pages. Both work without JavaScript.
 *
 * Still a Server Component. `today` is resolved here, as SearchBar does, so the picker's
 * first render matches the server's.
 *
 * Below `md` the bar is not drawn at all; topic pages use StickyCta there (§4.4).
 */
export function InquiryBar({ fields, form, action, sticky = false }: InquiryBarProps) {
  const today = todayIso(SEARCH_TIME_ZONE);

  const body = (
    <>
      {Object.entries(form.hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {fields.map((field, index) => {
        const id = `inquiry-${field.name}`;
        const numeric = field.type === "number";
        return (
          <Fragment key={field.name}>
            {index > 0 && <Divider orientation="vertical" flexItem />}
            <Box sx={{ minWidth: 0, flex: 1, px: 2, py: 1.25 }}>
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
                  <Box component="span" sx={GLYPH}>
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
                    sx={PILL_INPUT}
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
        sx={{ m: 0.5, minHeight: 44, flexShrink: 0, whiteSpace: "nowrap" }}
      >
        {action.label}
      </MuiButton>
    </>
  );

  const elevation = sticky ? 1 : 2;
  const pill =
    form.to === "results" ? (
      <Paper
        component={NextForm}
        action="/explore/results"
        role="search"
        aria-label={form.label}
        elevation={elevation}
        sx={PILL}
      >
        {body}
      </Paper>
    ) : (
      // No role="search": this one asks for a quote. A named <form> is its own landmark.
      <Paper
        component="form"
        method="get"
        action={QUOTE_PATH}
        aria-label={form.label}
        elevation={elevation}
        sx={PILL}
      >
        {body}
      </Paper>
    );

  return (
    <Box className={sticky ? "sticky-under-topbar" : undefined} sx={sticky ? STICKY_BAND : undefined}>
      {sticky ? <Container size="wide">{pill}</Container> : pill}
    </Box>
  );
}
