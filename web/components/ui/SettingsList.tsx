import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/icon-paths";
import { UP_MD } from "@/lib/mui/sx";

/**
 * The grouped settings list. Screen Inventory §2.5 is mostly this shape: 2.5.1's eight
 * tiles, 2.5.7's panels, 2.5.8's providers, 2.5.9's rows and 2.5.11's cards are all the
 * same row under different headings. §3.12 Agent Settings will want it too, which is why it
 * lives in `components/ui/` rather than `components/client/`.
 *
 * On MUI: a row is a ListItemButton (hover, ripple, focus ring) when it links somewhere and
 * a plain Box otherwise; the leading glyph is a rounded Avatar on secondary.container, the
 * way the converted 2.5.1 artboard draws it; the group is a Card. The row's box (16px by 12px
 * padding, 12px gap) is the legacy one so the account screens do not reflow.
 *
 * WHY A ROW IS A LINK, A BUTTON, OR A PLAIN DIV — and why it is never given an `onClick`.
 * These render inside async server components. A function cannot cross the RSC boundary: it
 * typechecks, it survives unit tests (which render in-process, so the boundary is never
 * crossed), and it throws at runtime. So a row takes an `href`, or it takes nothing and
 * renders inert. Anything genuinely interactive belongs in its own `"use client"` leaf. The
 * link itself is `component={NextLink}` — a client reference, which is the one kind of
 * component a Server Component may hand to MUI.
 *
 * A DISABLED ROW KEEPS ITS PLACE. §2.5 has several destinations whose backend does not exist
 * yet, and the §2.2 rule is to render them disabled with a reason rather than hide them — a
 * list that grows an item per release moves every other item under the reader's cursor. The
 * reason replaces the subtitle rather than sitting beside it, because two lines of grey on a
 * dimmed row is unreadable — which is also why the dim is 0.55 and not MUI's 0.38 for a
 * disabled control: this row still has to be read.
 */

export type SettingsRowProps = {
  icon?: IconName;
  title: string;
  /** Say what is INSIDE, in data ("4 files · 1 expiring soon"), not what the screen does. */
  sub?: string;
  href?: string;
  /** Renders inert and dimmed, with `reason` in place of `sub`. */
  disabled?: boolean;
  reason?: string;
  /** Right-hand slot: a value, a status chip, a `"use client"` control. Suppresses the chevron. */
  trailing?: React.ReactNode;
  danger?: boolean;
  first?: boolean;
  /**
   * Laid out as a tile in a grid rather than a row in a list. §4.4 puts 2.5.1 on Pattern D
   * variant — "Mobile: list of tiles. Tablet/web: grid of tiles" — and a tile carries its
   * own border instead of the shared top rule a stacked row uses.
   */
  tile?: boolean;
};

export function SettingsRow({
  icon,
  title,
  sub,
  href,
  disabled = false,
  reason,
  trailing,
  danger = false,
  first = false,
  tile = false,
}: SettingsRowProps) {
  const secondary = disabled ? reason : sub;

  const inner = (
    <>
      {icon && (
        <Avatar
          variant="rounded"
          aria-hidden="true"
          sx={{
            width: 36,
            height: 36,
            bgcolor: danger ? "error.container" : "secondary.container",
            color: danger ? "error.onContainer" : "secondary.onContainer",
          }}
        >
          <Icon name={icon} size={17} />
        </Avatar>
      )}
      <ListItemText
        primary={title}
        secondary={secondary || undefined}
        slotProps={{
          primary: { variant: "subtitle2", sx: danger ? { color: "error.main" } : undefined },
          secondary: { variant: "body2", noWrap: true },
        }}
        sx={{ my: 0, minWidth: 0 }}
      />
      {trailing ??
        (!disabled && href ? (
          <Box sx={{ display: "inline-flex", flexShrink: 0, color: "text.secondary" }}>
            <Icon name="chevron_right" size={16} />
          </Box>
        ) : null)}
    </>
  );

  const rowSx = {
    display: "flex",
    alignItems: "center",
    gap: 1.5,
    px: 2,
    py: 1.5,
    width: "100%",
    textAlign: "left",
    // A stacked row is separated by a top rule, except the first. A tile is the same below
    // md (still a stacked card there); from md up it carries its own outline and the grid
    // gap separates it, so the rule goes.
    ...(!first && { borderTop: 1, borderColor: "divider" }),
    ...(tile && {
      [UP_MD]: {
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: "background.paper",
      },
    }),
    ...(disabled && { opacity: 0.55 }),
  } as const;

  if (disabled) {
    return (
      // `reason` replaces the subtitle and is therefore already announced as part of the
      // row. An additional sr-only copy would read it twice.
      <Box sx={rowSx} aria-disabled="true">
        {inner}
      </Box>
    );
  }

  if (href) {
    return (
      <ListItemButton component={NextLink} href={href} sx={rowSx}>
        {inner}
      </ListItemButton>
    );
  }

  return <Box sx={rowSx}>{inner}</Box>;
}

/**
 * One card of rows under an optional uppercase heading. The heading is a plain label rather
 * than a real heading element unless `headingLevel` says otherwise — most §2.5 groups are
 * organisational, not navigational landmarks.
 */
export function SettingsGroup({
  label,
  children,
  className,
  tiles = false,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
  /** Pair with `tile` on each row. See SettingsRowProps.tile for the §4.4 reference. */
  tiles?: boolean;
}) {
  return (
    <Box component="section" className={className} sx={{ mt: 2.5, "&:first-of-type": { mt: 0 } }}>
      {label && (
        <Typography
          component="h2"
          variant="overline"
          sx={{ display: "block", mb: 1, px: 0.5, lineHeight: 1.3, color: "text.secondary" }}
        >
          {label}
        </Typography>
      )}
      {tiles ? (
        // Below md this is the same stacked card as a list group; from md up the card
        // dissolves and the rows become a two-column grid of tiles.
        <Card
          sx={{
            [UP_MD]: {
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 1.25,
              overflow: "visible",
              bgcolor: "transparent",
              backgroundImage: "none",
              boxShadow: "none",
            },
          }}
        >
          {children}
        </Card>
      ) : (
        <Card>{children}</Card>
      )}
    </Box>
  );
}
