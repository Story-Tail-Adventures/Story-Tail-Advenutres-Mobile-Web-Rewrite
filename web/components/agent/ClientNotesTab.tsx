"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import OutlinedInput from "@mui/material/OutlinedInput";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { writeClientNote } from "@/app/(agent)/agent/clients/[clientId]/actions";
import { Button } from "@/components/ui/Button";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientNote } from "@/lib/agent/clientDetail";

/**
 * Screen 3.3.7's Notes tab — the one client island on this screen.
 *
 * SAME SHAPE AS `TripNotesEditor`: the server action is imported directly rather than
 * passed as a prop, because a plain function in a `"use client"` prop object typechecks,
 * passes tests, and throws at runtime across the RSC boundary.
 *
 * THE LIST IS SERVER-RENDERED AND `revalidatePath` REFRESHES IT. Nothing here keeps a local
 * copy of the notes: a composer that appended optimistically would need its own id, its own
 * author name and its own timestamp, all three of which the server already knows and one of
 * which (whether the body was actually stored, after trimming) it alone can answer.
 *
 * DELETE ASKS FIRST. It is the only destructive control on the detail surface, and a note
 * is the one thing here that cannot be reconstructed from anywhere else.
 *
 * ON MUI (step 2 of the migration, PR 6), as the A337 artboard draws it: the composer a
 * Card with a native textarea inside MUI's outline (`inputComponent="textarea"`, as the
 * Textarea primitive does, so the box keeps a fixed height), each note an outlined Paper on
 * surface.2 with its time in the brand orange, and the Button primitive throughout.
 */

/** `.t-label` on MUI's caption: the eyebrow over the composer. */
const LABEL_SX = {
  display: "block",
  fontWeight: 500,
  lineHeight: 1.3,
  letterSpacing: "0.4px",
  color: "text.secondary",
} as const;

export function ClientNotesTab({ clientId, notes }: { clientId: string; notes: ClientNote[] }) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<{ ok: boolean; message?: string }>,
    onDone?: () => void,
  ) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? CLIENT_COPY.noteFailed);
        return;
      }
      setSaved(true);
      onDone?.();
    });
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
      <Card component="section">
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Typography component="div" variant="caption" sx={LABEL_SX}>
            {CLIENT_COPY.noteComposerEyebrow}
          </Typography>
          <OutlinedInput
            fullWidth
            multiline
            inputComponent="textarea"
            rows={3}
            size="small"
            placeholder={CLIENT_COPY.noteComposerPlaceholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            inputProps={{ "aria-label": CLIENT_COPY.noteComposerEyebrow }}
            sx={{ mt: 0.75 }}
          />
          <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1 }}>
            <Button
              type="button"
              variant="tonal"
              size="sm"
              disabled={pending || draft.trim() === ""}
              onClick={() =>
                run(
                  () => writeClientNote({ clientId, op: "create", body: draft }),
                  () => setDraft(""),
                )
              }
            >
              {pending ? CLIENT_COPY.noteSaving : CLIENT_COPY.noteSave}
            </Button>
            {saved && !error && (
              <Typography component="span" variant="body2" role="status" sx={{ color: "text.secondary" }}>
                {CLIENT_COPY.noteSaved}
              </Typography>
            )}
            {error && (
              <Typography component="span" variant="body2" role="alert" sx={{ color: "error.main" }}>
                {error}
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>

      {notes.length === 0 ? (
        <Typography component="p" variant="body2" sx={{ px: 0.5, color: "text.secondary" }}>
          {CLIENT_COPY.notesEmpty}
        </Typography>
      ) : (
        <Stack component="ul" spacing={1} sx={{ m: 0, p: 0, listStyle: "none" }}>
          {notes.map((n) => (
            <Paper component="li" key={n.noteId} variant="outlined" sx={{ p: 1.75, bgcolor: "surface.2" }}>
              <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
                <Typography component="span" variant="overline" sx={{ color: "brand.main", lineHeight: 1.3 }}>
                  {n.whenLabel}
                </Typography>
                <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
                  · {n.authorName}
                  {n.edited ? ` · ${CLIENT_COPY.noteEditedMarker}` : ""}
                </Typography>
                {/* Only the author may edit — the accessor answers `author_is_me` and the
                    write function enforces it, so this is an affordance over a real rule. */}
                {n.mine && editingId !== n.noteId && confirmingId !== n.noteId && (
                  <Box component="span" sx={{ ml: "auto", display: "flex", gap: 0.5 }}>
                    <Button
                      type="button"
                      variant="text"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        setEditingId(n.noteId);
                        setEditDraft(n.body);
                      }}
                    >
                      {CLIENT_COPY.noteEdit}
                    </Button>
                    <Button
                      type="button"
                      variant="text"
                      size="sm"
                      disabled={pending}
                      onClick={() => setConfirmingId(n.noteId)}
                    >
                      {CLIENT_COPY.noteDelete}
                    </Button>
                  </Box>
                )}
              </Box>

              {editingId === n.noteId ? (
                <>
                  <OutlinedInput
                    fullWidth
                    multiline
                    inputComponent="textarea"
                    rows={3}
                    size="small"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    disabled={pending}
                    inputProps={{ "aria-label": `Edit note from ${n.whenLabel}` }}
                    sx={{ mt: 1 }}
                  />
                  <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
                    <Button
                      type="button"
                      variant="tonal"
                      size="sm"
                      disabled={pending || editDraft.trim() === ""}
                      onClick={() =>
                        run(
                          () =>
                            writeClientNote({
                              clientId,
                              op: "update",
                              noteId: n.noteId,
                              body: editDraft,
                            }),
                          () => setEditingId(null),
                        )
                      }
                    >
                      {pending ? CLIENT_COPY.noteSaving : CLIENT_COPY.noteSave}
                    </Button>
                    <Button
                      type="button"
                      variant="text"
                      size="sm"
                      disabled={pending}
                      onClick={() => setEditingId(null)}
                    >
                      {CLIENT_COPY.noteCancel}
                    </Button>
                  </Box>
                </>
              ) : (
                <Typography component="p" variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                  {n.body}
                </Typography>
              )}

              {confirmingId === n.noteId && (
                <Box sx={{ mt: 1, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
                  <Typography component="span" variant="body2" sx={{ color: "text.secondary" }}>
                    Delete this note?
                  </Typography>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => writeClientNote({ clientId, op: "archive", noteId: n.noteId }),
                        () => setConfirmingId(null),
                      )
                    }
                  >
                    {CLIENT_COPY.noteDelete}
                  </Button>
                  <Button
                    type="button"
                    variant="text"
                    size="sm"
                    disabled={pending}
                    onClick={() => setConfirmingId(null)}
                  >
                    {CLIENT_COPY.noteCancel}
                  </Button>
                </Box>
              )}
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
