"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { setThreadsArchivedAction, type ArchiveResult } from "@/app/(agent)/agent/messages/actions";
import { Button } from "@/components/ui/Button";
import { AGENT_MESSAGES_COPY } from "@/lib/agent/content";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * The thread header's Archive / Move to inbox. A client component rather than a plain form so
 * the advisor hears what happened ("Archived") and sees why it did not, instead of a page
 * that quietly re-renders with the other button. The action's revalidation redraws the
 * header and the list.
 */
export function ThreadArchiveButton({ conversationId, archived }: { conversationId: string; archived: boolean }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    setStatus("");
    const next = !archived;
    startTransition(async () => {
      let result: ArchiveResult;
      try {
        result = await setThreadsArchivedAction([conversationId], next);
      } catch {
        result = { ok: false, message: AGENT_MESSAGES_COPY.archiveFailed };
      }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setStatus(next ? AGENT_MESSAGES_COPY.archivedDone : AGENT_MESSAGES_COPY.restoredDone);
    });
  }

  return (
    <Box sx={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
      <Button type="button" variant="text" size="sm" disabled={pending} onClick={toggle}>
        {archived ? AGENT_MESSAGES_COPY.restoreThread : AGENT_MESSAGES_COPY.archiveThread}
      </Button>
      <Box component="span" role="status" sx={VISUALLY_HIDDEN}>
        {status}
      </Box>
      {error && (
        <Typography component="p" variant="caption" role="alert" sx={{ m: 0, color: "error.main" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
