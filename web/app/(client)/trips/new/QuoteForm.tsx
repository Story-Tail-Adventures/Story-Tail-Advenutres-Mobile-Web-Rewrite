"use client";

import { useActionState } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import OutlinedInput from "@mui/material/OutlinedInput";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { QUOTE } from "./content";
import { sendQuoteRequest, type QuoteRequestTarget, type QuoteState } from "./actions";

/** The legacy .btn and .btn-text boxes on MUI's Button, so nothing reflows. */
const BTN = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;
const BTN_TEXT = { minHeight: 40, px: "12px", gap: 1, whiteSpace: "nowrap" } as const;

/**
 * The note field and the send button (Screen 2.3.8), plus 2.3.9's confirmation rendered in
 * place rather than as a route — the traveler has not gone anywhere, and a redirect would
 * lose the "what happens next" line at exactly the moment they want it.
 *
 * `target` is bound server-side via `.bind`, so the form posts only the note. The identity
 * of what is being quoted never round-trips through a hidden input where a client could
 * change it after the page was rendered.
 *
 * ON MUI (step 2 of the migration). The note is MUI's form primitives wired by hand rather
 * than the TextareaField primitive, because its label carries two strings — the question and
 * the "Optional" tag — and the primitive's `label` is one string. The textarea itself is the
 * same plain native control the primitive renders (`inputComponent="textarea"`, fixed rows),
 * so the server action receives the same FormData it always did. A failed send is the
 * approved MUI Alert tint; the confirmation is a centred Card.
 */
export function QuoteForm({ target, initialNote }: { target: QuoteRequestTarget; initialNote?: string }) {
  const action = sendQuoteRequest.bind(null, target);
  // `initialNote` is only the textarea's starting text (a topic page's Vibe cell), so it
  // rides in as the draft — the same slot a failed send uses to keep what was typed.
  const [state, formAction, pending] = useActionState<QuoteState, FormData>(action, {
    status: "idle",
    draft: initialNote,
  });

  if (state.status === "sent") {
    return (
      <Card component="section" aria-live="polite" sx={{ textAlign: "center" }}>
        <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
          <Box sx={{ display: "flex", justifyContent: "center", color: "success.main" }}>
            <Icon name="check" size={28} strokeWidth={2.5} />
          </Box>
          <Typography component="h2" variant="h5" sx={{ mt: 1, color: "text.primary" }}>
            {QUOTE.sent.title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mx: "auto", mt: 0.75, maxWidth: 440, color: "text.secondary" }}>
            {QUOTE.sent.body}
          </Typography>
          <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 1 }}>
            <MuiButton
              component={NextLink}
              href={state.tripId ? `/trips/${state.tripId}` : "/trips"}
              variant="contained"
              sx={BTN}
            >
              {QUOTE.sent.viewTrip}
            </MuiButton>
            <MuiButton component={NextLink} href="/explore" variant="text" sx={BTN_TEXT}>
              {QUOTE.sent.keepLooking}
            </MuiButton>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={formAction}>
      <FormControl fullWidth>
        <FormLabel
          htmlFor="quote-note"
          sx={{ display: "block", mb: 0.75, typography: "subtitle1", fontWeight: 600, lineHeight: 1.3, color: "text.primary" }}
        >
          {QUOTE.notes.label}{" "}
          <Typography component="span" variant="caption" sx={{ fontWeight: 400, lineHeight: 1.3, color: "text.secondary" }}>
            {QUOTE.notes.optional}
          </Typography>
        </FormLabel>
        <OutlinedInput
          id="quote-note"
          name="note"
          multiline
          inputComponent="textarea"
          rows={4}
          defaultValue={state.draft}
          placeholder={QUOTE.notes.placeholder}
          size="small"
          // The legacy textarea was at least 112px tall and could be dragged taller; MUI's
          // multiline sets resize: none and sizes by `rows`, so both are restored here.
          sx={{ minHeight: 112, alignItems: "flex-start", "& textarea": { resize: "vertical" } }}
          inputProps={{
            maxLength: 2000,
            // InputBase passes its `type` ("text") to the element; a textarea has none.
            type: undefined,
          }}
        />
      </FormControl>

      {state.status === "error" && state.message && (
        <Box sx={{ mt: 1 }}>
          <Alert tone="error">{state.message}</Alert>
        </Box>
      )}

      <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Button type="submit" variant="filled" disabled={pending}>
          {pending ? QUOTE.submitting : QUOTE.submit}
        </Button>
        <MuiButton component={NextLink} href="/explore" variant="text" sx={BTN_TEXT}>
          {QUOTE.cancel}
        </MuiButton>
      </Box>
    </form>
  );
}
