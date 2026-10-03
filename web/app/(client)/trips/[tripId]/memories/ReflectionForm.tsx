"use client";

import { useActionState, useState } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import OutlinedInput from "@mui/material/OutlinedInput";
import Typography from "@mui/material/Typography";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { saveReflection, type ReflectionState } from "@/lib/trips/actions";
import type { PastTripView } from "@/lib/trips/queries";
import { BTN, CARD_PAD, TITLE_S } from "../sx";
import { MEMORIES } from "./content";

const IDLE: ReflectionState = { status: "idle" };

/**
 * The 2.2.11 reflection card: a prompt, a box, save-for-later and send.
 *
 * OPENS CLOSED. §2.2.11 lists testimonial submission among its primary elements but this
 * screen exists to be looked at, not filled in — a textarea sitting open under a photo
 * gallery turns a memory into a form. So it is a button until somebody taps it, and it opens
 * already-expanded when they have a draft in progress, which is the one case where they came
 * back specifically to finish it.
 *
 * TWO SUBMIT BUTTONS, one form, distinguished by a hidden `intent` field rather than by two
 * actions: "save for later" and "send it to Gyasi" post the same words to the same endpoint
 * and differ only in whether the row leaves `draft`. `formAction` on a button would work too
 * but would need the whole action duplicated to change one boolean.
 *
 * The value is derived rather than synced, same as the thread's composer — see the note
 * there for why `react-hooks/set-state-in-effect` rules out the obvious version.
 */
export function ReflectionForm({
  tripId,
  reflection,
}: {
  tripId: string;
  reflection: PastTripView["reflection"];
}) {
  const save = saveReflection.bind(null, tripId);
  const [state, action, pending] = useActionState(save, IDLE);
  const [open, setOpen] = useState(reflection?.editable === true && reflection.body.length > 0);
  const [typed, setTyped] = useState<string | null>(null);

  // Once the server says it is submitted, this render is authoritative over the row the page
  // was built from — the traveler has not navigated yet.
  const submitted = state.status === "submitted" || reflection?.editable === false;

  if (submitted) {
    return (
      <Card component="section" sx={{ bgcolor: "secondary.container", color: "secondary.onContainer" }}>
        <CardContent sx={CARD_PAD}>
          <Typography component="h2" variant="subtitle1" sx={TITLE_S}>
            {MEMORIES.reflectionSubmittedHeading}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.5, opacity: 0.9 }}>
            {MEMORIES.reflectionSubmittedBody}
          </Typography>
          {reflection?.body && (
            <Typography
              component="blockquote"
              variant="body2"
              sx={{
                m: 0,
                mt: 1.5,
                pl: 1.5,
                borderLeft: 2,
                borderColor: "color-mix(in srgb, currentColor 30%, transparent)",
                opacity: 0.9,
              }}
            >
              {reflection.body}
            </Typography>
          )}
        </CardContent>
      </Card>
    );
  }

  const draft = typed ?? (state.status === "error" ? state.draft : (reflection?.body ?? ""));
  const empty = draft.trim().length === 0;

  return (
    <Card component="section">
      <CardContent sx={CARD_PAD}>
        <Typography component="h2" variant="subtitle1" sx={TITLE_S}>
          {MEMORIES.reflectionHeading}
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
          {MEMORIES.reflectionBody}
        </Typography>

        {state.status === "saved" && (
          <Box sx={{ mt: 1 }}>
            <Alert tone="success" role="status">
              {MEMORIES.reflectionSaved}
            </Alert>
          </Box>
        )}
        {state.status === "error" && (
          <Box sx={{ mt: 1 }}>
            <Alert tone="error">{state.message}</Alert>
          </Box>
        )}

        {!open ? (
          <Box sx={{ mt: 1.5 }}>
            <Button variant="tonal" fullWidth onClick={() => setOpen(true)}>
              {reflection?.body ? MEMORIES.reflectionEditCta : MEMORIES.reflectionCta}
            </Button>
          </Box>
        ) : (
          <Box component="form" action={action} onSubmit={() => setTyped(null)} sx={{ mt: 1.5 }}>
            {reflection?.id && <input type="hidden" name="testimonialId" value={reflection.id} />}
            {/* A plain native textarea inside MUI's outline (the components/ui/Textarea
                shape, without its visible label — the heading names this box through
                aria-label, as before). `inputComponent="textarea"` keeps the fixed `rows`
                rather than an autosizing field. */}
            <OutlinedInput
              name="body"
              multiline
              inputComponent="textarea"
              rows={5}
              fullWidth
              size="small"
              value={draft}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={MEMORIES.reflectionPlaceholder}
              inputProps={{ "aria-label": MEMORIES.reflectionHeading, type: undefined }}
              sx={{ "& textarea": { resize: "vertical" } }}
            />
            <Box sx={{ mt: 1.25, display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 1 }}>
              <MuiButton
                type="submit"
                name="intent"
                value="save"
                disabled={pending || empty}
                variant="outlined"
                sx={{ ...BTN, flex: 1 }}
              >
                {MEMORIES.reflectionSave}
              </MuiButton>
              <MuiButton
                type="submit"
                name="intent"
                value="submit"
                disabled={pending || empty}
                variant="contained"
                sx={{ ...BTN, flex: 1 }}
              >
                <Icon name="send" size={13} /> {MEMORIES.reflectionSubmit}
              </MuiButton>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
