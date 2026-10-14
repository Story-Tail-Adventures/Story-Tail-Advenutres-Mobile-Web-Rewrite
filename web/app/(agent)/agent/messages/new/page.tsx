import { notFound, redirect } from "next/navigation";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { AgentReplyBox } from "@/components/agent/AgentReplyBox";
import { RetryState } from "@/components/client/RetryState";
import NextLink from "@/components/mui/NextLink";
import { AGENT_MESSAGES_COPY, messagesNewTo } from "@/lib/agent/content";
import { isUuid, remindThreadHref, threadHref } from "@/lib/agent/messageQuery";
import { loadMessageTarget } from "@/lib/agent/messages";
import { loadPickerData } from "@/lib/agent/messageTemplates";

/**
 * "Message client", from Client Detail (a general thread) and Trip Detail (that trip's thread).
 *
 * A thread that already exists is not started twice: this goes straight to it. Otherwise it is
 * a reply box addressed to the client, which starts the thread on send and then opens it. Not
 * in the Screen Inventory as its own screen; it is 3.10.2 before its first message, so it
 * sits in the thread's pane with the inbox beside it.
 */
export const metadata = { title: "New message" };

export default async function NewAgentMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; trip?: string; remind?: string }>;
}) {
  const { client, trip, remind } = await searchParams;
  if (!isUuid(client) || (trip !== undefined && !isUuid(trip))) notFound();
  // Trip Detail's "Remind the client" names a milestone; it only means something on a trip.
  const remindId = trip && isUuid(remind) ? remind : null;

  const result = await loadMessageTarget(client, trip ?? null);
  if (!result.ok && result.reason === "not-found") {
    return (
      <Box sx={{ px: { xs: 2, md: 4 }, py: 3 }}>
        <Typography component="p" variant="body2" sx={{ m: 0 }}>
          {AGENT_MESSAGES_COPY.notFound}
        </Typography>
      </Box>
    );
  }
  if (!result.ok) return <RetryState />;

  const { target } = result;
  if (target.conversationId) {
    redirect(remindId ? remindThreadHref(target.conversationId, remindId) : threadHref(target.conversationId));
  }
  const picker = await loadPickerData(target.clientId, target.tripId, remindId);

  return (
    <Box sx={{ mx: "auto", width: "100%", maxWidth: 760, px: { xs: 2, md: 4 }, py: 3 }}>
      <MuiLink
        component={NextLink}
        href="/agent/messages"
        underline="hover"
        variant="body2"
        sx={{ display: { xs: "inline-flex", lg: "none" } }}
      >
        {AGENT_MESSAGES_COPY.backToInbox}
      </MuiLink>
      <Typography component="h1" variant="h5" sx={{ m: 0, mt: { xs: 1.5, lg: 0 } }}>
        {messagesNewTo(target.clientFirstName)}
      </Typography>
      <Typography component="p" variant="body2" sx={{ mt: 0.25, mb: 2, color: "text.secondary" }}>
        {target.clientName} · {target.tripLabel}
      </Typography>
      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
        <AgentReplyBox
          clientId={target.clientId}
          tripId={target.tripId}
          clientFirstName={target.clientFirstName}
          clientCanSignIn={target.clientCanSignIn}
          picker={picker}
        />
      </Box>
    </Box>
  );
}
