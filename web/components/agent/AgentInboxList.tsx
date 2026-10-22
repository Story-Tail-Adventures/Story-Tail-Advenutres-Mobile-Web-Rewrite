"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { setThreadsArchivedAction, type ArchiveResult } from "@/app/(agent)/agent/messages/actions";
import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { AGENT_MESSAGES_COPY, messagesMoved, messagesSelected } from "@/lib/agent/content";
import type { InboxThread } from "@/lib/agent/messages";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Screen 3.10.1's list (A3101_AgentInbox's left column): one row per thread, newest first,
 * with the client, the trip, what was said last, when, and the unread count; an overdue
 * thread's time is red, the artboard's "⚠".
 *
 * A CLIENT COMPONENT ONLY FOR THE SELECTION. "Bulk-archive" is the Screen Inventory's one
 * bulk action, so each row has a checkbox; the bar above the list appears once any is
 * ticked. Everything else here is plain data from the server.
 *
 * EACH ROW IS A LINK, the checkbox beside it rather than inside it: a checkbox in a link is
 * a click that both ticks and navigates. `scroll={false}`: opening a thread must not scroll
 * the list back to its top (the router's default for a changed segment).
 *
 * No `router.refresh()` after an archive: the action's revalidation redraws the list.
 */
export function AgentInboxList({
  threads,
  activeId,
  archivedView,
}: {
  threads: InboxThread[];
  activeId?: string | null;
  archivedView: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();

  // A thread that left the list (archived elsewhere, filtered away) leaves the selection too,
  // so it is not still ticked if it comes back. Adjusted during render, React's pattern for
  // state that follows a prop.
  const visible = new Set(threads.map((t) => t.id));
  const listKey = threads.map((t) => t.id).join(",");
  const [shownKey, setShownKey] = useState(listKey);
  if (shownKey !== listKey) {
    setShownKey(listKey);
    setSelected((prev) => new Set([...prev].filter((id) => visible.has(id))));
  }
  const chosen = [...selected].filter((id) => visible.has(id));

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function move() {
    setError(null);
    setStatus("");
    const archiving = !archivedView;
    startTransition(async () => {
      let result: ArchiveResult;
      try {
        result = await setThreadsArchivedAction(chosen, archiving);
      } catch {
        result = { ok: false, message: AGENT_MESSAGES_COPY.archiveFailed };
      }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSelected(new Set());
      setStatus(messagesMoved(result.moved, archiving));
    });
  }

  return (
    <Box>
      {/* Always in the page: "2 selected" and "2 archived" are announced as they change. */}
      <Box component="span" role="status" sx={VISUALLY_HIDDEN}>
        {chosen.length > 0 ? messagesSelected(chosen.length) : status}
      </Box>
      {chosen.length > 0 && (
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.75, py: 1, bgcolor: "surface.2" }}
          role="region"
          aria-label={AGENT_MESSAGES_COPY.selectedLabel}
        >
          <Typography component="p" variant="body2" aria-hidden sx={{ m: 0, flex: 1 }}>
            {messagesSelected(chosen.length)}
          </Typography>
          <Button type="button" variant="outlined" size="sm" disabled={pending} onClick={move}>
            {archivedView ? AGENT_MESSAGES_COPY.restoreSelected : AGENT_MESSAGES_COPY.archiveSelected}
          </Button>
        </Box>
      )}
      {error && (
        <Typography component="p" variant="body2" role="alert" sx={{ m: 0, px: 1.75, py: 1, color: "error.main" }}>
          {error}
        </Typography>
      )}

      <Box component="ul" aria-label={AGENT_MESSAGES_COPY.inboxLabel} sx={{ listStyle: "none", m: 0, p: 0 }}>
        {threads.map((t) => {
          const active = t.id === activeId;
          return (
            <Box
              component="li"
              key={t.id}
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: 0.5,
                pl: 0.5,
                pr: 1.75,
                py: 1,
                borderBottom: 1,
                borderColor: "divider",
                borderLeft: 3,
                borderLeftColor: active ? "brand.main" : "transparent",
                bgcolor: active ? "surface.2" : "transparent",
              }}
            >
              <Checkbox
                size="small"
                checked={selected.has(t.id)}
                onChange={(e) => toggle(t.id, e.target.checked)}
                disabled={pending}
                slotProps={{ input: { "aria-label": `${AGENT_MESSAGES_COPY.selectLabel} ${t.clientName} · ${t.tripLabel}` } }}
              />
              <MuiLink
                component={NextLink}
                href={t.href}
                scroll={false}
                underline="none"
                color="inherit"
                aria-current={active ? "page" : undefined}
                sx={{ flex: 1, minWidth: 0, py: 0.5 }}
              >
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                  <Typography
                    component="span"
                    variant="subtitle2"
                    sx={{ flex: 1, minWidth: 0, fontWeight: t.unread > 0 ? 700 : 500 }}
                    noWrap
                  >
                    {t.clientName}
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ flexShrink: 0, color: t.overdue ? "error.main" : "text.secondary", fontWeight: t.overdue ? 600 : 400 }}
                  >
                    {t.overdue ? `${AGENT_MESSAGES_COPY.overdue} · ${t.timeLabel}` : t.timeLabel}
                  </Typography>
                </Box>
                <Typography component="span" variant="caption" sx={{ display: "block", color: "text.secondary" }} noWrap>
                  {t.preview}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                  <Typography
                    component="span"
                    variant="overline"
                    sx={{ flex: 1, minWidth: 0, color: "brand.main", fontWeight: 600, lineHeight: 1.2 }}
                    noWrap
                  >
                    {t.tripLabel}
                    {t.replyByLabel && (
                      <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
                        {` · ${t.replyByLabel}`}
                      </Box>
                    )}
                  </Typography>
                  {t.unread > 0 && (
                    <Chip
                      size="small"
                      color="brand"
                      label={
                        <>
                          {t.unread}
                          <Box component="span" sx={VISUALLY_HIDDEN}>{` ${AGENT_MESSAGES_COPY.unreadLabel}`}</Box>
                        </>
                      }
                      sx={{ height: 20, fontWeight: 700, "& .MuiChip-label": { px: 0.75 } }}
                    />
                  )}
                </Box>
              </MuiLink>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
