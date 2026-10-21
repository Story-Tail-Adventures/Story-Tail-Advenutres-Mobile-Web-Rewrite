import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import type { PeriodChip } from "@/lib/agent/reportsView";
import { REPORTS_COPY } from "@/lib/agent/reportsCopy";
import { TAP_TARGET } from "@/lib/mui/sx";

/**
 * The frame every §3.11 report shares, as the artboard's ReportShell draws it: a "Reports hub"
 * back link, the title and subtitle, then the period chips and Export on the right.
 *
 * THE CHIPS ARE LINKS. The period is in the URL (`?period=12mo`), so a report is shareable and
 * the back button works, and the page stays a Server Component with no client state. The
 * selected chip carries `aria-current`, so a screen reader hears which period is on.
 *
 * EXPORT IS A PLAIN ANCHOR, never next/link (CommissionHeader's reasoning): the route answers
 * with an attachment and writes an audit row, so it must not be prefetched on hover.
 *
 * `window` is the period's dates in words ("Jan 1 to Oct 21, 2026"), under the title, so the
 * advisor never has to work out what "Year to date" meant on the day they printed it.
 */
export function ReportShell({
  title,
  subtitle,
  chips,
  exportHref,
  windowLabel,
  controls,
  children,
}: {
  title: string;
  subtitle: string;
  /** Empty for a report that is not over a period (lifetime value, pipeline). */
  chips: PeriodChip[];
  exportHref: string;
  windowLabel: string | null;
  /** Report-specific controls under the header, such as Revenue's basis toggle. */
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box sx={PAGE_SX}>
      <MuiLink
        component={NextLink}
        href="/agent/reports"
        underline="hover"
        variant="body2"
        sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontWeight: 600, ...TAP_TARGET }}
      >
        <Icon name="arrow_left" size={12} />
        {REPORTS_COPY.backToHub}
      </MuiLink>

      <Box component="header" sx={{ mt: 1.5, mb: 2, display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1.5 }}>
        {/* A 260px basis so the title wraps above the chips on a phone, never under them. */}
        <Box sx={{ minWidth: 0, flex: "1 1 260px" }}>
          <Typography component="h1" variant="h5" sx={{ m: 0 }}>
            {title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
            {subtitle}
          </Typography>
          {windowLabel && (
            <Typography component="p" variant="caption" sx={{ mt: 0.5, display: "block", color: "text.secondary" }}>
              {windowLabel}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          {chips.length > 0 && (
            <Box component="nav" aria-label={REPORTS_COPY.periodLabel} sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
              {chips.map((c) => (
                <Chip
                  key={c.period}
                  component={NextLink}
                  href={c.href}
                  clickable
                  label={c.label}
                  color={c.selected ? "secondary" : "default"}
                  variant={c.selected ? "filled" : "outlined"}
                  aria-current={c.selected ? "true" : undefined}
                  // `scroll={false}`: switching the period should not jump the page to the top.
                  scroll={false}
                  sx={TAP_TARGET}
                />
              ))}
            </Box>
          )}
          <MuiButton
            component="a"
            href={exportHref}
            variant="outlined"
            color="secondary"
            size="small"
            sx={{ gap: 0.75, minHeight: 32, ...TAP_TARGET }}
          >
            <Icon name="download" size={12} />
            {REPORTS_COPY.exportLabel}
          </MuiButton>
        </Box>
      </Box>

      {controls}
      {children}
    </Box>
  );
}

/** The commission pages' column, so moving between Commission and Reports does not shift. */
const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1336, px: { xs: 2, md: 4 }, py: 3 } as const;

/** A quiet note under a report: what its figures leave out, said plainly. */
export function ReportNote({ children }: { children: ReactNode }) {
  return (
    <Typography component="p" variant="caption" sx={{ mt: 1.25, display: "block", color: "text.secondary", maxWidth: 760 }}>
      {children}
    </Typography>
  );
}
