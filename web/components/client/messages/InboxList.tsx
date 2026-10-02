"use client";

import { useId, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormLabel from "@mui/material/FormLabel";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import OutlinedInput from "@mui/material/OutlinedInput";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  BODY_S,
  BTN_44,
  HEADLINE,
  LABEL,
  TITLE_S,
  VISUALLY_HIDDEN,
  advisorAvatarSx,
} from "@/components/client/client-sx";
import { EmptyState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { MESSAGES } from "@/lib/messages/content";
import { filterRows, type InboxRow } from "@/lib/messages/inbox";
import { TAP_TARGET } from "@/lib/mui/sx";

/** The list's own gutter: `px-4 md:px-5`. */
const GUTTER = { xs: 2, md: 2.5 } as const;

/**
 * Screen 2.6.1's thread list — the master pane, and the whole screen below `web:`.
 *
 * A CLIENT COMPONENT ONLY BECAUSE OF THE SEARCH BOX. The rows arrive pre-formatted from the
 * server (see `lib/messages/inbox.ts`), so nothing in here touches a date or a time zone, and
 * the filter runs over exactly the strings on screen.
 *
 * WHAT THE DESKTOP FRAME HAS THAT THIS DOES NOT:
 *
 *  · The `All / Unread · 2 / By trip` filter chips. `conversation.client_unread_count` is
 *    granted and IS rendered as the badge below — but no runtime path in this repo ever
 *    raises it. `trip-message` sets it to 0 at creation and only ever increments the agent's
 *    side; the one place it is non-zero is `seed.sql`, which hand-writes a 2 so §2.2.3 has an
 *    unread state to show. So in a real account an "Unread" filter is a control that sorts
 *    nothing, and in a seeded one it filters a number that never changes again.
 *
 *    That is also why the planned `conversation-read` endpoint was NOT built: marking a
 *    thread read has nothing to mark until something counts. The increment and the clearing
 *    belong to the agent send path in §3.x and arrive together — the badge is ready for that
 *    day, and the chips can arrive with it. "By trip" is a grouping nobody specified beyond
 *    the chip itself.
 *
 *  · The two "System" threads. `conversation.agent_id` is NOT NULL and `user_role` is
 *    ('client','agent','admin') — there is no system sender, so those rows cannot exist.
 *    Departure 5 in `client-messaging-mobile.jsx`.
 *
 *  · Gyasi's photograph, which is a stock portrait of a stranger. Initials, everywhere.
 *
 * ON MUI (step 2 of the migration): MUI List / ListItemButton rows (the open one `selected`,
 * with the artboard's 3px brand rule), an OutlinedInput search with a visually hidden label,
 * and the unread count as a brand Chip. The root fills whatever pane the page wraps it in;
 * the pane's width and rule live on the page, so this component's props are unchanged.
 */
export function InboxList({
  rows,
  activeId = null,
  className = "",
}: {
  rows: InboxRow[];
  /** The open thread, for the selected row. Null on 2.6.1 itself. */
  activeId?: string | null;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const visible = filterRows(rows, query);

  return (
    <Box
      className={className || undefined}
      sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1, width: "100%" }}
    >
      <Box sx={{ flexShrink: 0, px: GUTTER, pt: 2 }}>
        <Typography component="h1" variant="h5" sx={HEADLINE}>
          {MESSAGES.title}
        </Typography>
        <Typography component="p" variant="body2" sx={{ ...BODY_S, color: "text.secondary" }}>
          {MESSAGES.subtitle}
        </Typography>

        <MuiButton
          component={NextLink}
          href="/messages/new"
          variant="contained"
          fullWidth
          startIcon={<Icon name="message" size={15} />}
          sx={{ ...BTN_44, ...TAP_TARGET, mt: 1.5 }}
        >
          {MESSAGES.newCta}
        </MuiButton>

        {/* Search earns its place only once there is something to search. One thread and a
            search box is furniture. */}
        {rows.length > 1 && (
          <>
            <FormLabel htmlFor={searchId} sx={VISUALLY_HIDDEN}>
              {MESSAGES.searchPlaceholder}
            </FormLabel>
            <OutlinedInput
              id={searchId}
              type="search"
              size="small"
              fullWidth
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={MESSAGES.searchPlaceholder}
              startAdornment={
                <InputAdornment position="start">
                  <Icon name="search" size={14} />
                </InputAdornment>
              }
              sx={{ mt: 1.5 }}
            />
          </>
        )}
      </Box>

      <Box sx={{ mt: 1, minHeight: 0, flex: 1, overflowY: "auto" }}>
        {rows.length === 0 ? (
          <EmptyState
            icon="message"
            title={MESSAGES.emptyTitle}
            body={MESSAGES.emptyBody}
            action={{ label: MESSAGES.emptyCta, href: "/messages/new" }}
          />
        ) : visible.length === 0 ? (
          <Typography
            component="p"
            variant="body2"
            sx={{ ...BODY_S, px: GUTTER, py: 3, textAlign: "center", color: "text.secondary" }}
          >
            {MESSAGES.searchEmpty}
          </Typography>
        ) : (
          <List disablePadding>
            {visible.map((row) => {
              const active = row.id === activeId;
              const muted = active ? "inherit" : "text.secondary";
              return (
                <ListItem key={row.id} disablePadding>
                  <ListItemButton
                    component={NextLink}
                    href={row.href}
                    selected={active}
                    aria-current={active ? "page" : undefined}
                    sx={{
                      px: GUTTER,
                      py: 1.5,
                      gap: 1.25,
                      alignItems: "flex-start",
                      borderLeft: 3,
                      borderColor: active ? "brand.main" : "transparent",
                      ...(active
                        ? {
                            bgcolor: "secondary.container",
                            color: "secondary.onContainer",
                            "&.Mui-selected, &.Mui-selected:hover": { bgcolor: "secondary.container" },
                          }
                        : undefined),
                    }}
                  >
                    <Avatar aria-hidden="true" sx={advisorAvatarSx(32, 11)}>
                      {MESSAGES.advisorInitials}
                    </Avatar>

                    <ListItemText
                      sx={{ my: 0, minWidth: 0 }}
                      primary={
                        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                          <Typography
                            component="span"
                            variant="subtitle1"
                            noWrap
                            sx={{ ...TITLE_S, flex: 1, minWidth: 0, color: "inherit" }}
                          >
                            {row.title}
                          </Typography>
                          <Typography
                            component="span"
                            variant="body2"
                            sx={{ ...BODY_S, flexShrink: 0, color: muted }}
                          >
                            {row.time}
                          </Typography>
                        </Stack>
                      }
                      secondary={
                        <>
                          <Typography
                            component="span"
                            variant="body2"
                            noWrap
                            sx={{ ...BODY_S, display: "block", mt: 0.25, color: muted }}
                          >
                            {row.preview}
                          </Typography>

                          {/* The trip kicker is dropped when the title IS the trip, which is
                              the common case — `trip-message` copies the trip title into
                              `subject`, and inboxTitle prefers the live trip name. Printing it
                              twice is noise. */}
                          {row.tripLabel && row.tripLabel !== row.title && (
                            <Typography
                              component="span"
                              variant="caption"
                              noWrap
                              sx={{
                                ...LABEL,
                                mt: 0.75,
                                fontSize: 9.5,
                                textTransform: "uppercase",
                                color: active ? "inherit" : "brand.main",
                              }}
                            >
                              {row.tripLabel}
                            </Typography>
                          )}
                        </>
                      }
                      slotProps={{
                        primary: { component: "div" },
                        secondary: { component: "div", sx: { color: "inherit" } },
                      }}
                    />

                    {row.unreadCount > 0 && (
                      <Chip
                        label={row.unreadCount}
                        size="small"
                        color="brand"
                        sx={{
                          height: 20,
                          minWidth: 20,
                          flexShrink: 0,
                          fontWeight: 700,
                          fontSize: 11,
                          "& .MuiChip-label": { px: 0.75 },
                        }}
                      />
                    )}
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>
    </Box>
  );
}
