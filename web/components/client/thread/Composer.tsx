"use client";

import { useActionState, useRef, useState } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import OutlinedInput from "@mui/material/OutlinedInput";
import Stack from "@mui/material/Stack";

import { ICON_BTN_SX, MAX_W_3XL } from "@/components/client/client-sx";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { TAP_TARGET } from "@/lib/mui/sx";
import { QUICK_REPLIES, THREAD_MESSAGES, type SendMessageState } from "@/lib/trips/thread";

const IDLE: SendMessageState = { status: "idle" };

/** `px-4 md:px-6` — the bar's gutter. */
const GUTTER = { xs: 2, md: 3 } as const;

/**
 * The legacy `.btn.h-11.rounded-full.px-4` send button on MUI's contained Button: 44px,
 * 16px sides, and a 44px minimum width so the icon-only phone state stays square.
 */
const SEND_SX = {
  minHeight: 44,
  minWidth: 44,
  px: 2,
  gap: 1,
  flexShrink: 0,
  whiteSpace: "nowrap",
  ...TAP_TARGET,
} as const;

/**
 * The compose bar: quick-reply chips, a growing textarea, attach and send.
 *
 * SHARED BY 2.2.7 AND 2.6.2, which is why it takes the action as a prop instead of binding
 * one itself. It used to do `sendTripMessage.bind(null, tripId)` internally, and that is
 * exactly what made it a trip component; a thread with no trip cannot be addressed that way
 * at all. The caller binds its own key — a trip id for 2.2.7, a conversation id for 2.6.2 —
 * and hands the result down.
 *
 * A SERVER ACTION IS SERIALISABLE, so this crosses the server/client boundary safely. A plain
 * function would not: passing one from a server component to a client one typechecks, passes
 * unit tests (they render in-process, so the boundary is never crossed) and throws only in a
 * real browser. That trap is recorded in the plan's verification section; the action-as-prop
 * shape is the one §2.5 used for `ProfileForm` for the same reason.
 *
 * THE TEXTAREA IS CONTROLLED, which a plain server-action form would not need. It is
 * controlled because three other things write to it: a quick-reply chip fills it, a failed
 * send restores the draft, and a successful send clears it. Letting the form own the value
 * would mean the chips could not prefill and a network failure would silently eat what
 * somebody typed.
 *
 * ITS VALUE IS DERIVED RATHER THAN SYNCED, and that is worth explaining because the obvious
 * implementation is an effect that copies the action result into state — which
 * `react-hooks/set-state-in-effect` rejects, and rightly: it renders twice and can flicker
 * the old text back. Instead `typed` is null until somebody types, and the fallback comes
 * straight off the action state. Submitting sets it back to null, so the box clears
 * immediately while the request is in flight and then either stays empty (sent) or fills
 * with the draft the server handed back (error). No effect, one render, and a second
 * consecutive failure restores correctly because the reset happens on submit rather than on
 * a state comparison.
 *
 * ENTER SENDS, SHIFT+ENTER ADDS A LINE. That is the convention every messaging surface a
 * traveler already uses follows, and getting it backwards is the kind of thing that makes
 * people write one-line messages forever. The form still submits normally without
 * JavaScript, because it is a real form with a real action.
 *
 * ON MUI (step 2 of the migration): the textarea is MUI's multiline OutlinedInput, which
 * actually grows with the draft (one to five rows) where the legacy box only capped its
 * height; the chips are outlined MUI Chips that render as real buttons; the error is the MUI
 * Alert tint. The attach IconButton keeps its `title`, and a wrapping span carries the same
 * title so the reason still shows on hover — a disabled MUI button has `pointer-events: none`.
 */
export function Composer({
  action: send,
  attachTitle,
  placeholder = THREAD_MESSAGES.composePlaceholder,
}: {
  /** Already bound to its thread's key by the server component that renders this. */
  action: (previous: SendMessageState, formData: FormData) => Promise<SendMessageState>;
  /** Why the attach button is disabled — the one string that differs between the two screens. */
  attachTitle: string;
  placeholder?: string;
}) {
  const [state, action, pending] = useActionState(send, IDLE);
  const [typed, setTyped] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const draft = typed ?? (state.status === "error" ? state.draft : "");
  const empty = draft.trim().length === 0;

  return (
    <Box sx={{ borderTop: 1, borderColor: "divider", bgcolor: "surface.main" }}>
      {state.status === "error" && (
        <Box sx={{ px: GUTTER, pt: 1.25 }}>
          <Alert tone="error">{state.message}</Alert>
        </Box>
      )}

      <Box sx={{ mx: "auto", width: "100%", maxWidth: MAX_W_3XL, px: GUTTER, py: 1.25 }}>
        <Stack direction="row" spacing={0.75} sx={{ overflowX: "auto", pb: 1 }}>
          {/* The same four on both screens. They are parity-pinned copy rather than data, and
              offering a traveler a different set of words depending on which list they
              reached the thread from is the drift this extraction exists to prevent. */}
          {QUICK_REPLIES.map((reply) => (
            <Chip
              key={reply}
              component="button"
              type="button"
              clickable
              variant="outlined"
              size="small"
              label={reply}
              // Fills the box rather than sending, so nothing leaves for Gyasi that the
              // traveler has not seen sitting in their own compose bar first.
              onClick={() => {
                setTyped(reply);
                textarea.current?.focus();
              }}
              sx={{ height: 30, flexShrink: 0, ...TAP_TARGET }}
            />
          ))}
        </Stack>

        <Box
          component="form"
          action={action}
          // Hand the box back to the derived fallback, so it empties the moment the request
          // starts and the error path can refill it.
          onSubmit={() => setTyped(null)}
          sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}
        >
          <Box
            component="span"
            title={attachTitle}
            sx={{ display: "inline-flex", flexShrink: 0, cursor: "not-allowed" }}
          >
            <IconButton
              type="button"
              disabled
              aria-disabled="true"
              aria-label={THREAD_MESSAGES.attachLabel}
              title={attachTitle}
              sx={ICON_BTN_SX}
            >
              <Icon name="attach" size={18} />
            </IconButton>
          </Box>

          <OutlinedInput
            inputRef={textarea}
            name="body"
            multiline
            minRows={1}
            maxRows={5}
            size="small"
            value={draft}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!empty) event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={placeholder}
            inputProps={{ "aria-label": placeholder }}
            sx={{ flex: 1, minHeight: 44 }}
          />

          <MuiButton
            type="submit"
            variant="contained"
            disabled={pending || empty}
            aria-label={THREAD_MESSAGES.sendLabel}
            sx={SEND_SX}
          >
            {pending ? <Spinner /> : <Icon name="send" size={14} />}
            <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
              {THREAD_MESSAGES.sendLabel}
            </Box>
          </MuiButton>
        </Box>
      </Box>
    </Box>
  );
}
