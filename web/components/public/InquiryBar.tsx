import { Fragment } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import MuiChip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { TAP_TARGET, VISUALLY_HIDDEN } from "@/lib/mui/sx";
import { Container } from "./Container";

export interface InquiryField {
  label: string;
  value: string;
  icon: IconName;
}

interface InquiryBarProps {
  fields: readonly InquiryField[];
  action: { label: string; href: string; icon?: IconName };
  /** Sticks under the top bar from `md` (topic pages). */
  sticky?: boolean;
  /** `compact` = the 2.0.4 header pill. */
  density?: "default" | "compact";
  /** Below `md`: a stacked card, a one-line summary pill, or nothing (topic pages use StickyCta). */
  mobile?: "stacked" | "summary" | "hidden";
  /** Text for the mobile summary pill ("Caribbean · Aug · 2 adults"). */
  summary?: string;
  /** Href of the mobile summary's "Edit" chip. */
  editHref?: string;
  className?: string;
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

/**
 * The read-only inquiry pill (design: StickyInquireBar, the C203/C204 search pills and the
 * M203/M204 mobile variants). Cells are display text; the CTA is a link. The real search
 * form on 2.0.3 is a separate component built on next/form.
 *
 * Paper and Dividers, as the artboard draws it: elevation 1 in the sticky band, 2 when it
 * floats on its own. No "use client": the topic pages render this with plain props.
 */
export function InquiryBar({
  fields,
  action,
  sticky = false,
  density = "default",
  mobile = "hidden",
  summary,
  editHref,
  className,
}: InquiryBarProps) {
  const compact = density === "compact";
  const pill = (
    <Paper elevation={sticky ? 1 : 2} sx={{ display: { xs: "none", md: "flex" }, alignItems: "center" }}>
      {fields.map((field, index) => (
        <Fragment key={field.label}>
          {index > 0 && <Divider orientation="vertical" flexItem />}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              ...(compact
                ? { display: "flex", alignItems: "center", gap: 0.75, px: 1.75, py: 1.25 }
                : { px: 2, py: 1.25 }),
            }}
          >
            {compact ? (
              <>
                <Box component="span" sx={GLYPH}>
                  <Icon name={field.icon} size={12} />
                </Box>
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ fontSize: 13, fontWeight: 500, lineHeight: 1.2, color: "text.primary" }}
                >
                  {field.value}
                </Typography>
                <Box component="span" sx={VISUALLY_HIDDEN}>
                  ({field.label})
                </Box>
              </>
            ) : (
              <>
                <Typography variant="caption" sx={{ display: "block", lineHeight: 1.2, color: "text.secondary" }}>
                  {field.label}
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mt: 0.25 }}>
                  <Box component="span" sx={GLYPH}>
                    <Icon name={field.icon} size={13} />
                  </Box>
                  <Typography component="span" variant="subtitle2" sx={{ lineHeight: 1.2, color: "text.primary" }}>
                    {field.value}
                  </Typography>
                </Stack>
              </>
            )}
          </Box>
        </Fragment>
      ))}
      <MuiButton
        component={NextLink}
        href={action.href}
        variant="contained"
        size={compact ? "small" : "medium"}
        startIcon={action.icon ? <Icon name={action.icon} size={14} /> : undefined}
        sx={{
          m: 0.5,
          flexShrink: 0,
          whiteSpace: "nowrap",
          ...(compact ? { minHeight: 32, px: 2 } : { minHeight: 44 }),
        }}
      >
        {action.label}
      </MuiButton>
    </Paper>
  );

  return (
    <Box className={cn(sticky && "sticky-under-topbar", className)} sx={sticky ? STICKY_BAND : undefined}>
      {sticky ? <Container size="wide">{pill}</Container> : pill}

      {mobile === "stacked" && (
        <Paper elevation={1} sx={{ display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 1, p: 1.5 }}>
          {fields.map((field, index) => (
            <Box
              key={field.label}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                py: 0.75,
                borderBottom: index < fields.length - 1 ? 1 : 0,
                borderColor: "divider",
              }}
            >
              <Box component="span" sx={GLYPH}>
                <Icon name={field.icon} size={14} />
              </Box>
              <Typography component="span" variant="caption" sx={{ width: 86, flexShrink: 0, color: "text.secondary" }}>
                {field.label}
              </Typography>
              <Typography component="span" variant="subtitle2" sx={{ color: "text.primary" }}>
                {field.value}
              </Typography>
            </Box>
          ))}
        </Paper>
      )}

      {mobile === "summary" && (
        <Paper
          elevation={1}
          sx={{
            display: { xs: "flex", md: "none" },
            alignItems: "center",
            gap: 1,
            borderRadius: "999px",
            px: 1.5,
            py: 0.75,
          }}
        >
          <Box component="span" sx={{ display: "inline-flex", flexShrink: 0, color: "text.secondary" }}>
            <Icon name="search" size={13} />
          </Box>
          <Typography
            component="span"
            variant="body2"
            noWrap
            sx={{ flex: 1, fontSize: 13, fontWeight: 500, color: "text.secondary" }}
          >
            {summary}
          </Typography>
          {editHref && (
            <MuiChip
              component={NextLink}
              href={editHref}
              clickable
              size="small"
              variant="outlined"
              label="Edit"
              sx={{ height: 24, color: "text.primary", ...TAP_TARGET }}
            />
          )}
        </Paper>
      )}
    </Box>
  );
}
