"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";

import {
  archiveTemplateAction,
  renameTemplateAction,
} from "@/app/(agent)/agent/templates/actions";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { AGENT_COPY, TEMPLATE_COPY } from "@/lib/agent/content";
import type { TemplateCard } from "@/lib/agent/templates";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * §3.4.13's grid.
 *
 * WHAT THE PROTOTYPE DRAWS THAT IS NOT HERE. Each of its cards carries a 110px photograph
 * from `staImg(...)`, and `trip_template` has no image column — nor should it: a pattern is
 * a set of bookings, and the picture on the prototype's card is of the resort, which lives
 * on the supplier. Dropping it rather than inventing a column is the same call §3.4.2 made
 * about the invented "surprise flag".
 *
 * Its "Use" button is also NOT here. Applying a pattern needs a TRIP to apply it to, and
 * this screen has none — the two real entry points are §3.4.3's "start from a template",
 * where the trip is about to exist, and the builder, where it already does. A button that
 * cannot know its own object is the control §6.4's amendment argues against.
 *
 * What is here instead is rename and retire, which are this screen's own verbs.
 *
 * ON MUI (step 2 of the migration, "MUI everywhere"): the two native `<dialog>`s are MUI
 * Dialogs driven by React state. The Modal brings the focus trap, Escape, the backdrop and
 * focus back to the button that opened it. Each dialog's accessible name is the one the
 * old `aria-label` carried — "Rename <name>" / "Archive <name>", so a reader on a grid of
 * six knows which — supplied through `aria-labelledby` pointing at a visually hidden span,
 * because Dialog always generates an `aria-labelledby` for its paper and that attribute
 * wins over any `aria-label`.
 */

/** The legacy .btn-sm box (32px, 16px sides, 8px gap) on MUI's Button, so nothing reflows. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

/** The legacy dialog box: 480px, or the viewport less a 16px gutter on a phone. */
const DIALOG_PAPER_SX = { m: 2, width: "min(480px, calc(100vw - 2rem))", maxWidth: "none" } as const;

const DIALOG_ACTIONS_SX = { px: 2.5, pb: 2.5, pt: 0, justifyContent: "space-between" } as const;

export function TemplateGrid({ rows }: { rows: TemplateCard[] }) {
  return (
    <Box
      sx={{
        mt: 2,
        display: "grid",
        gap: 1.5,
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          sm: "repeat(2, minmax(0, 1fr))",
          xl: "repeat(3, minmax(0, 1fr))",
        },
      }}
    >
      {rows.map((row) => (
        <TemplateTile key={row.templateId} row={row} />
      ))}
    </Box>
  );
}

function TemplateTile({ row }: { row: TemplateCard }) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const renameLabelId = useId();
  const archiveLabelId = useId();
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, close: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.message ?? AGENT_COPY.cancelFailed);
        return;
      }
      close();
      router.refresh();
    });
  }

  const closeRename = () => setRenameOpen(false);
  const closeArchive = () => setArchiveOpen(false);

  return (
    <Card component="article" sx={{ display: "flex", flexDirection: "column" }}>
      <CardContent
        sx={{ p: 2, display: "flex", flexDirection: "column", flex: 1, "&:last-child": { pb: 2 } }}
      >
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              component="h2"
              variant="subtitle1"
              sx={{ m: 0, fontWeight: 600, overflowWrap: "break-word" }}
            >
              {row.name}
            </Typography>
            <Typography
              component="p"
              variant="caption"
              sx={{ display: "block", mt: 0.25, color: "text.secondary" }}
            >
              {row.tripTypeLabel} · {row.shapeLabel}
            </Typography>
          </Box>
          {row.valueLabel && (
            <Chip
              size="small"
              variant="outlined"
              label={row.valueLabel}
              sx={{ flexShrink: 0, height: 22, fontFamily: "mono", fontSize: 11 }}
            />
          )}
        </Box>

        {row.description && (
          <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
            {row.description}
          </Typography>
        )}

        <Box sx={{ mt: "auto", pt: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
          {/* Only when something has used it. A "0× used" chip on every new template is a
              number that means nothing, and it is derived from trip.template_id rather than
              counted, so it cannot drift from the trips. */}
          {row.usageLabel && (
            <Chip size="small" variant="outlined" label={row.usageLabel} sx={{ height: 22, fontSize: 11 }} />
          )}
          <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1 }}>
            <MuiButton
              type="button"
              variant="text"
              size="small"
              sx={BTN_SM}
              onClick={() => {
                setError(null);
                setName(row.name);
                setDescription(row.description ?? "");
                setRenameOpen(true);
              }}
            >
              {TEMPLATE_COPY.renameLabel}
              <Box component="span" sx={VISUALLY_HIDDEN}> {row.name}</Box>
            </MuiButton>
            <MuiButton
              type="button"
              variant="outlined"
              size="small"
              sx={BTN_SM}
              onClick={() => {
                setError(null);
                setArchiveOpen(true);
              }}
            >
              {TEMPLATE_COPY.archiveLabel}
              <Box component="span" sx={VISUALLY_HIDDEN}> {row.name}</Box>
            </MuiButton>
          </Box>
        </Box>
      </CardContent>

      <Dialog
        open={renameOpen}
        // Like the native <dialog> this replaced: Escape closes, a stray backdrop click does
        // not (it would throw away what was typed), and nothing closes mid-write.
        onClose={(_event, reason) => {
          if (reason !== "backdropClick" && !pending) closeRename();
        }}
        maxWidth={false}
        aria-labelledby={renameLabelId}
        slotProps={{ paper: { sx: DIALOG_PAPER_SX } }}
      >
        <DialogContent sx={{ p: 2.5 }}>
          <Box component="span" id={renameLabelId} sx={VISUALLY_HIDDEN}>
            {TEMPLATE_COPY.renameLabel} {row.name}
          </Box>
          <Typography component="h2" variant="h5" sx={{ m: 0 }}>
            {TEMPLATE_COPY.renameLabel}
          </Typography>
          {/* Said here, where somebody is looking at an edit form and might reasonably expect
              the bookings to be editable too. They are not, and the reason is in the RPC. */}
          <Typography
            component="p"
            variant="caption"
            sx={{ display: "block", mt: 0.5, color: "text.secondary" }}
          >
            {TEMPLATE_COPY.payloadFixedNote}
          </Typography>

          <Box sx={{ mt: 1.5 }}>
            <Field
              id={`name-${row.templateId}`}
              label={TEMPLATE_COPY.saveNameLabel}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
            />
          </Box>
          <Box sx={{ mt: 1.5 }}>
            <Field
              id={`desc-${row.templateId}`}
              label={TEMPLATE_COPY.saveDescriptionLabel}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={pending}
            />
          </Box>

          {error && (
            <Box sx={{ mt: 1 }}>
              <Alert tone="error">{error}</Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={DIALOG_ACTIONS_SX}>
          <MuiButton
            type="button"
            variant="outlined"
            size="small"
            sx={BTN_SM}
            disabled={pending}
            onClick={closeRename}
          >
            {TEMPLATE_COPY.cancel}
          </MuiButton>
          <MuiButton
            type="button"
            variant="outlined"
            color="secondary"
            size="small"
            sx={BTN_SM}
            disabled={pending || name.trim() === ""}
            onClick={() =>
              run(
                () =>
                  renameTemplateAction({
                    templateId: row.templateId,
                    name: name.trim(),
                    description,
                  }),
                closeRename,
              )
            }
          >
            {pending ? AGENT_COPY.cancelSaving : TEMPLATE_COPY.saveConfirm}
          </MuiButton>
        </DialogActions>
      </Dialog>

      <Dialog
        open={archiveOpen}
        // Like the native <dialog> this replaced: Escape closes, a stray backdrop click does
        // not (it would throw away what was typed), and nothing closes mid-write.
        onClose={(_event, reason) => {
          if (reason !== "backdropClick" && !pending) closeArchive();
        }}
        maxWidth={false}
        aria-labelledby={archiveLabelId}
        slotProps={{ paper: { sx: DIALOG_PAPER_SX } }}
      >
        <DialogContent sx={{ p: 2.5 }}>
          <Box component="span" id={archiveLabelId} sx={VISUALLY_HIDDEN}>
            {TEMPLATE_COPY.archiveLabel} {row.name}
          </Box>
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
            <Avatar
              sx={{
                width: 40,
                height: 40,
                flexShrink: 0,
                bgcolor: "warning.container",
                color: "text.primary",
              }}
            >
              <Icon name="inbox" size={18} />
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                component="span"
                variant="overline"
                sx={{ display: "block", lineHeight: 1.3, color: "warning.main" }}
              >
                {TEMPLATE_COPY.archiveLabel.toUpperCase()}
              </Typography>
              <Typography component="h2" variant="h5" sx={{ m: 0, overflowWrap: "break-word" }}>
                {row.name}
              </Typography>
            </Box>
          </Box>
          {/* Not the danger button, and the body says why: this is reversible in every way
              that matters. Trips built from it keep their history and keep pointing at it,
              because a hard delete would fail outright on the foreign key. */}
          <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
            {TEMPLATE_COPY.archiveConfirmBody}
          </Typography>

          {error && (
            <Box sx={{ mt: 1 }}>
              <Alert tone="error">{error}</Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={DIALOG_ACTIONS_SX}>
          <MuiButton
            type="button"
            variant="outlined"
            size="small"
            sx={BTN_SM}
            disabled={pending}
            onClick={closeArchive}
          >
            {TEMPLATE_COPY.cancel}
          </MuiButton>
          <MuiButton
            type="button"
            variant="outlined"
            color="secondary"
            size="small"
            sx={BTN_SM}
            disabled={pending}
            onClick={() =>
              run(() => archiveTemplateAction({ templateId: row.templateId }), closeArchive)
            }
          >
            {pending ? AGENT_COPY.cancelSaving : TEMPLATE_COPY.archiveLabel}
          </MuiButton>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
