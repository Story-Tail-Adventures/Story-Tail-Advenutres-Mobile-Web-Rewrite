"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { TextareaField } from "@/components/ui/Textarea";
import { TAP_TARGET, VISUALLY_HIDDEN } from "@/lib/mui/sx";
import { sendMessageAction } from "./actions";
import { MESSAGE_MAX, MESSAGE_TEXT, initialMessageState } from "./state";

/**
 * Screen 2.0.12 Message Gyasi: the interactive half of the card. A client island only because
 * `useActionState` needs one; every string lives in ./state.ts and every rule in `lead-message`.
 */
export interface MessageFormProps {
  /** Allowlisted by the page: where the visitor came from. */
  from: string;
  /** Catalog slug the page already resolved, or "". */
  trip: string;
  /** Topic the page already resolved, or "". */
  topic: string;
  utm: { source: string; medium: string; campaign: string };
  /** Epoch ms when the page was drawn: sends faster than a person could type are dropped. */
  startedAt: number;
  exploreHref: string;
  joinHref: string;
}

const TAP_LINK = { display: "inline-flex", alignItems: "center", ...TAP_TARGET } as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="filled" size="lg" fullWidth disabled={pending}>
      {pending ? (
        <>
          <Spinner size={20} />
          {MESSAGE_TEXT.pending}
        </>
      ) : (
        MESSAGE_TEXT.submit
      )}
    </Button>
  );
}

function SentPanel({ exploreHref }: { exploreHref: string }) {
  return (
    <Box role="status" sx={{ display: "flex", flexDirection: "column" }}>
      <Typography component="h2" variant="h5">
        {MESSAGE_TEXT.sentTitle}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.75, color: "text.secondary" }}>
        {MESSAGE_TEXT.sentBody}
      </Typography>
      <MuiLink
        component={NextLink}
        href={exploreHref}
        underline="hover"
        variant="subtitle2"
        sx={{ ...TAP_LINK, mt: 1.75, alignSelf: "flex-start" }}
      >
        {MESSAGE_TEXT.keepExploring}
      </MuiLink>
    </Box>
  );
}

export function MessageForm({ from, trip, topic, utm, startedAt, exploreHref, joinHref }: MessageFormProps) {
  const [state, formAction, isPending] = useActionState(sendMessageAction, initialMessageState);

  if (state.outcome === "sent") return <SentPanel exploreHref={exploreHref} />;

  return (
    <Box component="form" action={formAction} sx={{ display: "flex", flexDirection: "column" }}>
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="trip" value={trip} />
      <input type="hidden" name="topic" value={topic} />
      <input type="hidden" name="utm_source" value={utm.source} />
      <input type="hidden" name="utm_medium" value={utm.medium} />
      <input type="hidden" name="utm_campaign" value={utm.campaign} />
      <input type="hidden" name="startedAt" value={String(startedAt)} />

      {/* The hidden field only a bot fills (Data-Model §11.3). Off-screen rather than
          display:none, which some bots skip; out of the tab order and the accessibility tree. */}
      <Box aria-hidden="true" sx={VISUALLY_HIDDEN}>
        <label htmlFor="website">{MESSAGE_TEXT.honeypot}</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </Box>

      {state.formError && (
        <Box sx={{ mb: 1.5 }}>
          <Alert tone="error">{state.formError}</Alert>
        </Box>
      )}

      <Box
        component="fieldset"
        disabled={isPending}
        sx={{ display: "contents", m: 0, p: 0, border: 0, minWidth: 0 }}
      >
        <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 1.25 }}>
          <Field
            id="firstName"
            name="firstName"
            label={MESSAGE_TEXT.firstName}
            autoComplete="given-name"
            required
            maxLength={80}
            defaultValue={state.firstName}
          />
          <Field
            id="lastName"
            name="lastName"
            label={MESSAGE_TEXT.lastName}
            autoComplete="family-name"
            maxLength={80}
            defaultValue={state.lastName}
          />
        </Box>

        <Box sx={{ mt: 1 }}>
          <Field
            id="email"
            name="email"
            label={MESSAGE_TEXT.email}
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            defaultValue={state.email}
          />
        </Box>

        <Box sx={{ mt: 1 }}>
          <Field
            id="phone"
            name="phone"
            label={MESSAGE_TEXT.phone}
            type="tel"
            autoComplete="tel"
            maxLength={40}
            defaultValue={state.phone}
          />
        </Box>

        <Box sx={{ mt: 1 }}>
          <TextareaField
            id="message"
            name="message"
            label={MESSAGE_TEXT.message}
            hint={MESSAGE_TEXT.messageHint}
            required
            rows={5}
            maxLength={MESSAGE_MAX}
            defaultValue={state.message}
          />
        </Box>
      </Box>

      <Typography variant="body2" sx={{ mt: 1.5, color: "text.secondary" }}>
        {MESSAGE_TEXT.privacyBefore}
        <MuiLink component={NextLink} href="/legal/privacy">
          {MESSAGE_TEXT.privacyLink}
        </MuiLink>
      </Typography>

      <Box sx={{ mt: 1.75 }}>
        <SubmitButton />
      </Box>

      <Box sx={{ mt: 1.5, typography: { xs: "caption", md: "subtitle2" } }}>
        <MuiLink
          component={NextLink}
          href={joinHref}
          underline="hover"
          color="text.secondary"
          sx={{ ...TAP_LINK, fontWeight: 500 }}
        >
          {MESSAGE_TEXT.quoteInstead}
        </MuiLink>
      </Box>
    </Box>
  );
}
