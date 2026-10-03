import { Fragment } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import InputBase from "@mui/material/InputBase";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import NextForm from "@/components/mui/NextForm";
import { DateRangePicker } from "@/components/public/DateRangePicker";
import { Icon } from "@/components/ui/Icon";
import { todayIso } from "@/lib/public/dates";
import { SEARCH_TIME_ZONE } from "@/lib/public/search";
import { EXPLORE, SEARCH_FIELDS } from "./content";

interface SearchBarProps {
  /** `pill` = the rounded bar inside the hero (C203, from md); `stacked` = the body card (M203, below md). */
  variant: "pill" | "stacked";
  className?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
}

/** The stacked (mobile) form's id, so the sticky bar can submit it from outside. */
export const STACKED_SEARCH_FORM_ID = "explore-search-stacked";

/** The brand-orange glyph beside a value, as every search cell draws it. */
const GLYPH = { display: "inline-flex", flexShrink: 0, color: "brand.main" } as const;

/** The artboard's pill: a Paper with the cells as flex children and Dividers between them. */
const PILL = { display: { xs: "none", md: "flex" }, alignItems: "center", color: "text.primary" } as const;

/** M203's card: the same cells stacked, one per row. */
const STACKED = { display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 0.5, p: 1.5 } as const;

/** A borderless input in the cell's own type, so the pill reads as text until you type in it. */
const PILL_INPUT = {
  typography: "subtitle2",
  lineHeight: 1.2,
  "& .MuiInputBase-input": { height: "auto", py: "2px" },
} as const;
const STACKED_INPUT = {
  flex: 1,
  minWidth: 0,
  typography: "subtitle2",
  "& .MuiInputBase-input": { height: "auto", minHeight: 44, py: 0, boxSizing: "border-box" },
} as const;

/**
 * The real search form on 2.0.3 (design: the C203 pill and the M203 stacked card). A GET form
 * via next/form, so it works without JavaScript and prefetches /explore/results. Field names
 * match `parseSearchParams` (dest / in / out / travelers); everything on the results page is
 * derived from the URL that this produces.
 *
 * The Paper IS the form (`component={NextForm}`): the cells are its flex children, so the
 * form element has to be the flex container, and the artboard draws that container as a
 * Paper (elevation 2 in the hero, 1 as the body card).
 *
 * M203's card has no button of its own — the sticky bottom bar *is* the Search. So the
 * stacked variant keeps a submit in the DOM (it is the form's default button, which is what
 * makes Enter submit the form, with or without JavaScript) but hides it, and the bar submits
 * this form by id.
 *
 * `today` is resolved HERE, on the server, and handed to both picker instances. Letting the
 * client compute it would make the first render disagree with the server's whenever the two
 * are on different sides of midnight — and the value gates which days are selectable.
 */
export function SearchBar({ variant, className, defaultCheckIn, defaultCheckOut }: SearchBarProps) {
  const pill = variant === "pill";
  const last = SEARCH_FIELDS.length - 1;
  const today = todayIso(SEARCH_TIME_ZONE);

  return (
    <Paper
      component={NextForm}
      action="/explore/results"
      id={pill ? undefined : STACKED_SEARCH_FORM_ID}
      role="search"
      aria-label={EXPLORE.search.formLabel}
      className={className}
      elevation={pill ? 2 : 1}
      sx={pill ? PILL : STACKED}
    >
      {SEARCH_FIELDS.map((field, index) => {
        const id = `search-${variant}-${field.name}`;
        const numeric = field.type === "number";

        const control =
          field.type === "dates" ? (
            <DateRangePicker
              idPrefix={`search-${variant}`}
              label={field.label}
              placeholder={field.placeholder}
              today={today}
              defaultCheckIn={defaultCheckIn}
              defaultCheckOut={defaultCheckOut}
              variant={variant}
              copy={EXPLORE.dates}
            />
          ) : (
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
              sx={pill ? PILL_INPUT : STACKED_INPUT}
            />
          );

        // The picker renders its own icon and label association (its trigger IS the labelled
        // control), so the cell chrome differs from a plain input's.
        const isDates = field.type === "dates";
        const labelFor = isDates ? `search-${variant}-dates` : id;

        if (pill) {
          return (
            <Fragment key={field.name}>
              {index > 0 && <Divider orientation="vertical" flexItem />}
              <Box sx={{ minWidth: 0, flex: 1, px: 2, py: 1.25 }}>
                <Typography
                  component="label"
                  htmlFor={labelFor}
                  variant="caption"
                  sx={{ display: "block", lineHeight: 1.2, color: "text.secondary" }}
                >
                  {field.label}
                </Typography>
                {isDates ? (
                  control
                ) : (
                  <Box sx={{ mt: 0.25, display: "flex", alignItems: "center", gap: 0.75 }}>
                    <Box component="span" sx={GLYPH}>
                      <Icon name={field.icon} size={13} />
                    </Box>
                    {control}
                  </Box>
                )}
              </Box>
            </Fragment>
          );
        }

        return (
          <Box
            key={field.name}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              py: 0.5,
              borderBottom: index < last ? 1 : 0,
              borderColor: "divider",
            }}
          >
            {!isDates && (
              <Box component="span" sx={GLYPH}>
                <Icon name={field.icon} size={14} />
              </Box>
            )}
            <Typography
              component="label"
              htmlFor={labelFor}
              variant="caption"
              sx={{ flexShrink: 0, width: isDates ? 76 : 86, color: "text.secondary" }}
            >
              {field.label}
            </Typography>
            {control}
          </Box>
        );
      })}

      {/* The pill's Search; on the card it stays in the DOM, hidden, as the default button. */}
      <MuiButton
        type="submit"
        variant="contained"
        startIcon={<Icon name="search" size={16} />}
        sx={pill ? { m: 0.5, minHeight: 44, flexShrink: 0, whiteSpace: "nowrap" } : { display: "none" }}
      >
        {EXPLORE.search.submit}
      </MuiButton>
    </Paper>
  );
}
