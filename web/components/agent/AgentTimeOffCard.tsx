"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { endTimeOffAction, saveTimeOffAction } from "@/app/(agent)/agent/settings/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { Field } from "@/components/ui/Field";
import { TextareaField } from "@/components/ui/Textarea";
import { Icon } from "@/components/ui/Icon";
import { SETTINGS_COPY } from "@/lib/agent/settingsCopy";
import {
  autoReplyProblem,
  dateRangeLabel,
  DEFAULT_AUTO_REPLY,
  MAX_AUTO_REPLY,
  MAX_TIME_OFF_LABEL,
  returnDateLabel,
  timeOffPhase,
  timeOffProblem,
} from "@/lib/agent/settingsRules";
import type { TimeOffView } from "@/lib/agent/settingsView";
import { uuidV7 } from "@/lib/uuid";

const C = SETTINGS_COPY.availability;

/** The A36 modal paper: 480px, or the viewport less a 16px gutter on a phone. */
const PAPER_SX = { m: 2, width: "min(480px, calc(100vw - 2rem))", maxWidth: "none" } as const;

type Editing = {
  id: string;
  isNew: boolean;
  startsOn: string;
  endsOn: string;
  label: string;
  autoReplyEnabled: boolean;
  autoReplyText: string;
};

/**
 * 3.12.2's out-of-office (Q14, Q22). Each block saves on its own through a dialog: upcoming
 * blocks can be edited or deleted, a running one can only be ended early ("I'm back"), and
 * past ones are not listed. Dates are whole days in the advisor's own zone; `today` comes
 * from the server in that zone, never from this browser's clock.
 */
export function AgentTimeOffCard({ timeOff, today }: { timeOff: TimeOffView[]; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing | null>(null);
  // Open is separate from what is being edited, so the dialog keeps its content while it
  // fades out instead of collapsing to an empty paper.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [pending, startTransition] = useTransition();
  const titleId = useId();
  const startId = useId();
  const endId = useId();
  const labelId = useId();
  const replyId = useId();

  function open(block?: TimeOffView) {
    setError("");
    setListError("");
    setEditing(
      block
        ? {
            id: block.id,
            isNew: false,
            startsOn: block.startsOn,
            endsOn: block.endsOn,
            label: block.label,
            autoReplyEnabled: block.autoReplyEnabled,
            // The default words wait in the box even while the reply is off, ready to turn on.
            autoReplyText: block.autoReplyText || DEFAULT_AUTO_REPLY,
          }
        : { id: uuidV7(), isNew: true, startsOn: "", endsOn: "", label: "", autoReplyEnabled: false, autoReplyText: DEFAULT_AUTO_REPLY },
    );
    setDialogOpen(true);
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || pending) return;
    // The reply's words are checked only while it is on: hidden words never block a save.
    const problem =
      timeOffProblem(editing.startsOn, editing.endsOn, today) ??
      (editing.autoReplyEnabled ? autoReplyProblem(true, editing.autoReplyText) : null);
    if (problem) {
      setError(problem);
      return;
    }
    const sent = { ...editing, label: editing.label.trim() };
    startTransition(async () => {
      let result;
      try {
        result = await saveTimeOffAction({
          timeOffId: sent.id,
          isNew: sent.isNew,
          startsOn: sent.startsOn,
          endsOn: sent.endsOn,
          label: sent.label,
          autoReplyEnabled: sent.autoReplyEnabled,
          // Kept while off (so turning it back on brings them back), unless they would be refused.
          autoReplyText:
            sent.autoReplyEnabled || autoReplyProblem(true, sent.autoReplyText) === null
              ? sent.autoReplyText.trim()
              : "",
        });
      } catch {
        result = { ok: false as const, message: SETTINGS_COPY.saveFailed };
      }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDialogOpen(false);
      router.refresh();
    });
  }

  function end(block: TimeOffView, running: boolean) {
    if (pending) return;
    if (!window.confirm(running ? C.confirmBack : C.confirmDelete)) return;
    setListError("");
    startTransition(async () => {
      let result;
      try {
        result = await endTimeOffAction({ timeOffId: block.id });
      } catch {
        result = { ok: false as const, message: SETTINGS_COPY.saveFailed };
      }
      if (!result.ok) {
        setListError(result.message);
        return;
      }
      router.refresh();
    });
  }

  const blocks = timeOff.filter((b) => timeOffPhase(b.startsOn, b.endsOn, today) !== "past");

  return (
    <Card component="section" aria-labelledby={titleId}>
      <CardContent sx={{ p: 2.25 }}>
        <Typography id={titleId} component="h3" variant="subtitle1">
          {C.awayTitle}
        </Typography>
        <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.5, color: "text.secondary" }}>
          {C.awaySub}
        </Typography>

        {listError ? (
          <Box sx={{ mt: 1.25 }}>
            <Alert tone="error">{listError}</Alert>
          </Box>
        ) : null}

        {blocks.length === 0 ? (
          <Typography component="p" variant="body2" sx={{ mt: 1.25, color: "text.secondary" }}>
            {C.awayEmpty}
          </Typography>
        ) : (
          <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0, mt: 1 }}>
            {blocks.map((b) => {
              const running = timeOffPhase(b.startsOn, b.endsOn, today) === "running";
              return (
                <Paper
                  component="li"
                  key={b.id}
                  elevation={0}
                  sx={{ p: 1.5, bgcolor: running ? "warning.container" : "surface.2", color: "text.primary" }}
                >
                  <Typography component="p" variant="subtitle1">
                    {dateRangeLabel(b.startsOn, b.endsOn, today)}
                  </Typography>
                  <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.25 }}>
                    {[running ? C.now : null, b.label || null, b.autoReplyEnabled ? C.autoReplyOn : null]
                      .filter(Boolean)
                      .join(" · ") || "\u00a0"}
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
                    {running ? (
                      <Button variant="tonal" size="sm" onClick={() => end(b, true)} disabled={pending}>
                        {C.back}
                      </Button>
                    ) : (
                      <>
                        <Button variant="tonal" size="sm" onClick={() => open(b)} disabled={pending}>
                          {C.edit}
                        </Button>
                        <Button variant="text" size="sm" onClick={() => end(b, false)} disabled={pending}>
                          {C.delete}
                        </Button>
                      </>
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}

        <Box sx={{ mt: 1.25 }}>
          <Button variant="tonal" size="sm" onClick={() => open()} disabled={pending}>
            <Icon name="plus" size={12} />
            {C.schedule}
          </Button>
        </Box>
      </CardContent>

      <Dialog
        open={dialogOpen}
        onClose={() => (pending ? undefined : setDialogOpen(false))}
        aria-labelledby={`${titleId}-dialog`}
        slotProps={{ paper: { sx: PAPER_SX }, transition: { onExited: () => setEditing(null) } }}
      >
        {editing ? (
          <DialogContent>
            <Box component="form" onSubmit={save} noValidate>
              <Typography id={`${titleId}-dialog`} component="h2" variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
                {editing.isNew ? C.dialogNew : C.dialogEdit}
              </Typography>
              <Stack spacing={1.5}>
                <DateField
                  id={startId}
                  name="startsOn"
                  label={C.firstDay}
                  min={today}
                  value={editing.startsOn}
                  onChange={(v) => setEditing((e) => (e ? { ...e, startsOn: v, endsOn: e.endsOn && e.endsOn < v ? v : e.endsOn } : e))}
                />
                <DateField
                  id={endId}
                  name="endsOn"
                  label={C.lastDay}
                  min={editing.startsOn || today}
                  value={editing.endsOn}
                  onChange={(v) => setEditing((e) => (e ? { ...e, endsOn: v } : e))}
                />
                <Field
                  id={labelId}
                  label={C.label}
                  hint={C.labelHint}
                  maxLength={MAX_TIME_OFF_LABEL}
                  value={editing.label}
                  onChange={(ev) => setEditing((e) => (e ? { ...e, label: ev.target.value } : e))}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={editing.autoReplyEnabled}
                      onChange={(ev) => setEditing((e) => (e ? { ...e, autoReplyEnabled: ev.target.checked } : e))}
                    />
                  }
                  label={C.autoReply}
                  sx={{ m: 0 }}
                />
                {editing.autoReplyEnabled ? (
                  <>
                    <TextareaField
                      id={replyId}
                      label={C.autoReplyText}
                      hint={C.autoReplyHint}
                      rows={4}
                      maxLength={MAX_AUTO_REPLY}
                      value={editing.autoReplyText}
                      onChange={(ev) => setEditing((e) => (e ? { ...e, autoReplyText: ev.target.value } : e))}
                    />
                    {editing.endsOn ? (
                      <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
                        {C.autoReplyPreview(
                          editing.autoReplyText.replace(/\{\{\s*return_date\s*\}\}/g, returnDateLabel(editing.endsOn)).trim(),
                        )}
                      </Typography>
                    ) : null}
                  </>
                ) : null}
                {error ? <Alert tone="error">{error}</Alert> : null}
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: "flex-end" }}>
                <Button variant="text" size="sm" onClick={() => setDialogOpen(false)} disabled={pending}>
                  {C.cancel}
                </Button>
                <Button variant="filled" size="sm" type="submit" disabled={pending}>
                  {C.saveAway}
                </Button>
              </Stack>
            </Box>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  );
}
