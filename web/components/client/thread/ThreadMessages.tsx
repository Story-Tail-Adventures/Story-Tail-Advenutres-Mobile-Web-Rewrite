import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { BODY, BODY_S, LABEL } from "@/components/client/client-sx";
import { EmptyState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { documentBadge, formatFileSize } from "@/lib/trips/documents";
import type { ThreadMessage } from "@/lib/trips/queries";
import { formatMessageTime, groupMessagesByDay, THREAD_MESSAGES } from "@/lib/trips/thread";

/**
 * The bubble, as the artboard's C26_MuiBubble draws it: the traveler's own on primary, the
 * advisor's an outlined Paper, each with the one tight corner that points at its sender.
 */
function bubbleSx(mine: boolean) {
  return {
    px: 1.75,
    py: 1.25,
    borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
    bgcolor: mine ? "primary.main" : "background.paper",
    color: mine ? "primary.contrastText" : "text.primary",
    typography: "body2",
    ...BODY,
  } as const;
}

/** The advisor's initials beside a bubble — the brand orange, 26px, sitting on the baseline. */
const BUBBLE_AVATAR_SX = {
  width: 26,
  height: 26,
  flexShrink: 0,
  alignSelf: "flex-end",
  bgcolor: "brand.main",
  color: "brand.contrastText",
  fontSize: 10,
  fontWeight: 700,
} as const;

/** The 14×16 document badge in front of an attachment name. */
const BADGE_SX = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 14,
  height: 16,
  flexShrink: 0,
  borderRadius: "2px",
  fontSize: 6,
  fontWeight: 800,
  lineHeight: 1,
  color: "common.white",
} as const;

/**
 * The bubbles, the day separators and the attachment chips — everything between the header
 * and the compose bar.
 *
 * THE EXTRACTION IS A DESIGN REQUIREMENT, not a tidy-up. `client-messaging-mobile.jsx` says
 * it outright: 2.6.2 "is not a new screen — it is M227_TripThread with a different header",
 * drawn to match "so that both builds mount one component instead of copying it. If the two
 * drift visually, the extraction never happens." 2.2.7's own page header had already promised
 * the same thing. This is that promise kept: the two screens now differ in their header, in
 * which action the composer is bound to, and in nothing else.
 *
 * Still a server component. Only the scroll position and the compose bar need the client.
 * ON MUI (step 2 of the migration): Paper bubbles, a stock small Chip for the day label, and
 * outlined Paper attachment rows, all with plain sx and palette paths.
 */
export function ThreadMessages({
  messages,
  timeZone,
  documentsHref,
  emptyBody = THREAD_MESSAGES.emptyBody,
}: {
  messages: ThreadMessage[];
  /** The traveler's own IANA zone. See `lib/trips/thread.ts` for why this is not ambient. */
  timeZone: string;
  /**
   * Where an attachment sends somebody. A trip thread has a trip library to open; the general
   * thread does not, and goes to the account-wide one (2.5.4).
   */
  documentsHref: string;
  /**
   * Overridden by the general thread, whose default would read "you and Gyasi talk about this
   * trip" on a conversation that has no trip. See MESSAGES.threadEmptyBody for why an empty
   * thread is reachable at all.
   */
  emptyBody?: string;
}) {
  const days = groupMessagesByDay(messages, timeZone);

  if (days.length === 0) {
    return <EmptyState icon="message" title={THREAD_MESSAGES.emptyTitle} body={emptyBody} />;
  }

  return (
    <Stack spacing={1.5}>
      {days.map((day) => (
        <Stack key={day.key} spacing={1.5}>
          <Box sx={{ textAlign: "center" }}>
            <Chip size="small" label={day.label} />
          </Box>

          {day.messages.map((message) => {
            const mine = message.sender === "client";
            return (
              <Stack
                key={message.id}
                direction="row"
                spacing={1}
                sx={{ justifyContent: mine ? "flex-end" : "flex-start" }}
              >
                {!mine && (
                  <Avatar aria-hidden="true" sx={BUBBLE_AVATAR_SX}>
                    GS
                  </Avatar>
                )}

                <Box sx={{ maxWidth: { xs: "78%", md: "70%" } }}>
                  <Paper elevation={0} variant={mine ? "elevation" : "outlined"} sx={bubbleSx(mine)}>
                    {/* `pre-line` so the paragraph breaks somebody typed survive. The compose
                        bar accepts shift+enter; swallowing those on the way back out would be
                        a quiet edit of their words. */}
                    <Box component="p" sx={{ m: 0, whiteSpace: "pre-line" }}>
                      {message.body}
                    </Box>
                  </Paper>

                  {message.attachments.length > 0 && (
                    <Box
                      component="ul"
                      sx={{
                        listStyle: "none",
                        m: 0,
                        p: 0,
                        mt: 0.75,
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.5,
                        alignItems: mine ? "flex-end" : "flex-start",
                      }}
                    >
                      {message.attachments.map((attachment) => {
                        const badge = documentBadge(attachment.mimeType);
                        return (
                          <Paper
                            component="li"
                            key={attachment.id}
                            variant="outlined"
                            sx={{
                              display: "inline-flex",
                              maxWidth: "100%",
                              alignItems: "center",
                              gap: 0.75,
                              px: 1,
                              py: 0.5,
                              typography: "body2",
                              ...BODY_S,
                            }}
                          >
                            <Box
                              component="span"
                              aria-hidden="true"
                              sx={{
                                ...BADGE_SX,
                                bgcolor: badge === "PDF" ? "brandSource.burgundy" : "brand.main",
                              }}
                            >
                              {badge}
                            </Box>
                            {/* Not a link to the file. Opening an attachment needs a signature,
                                and the place that already does that properly — audit row and
                                all — is the document library. Sending the traveler there beats
                                a second signer call site. */}
                            <MuiLink
                              component={NextLink}
                              href={documentsHref}
                              color="inherit"
                              underline="always"
                              noWrap
                              sx={{ minWidth: 0 }}
                            >
                              {attachment.filename}
                            </MuiLink>
                            <Box component="span" sx={{ flexShrink: 0, color: "text.secondary" }}>
                              {formatFileSize(attachment.sizeBytes)}
                            </Box>
                          </Paper>
                        );
                      })}
                    </Box>
                  )}

                  <Typography
                    component="p"
                    variant="caption"
                    sx={{
                      ...LABEL,
                      mt: 0.5,
                      fontSize: 11,
                      color: "text.secondary",
                      textAlign: mine ? "right" : "left",
                    }}
                  >
                    {formatMessageTime(message.createdAt, timeZone)}
                  </Typography>
                </Box>
              </Stack>
            );
          })}
        </Stack>
      ))}
    </Stack>
  );
}
