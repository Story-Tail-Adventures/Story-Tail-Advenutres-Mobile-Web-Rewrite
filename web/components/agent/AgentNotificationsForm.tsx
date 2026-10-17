"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import { saveNotificationsAction } from "@/app/(agent)/agent/settings/actions";
import { useUnsavedGuard } from "@/components/agent/useUnsavedGuard";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SETTINGS_COPY } from "@/lib/agent/settingsCopy";
import type { NotificationsView } from "@/lib/agent/settingsView";

const C = SETTINGS_COPY.notifications;

type Key = keyof NotificationsView;

const ROWS: ReadonlyArray<{ label: string; hint: string; email: Key; push: Key }> = [
  { label: C.clientMessages, hint: C.clientMessagesHint, email: "clientMessagesEmail", push: "clientMessagesPush" },
  { label: C.quoteRequests, hint: C.quoteRequestsHint, email: "quoteRequestsEmail", push: "quoteRequestsPush" },
];

function same(a: NotificationsView, b: NotificationsView): boolean {
  return (Object.keys(a) as Key[]).every((k) => a[k] === b[k]);
}

/**
 * Screen 3.12.3 (A3123): the alert matrix. Two columns, Email and Push (no SMS: there is no
 * provider), and only rows that really fire (Q5): client messages and new trip requests. Rest
 * hours are not a second setting here; they are the working hours on Availability (Q6).
 */
export function AgentNotificationsForm({ notifications }: { notifications: NotificationsView }) {
  const [saved, setSaved] = useState<NotificationsView>(notifications);
  const [draft, setDraft] = useState<NotificationsView>(notifications);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();

  const changed = !same(draft, saved);
  useUnsavedGuard(changed, SETTINGS_COPY.leaveUnsaved);

  function flip(key: Key, on: boolean) {
    setDraft((d) => ({ ...d, [key]: on }));
    setStatus("");
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    if (!changed) {
      setStatus(SETTINGS_COPY.nothingChanged);
      return;
    }
    const sent = draft;
    startTransition(async () => {
      let result;
      try {
        result = await saveNotificationsAction(sent);
      } catch {
        result = { ok: false as const, message: SETTINGS_COPY.saveFailed };
      }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(sent);
      setStatus(SETTINGS_COPY.saved);
    });
  }

  return (
    <Box component="form" onSubmit={save} noValidate aria-labelledby="notifications-title">
      <Box
        component="header"
        sx={{ mt: 2.5, mb: 1.75, display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 1.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography id="notifications-title" component="h2" variant="h5" sx={{ fontWeight: 700 }}>
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

      <TableContainer component={Card} sx={{ maxWidth: 720 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{C.trigger}</TableCell>
              <TableCell align="center">{C.email}</TableCell>
              <TableCell align="center">{C.push}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ROWS.map((r) => (
              <TableRow key={r.label} hover>
                <TableCell sx={{ py: 1 }}>
                  <Typography component="span" variant="body2" sx={{ fontWeight: 500, display: "block" }}>
                    {r.label}
                  </Typography>
                  <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
                    {r.hint}
                  </Typography>
                </TableCell>
                {([[r.email, C.email], [r.push, C.push]] as const).map(([key, channel]) => (
                  <TableCell key={key} align="center" sx={{ py: 1 }}>
                    <Switch
                      checked={draft[key]}
                      onChange={(e) => flip(key, e.target.checked)}
                      slotProps={{ input: { "aria-label": C.switchLabel(r.label, channel) } }}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={3} sx={{ py: 1.25 }}>
                <Typography component="span" variant="body2" sx={{ fontWeight: 500, display: "block" }}>
                  {C.restTitle}
                </Typography>
                <Typography component="span" variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                  {C.restBody}
                </Typography>
                <MuiLink component={NextLink} href="/agent/settings?tab=availability" variant="caption">
                  {C.restLink}
                </MuiLink>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Stack spacing={0.5} sx={{ mt: 1.5, maxWidth: 720 }}>
        <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
          {C.emailNote}
        </Typography>
        <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
          {C.pushNote}
        </Typography>
      </Stack>
    </Box>
  );
}
