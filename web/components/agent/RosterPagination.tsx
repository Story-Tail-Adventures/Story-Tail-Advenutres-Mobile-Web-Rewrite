import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { CLIENT_COPY } from "@/lib/agent/content";

/**
 * The roster's paginator — the first one in this codebase.
 *
 * SERVER-RENDERED LINKS, not a client control, so it matches the filters above it: the page
 * is in the URL, the back button works, and the table stays a server component.
 *
 * IT CARRIES THE FILTERS FORWARD. A "Next" that dropped `q` and `tag` would page through a
 * different result set than the one on screen — the count would say 27 and the second page
 * would show strangers.
 *
 * THE CALLER BUILDS THE HREFS, and that is the whole reason this takes a function rather
 * than a query object. It used to own a `hrefFor` that hardcoded `/agent/clients` and the
 * client roster's own parameter names; reusing it for §3.4.1's trips typechecked perfectly
 * and would have paged the advisor off the screen they were on, silently dropping the stage
 * filter on the way. Which parameters a list uses is the list's knowledge, not this
 * component's.
 *
 * ON MUI (step 2 of the migration, PR 6): the two links are outlined MUI Buttons rendered
 * as Next Links, in the legacy `.btn-sm` box. The end-of-range placeholder is the same
 * Button disabled, still a `<span>` rather than a `<button>` as it always was — MUI gives
 * it `aria-disabled="true"` and takes it out of the tab order, which is what the legacy
 * `aria-disabled` span meant. Plain sx, so this stays a Server Component.
 */

/** The legacy `.btn.btn-sm` box on an MUI Button: 32px tall, 16px sides, 8px icon gap. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

export function RosterPagination({
  hrefFor,
  page,
  pageCount,
  total,
  shown,
  pageSize = 25,
}: {
  /** Given a 1-based page, the URL for it — filters and all. */
  hrefFor: (page: number) => string;
  page: number;
  pageCount: number;
  total: number;
  shown: number;
  pageSize?: number;
}) {
  if (pageCount <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = first + shown - 1;

  return (
    <Box
      component="nav"
      aria-label="Roster pages"
      sx={{ mt: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}
    >
      <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
        {first}–{last} of {total}
      </Typography>
      <Box component="span" sx={{ display: "flex", gap: 1 }}>
        {page > 1 ? (
          <MuiButton
            component={NextLink}
            href={hrefFor(page - 1)}
            variant="outlined"
            color="primary"
            size="small"
            sx={BTN_SM}
          >
            {CLIENT_COPY.paginationPrev}
          </MuiButton>
        ) : (
          <MuiButton component="span" disabled variant="outlined" color="primary" size="small" sx={BTN_SM}>
            {CLIENT_COPY.paginationPrev}
          </MuiButton>
        )}
        {page < pageCount ? (
          <MuiButton
            component={NextLink}
            href={hrefFor(page + 1)}
            variant="outlined"
            color="primary"
            size="small"
            sx={BTN_SM}
          >
            {CLIENT_COPY.paginationNext}
          </MuiButton>
        ) : (
          <MuiButton component="span" disabled variant="outlined" color="primary" size="small" sx={BTN_SM}>
            {CLIENT_COPY.paginationNext}
          </MuiButton>
        )}
      </Box>
    </Box>
  );
}
