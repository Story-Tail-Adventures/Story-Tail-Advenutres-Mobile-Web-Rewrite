import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { Icon } from "@/components/ui/Icon";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientActivityEvent } from "@/lib/agent/clientDetail";

/**
 * Screen 3.3.8 — the audit trail for this client and their trips.
 *
 * SIGN-INS ARE NOT HERE, and the note at the foot says so rather than leaving a reader to
 * wonder. §3.3.8's own description names logins first and the prototype draws one, but they
 * live in `auth_event` and have their own screen — §3.9.6 Login Activity. Building them
 * here would put half of §3.9.6 under a different heading.
 *
 * `event_type` IS NOT COPY. The slug is turned into a sentence in the view model, with an
 * unrecognised type falling back to a humanised form of itself rather than being dropped —
 * a timeline whose whole job is that nothing is missing from it cannot silently skip a row.
 *
 * ON MUI (step 2 of the migration, PR 6), as the A338 artboard draws it: a Card per event
 * with the glyph in a 28px secondary-container Avatar. Plain sx, so this stays a Server
 * Component.
 */
export function ClientActivityTab({ events }: { events: ClientActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <Typography component="p" variant="body2" sx={{ px: 0.5, py: 2, color: "text.secondary" }}>
        {CLIENT_COPY.activityEmpty}
      </Typography>
    );
  }

  return (
    <>
      <Stack component="ul" spacing={0.75} sx={{ m: 0, p: 0, listStyle: "none" }}>
        {events.map((e) => (
          <Card component="li" key={e.eventId}>
            <CardContent
              sx={{ px: 1.75, py: 1.25, display: "flex", alignItems: "center", gap: 1.25, "&:last-child": { pb: 1.25 } }}
            >
              <Avatar
                aria-hidden="true"
                sx={{ width: 28, height: 28, flexShrink: 0, bgcolor: "secondary.container", color: "secondary.onContainer" }}
              >
                <Icon name={e.icon} size={13} />
              </Avatar>
              <Typography component="span" variant="body2" noWrap sx={{ minWidth: 0, flex: 1 }}>
                {e.description}
                {e.actorName && (
                  <Box component="span" sx={{ color: "text.secondary" }}> · {e.actorName}</Box>
                )}
              </Typography>
              <Typography component="span" variant="caption" sx={{ flexShrink: 0, color: "text.secondary" }}>
                {e.whenLabel}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>
      <Typography component="p" variant="body2" sx={{ mt: 1.25, color: "text.secondary" }}>
        {CLIENT_COPY.activityNote}
      </Typography>
    </>
  );
}
