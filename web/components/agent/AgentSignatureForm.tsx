"use client";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { saveSignatureAction } from "@/app/(agent)/agent/settings/actions";
import { useUnsavedGuard } from "@/components/agent/useUnsavedGuard";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/Textarea";
import { SETTINGS_COPY } from "@/lib/agent/settingsCopy";
import {
  DEFAULT_SIGNATURE,
  LOCKED_SIGNATURE_LINE,
  MAX_SIGNATURE,
  SIGNATURE_FIELDS,
  signatureLines,
  signatureProblem,
} from "@/lib/agent/settingsRules";
import type { ProfileView, SignatureView } from "@/lib/agent/settingsView";
import { insertAtCursor } from "@/lib/agent/templateMerge";

const C = SETTINGS_COPY.signature;

/**
 * Screen 3.12.4 (A3124): the signature, plain text with three merge fields (Q19), and beside it
 * the email as a client will see it. The Story-Tail line under it is not stored and cannot be
 * edited (Q18). Saving the default's exact text stores nothing, so a better default later still
 * reaches an advisor who never wrote their own.
 */
export function AgentSignatureForm({ signature, profile }: { signature: SignatureView; profile: ProfileView }) {
  const [saved, setSaved] = useState(signature.text);
  const [text, setText] = useState(signature.text);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const editorId = useId();
  const titleId = useId();
  const caret = useRef<number | null>(null);

  const changed = text !== saved;
  useUnsavedGuard(changed, SETTINGS_COPY.leaveUnsaved);

  const { displayName, phone, email } = profile;
  const lines = useMemo(() => signatureLines(text, { name: displayName, phone, email }), [text, displayName, phone, email]);
  const problem = signatureProblem(text);
  const firstName = profile.displayName.trim().split(/\s+/)[0] || "Your advisor";

  function insert(token: string) {
    const el = document.getElementById(editorId) as HTMLTextAreaElement | null;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? start;
    const next = insertAtCursor(text, token, start, end);
    setText(next.value);
    setStatus("");
    caret.current = next.caret;
    requestAnimationFrame(() => {
      const t = document.getElementById(editorId) as HTMLTextAreaElement | null;
      if (t && caret.current !== null) {
        t.focus();
        t.setSelectionRange(caret.current, caret.current);
      }
    });
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    // The field itself shows what is wrong; no second copy in the banner.
    if (problem) {
      document.getElementById(editorId)?.focus();
      return;
    }
    if (!changed) {
      setStatus(SETTINGS_COPY.nothingChanged);
      return;
    }
    const sent = text;
    startTransition(async () => {
      let result;
      try {
        result = await saveSignatureAction({ signature: sent });
      } catch {
        result = { ok: false as const, message: SETTINGS_COPY.saveFailed };
      }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // An emptied box means the default; show it as what is now in effect. Words typed while
      // the save was in flight are kept: only an untouched box is replaced.
      const now = sent.trim() === "" ? DEFAULT_SIGNATURE : sent;
      setSaved(now);
      setText((t) => (t === sent ? now : t));
      setStatus(SETTINGS_COPY.saved);
    });
  }

  return (
    <Box component="form" onSubmit={save} noValidate aria-labelledby={titleId}>
      <Box
        component="header"
        sx={{ mt: 2.5, mb: 1.75, display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 1.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography id={titleId} component="h2" variant="h5" sx={{ fontWeight: 700 }}>
            {C.title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            {C.sub}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <Typography component="p" variant="caption" role="status" sx={{ m: 0, color: "text.secondary" }}>
            {status || (changed ? SETTINGS_COPY.unsaved : "")}
          </Typography>
          <Button variant="filled" size="sm" type="submit" disabled={pending}>
            {C.save}
          </Button>
        </Stack>
      </Box>

      {error ? (
        <Box sx={{ mb: 1.75 }}>
          <Alert tone="error">{error}</Alert>
        </Box>
      ) : null}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" },
          gap: 1.75,
          maxWidth: 1080,
        }}
      >
        <Card>
          <CardContent sx={{ p: 2 }}>
            <TextareaField
              id={editorId}
              label={C.edit}
              hint={C.hint}
              rows={9}
              maxLength={MAX_SIGNATURE + 50}
              value={text}
              error={problem ?? undefined}
              onChange={(e) => {
                setText(e.target.value);
                setStatus("");
              }}
              style={{ fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", fontSize: 13 }}
            />
            <Stack direction="row" spacing={0.75} sx={{ mt: 1, alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
              <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
                {C.insert}
              </Typography>
              {SIGNATURE_FIELDS.map((f) => (
                <Chip
                  key={f.token}
                  label={f.label}
                  aria-label={`Insert ${f.label.toLowerCase()}`}
                  size="small"
                  variant="outlined"
                  onClick={() => insert(f.token)}
                />
              ))}
              <Box sx={{ flex: 1 }} />
              <Button
                variant="text"
                size="sm"
                onClick={() => {
                  setText(DEFAULT_SIGNATURE);
                  setStatus("");
                }}
                disabled={text === DEFAULT_SIGNATURE}
              >
                {C.reset}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Card component="aside" aria-label={C.preview}>
          <CardContent sx={{ p: 2 }}>
            <Typography component="p" variant="overline" sx={{ display: "block", lineHeight: 1.3, color: "text.secondary" }}>
              {C.preview}
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.75, mt: 1, bgcolor: "background.paper" }}>
              <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                {C.from(firstName)}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography component="p" variant="body2" sx={{ mb: 1.5 }}>
                {C.sampleBody}
              </Typography>
              <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                {lines.map((line, i) =>
                  line === LOCKED_SIGNATURE_LINE && i === lines.length - 1 ? (
                    <Typography
                      key={i}
                      component="p"
                      variant="caption"
                      title={C.locked}
                      sx={{ display: "block", color: "brand.main", fontWeight: 700, mt: 0.5 }}
                    >
                      {line}
                    </Typography>
                  ) : (
                    <Typography
                      key={i}
                      component="p"
                      variant={i === 0 ? "subtitle2" : "caption"}
                      sx={{ display: "block", color: i === 0 ? "text.primary" : "text.secondary", minHeight: "1em", overflowWrap: "anywhere" }}
                    >
                      {line}
                    </Typography>
                  ),
                )}
              </Box>
            </Paper>
            <Typography component="p" variant="caption" sx={{ mt: 1, color: "text.secondary" }}>
              {C.locked}
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
