"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";

import { saveAsTemplateAction } from "@/app/(agent)/agent/templates/actions";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { TEMPLATE_COPY } from "@/lib/agent/content";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * §3.4.13's "create from existing trip", reached from the trip that is being saved.
 *
 * TWO DOORS, ONE DIALOG. The builder's rail is where an advisor is looking at the bookings
 * they just assembled, and the trip detail header is where `duplicateTripDeferred` has been
 * pointing since §3.4.4 repointed it here. Both open this.
 *
 * WHAT IT REPLACES ON THE TRIP DETAIL. "Duplicate" was disabled with the reason
 * *"Duplicating a trip arrives with §3.4.13, alongside the template library it shares the
 * mechanism with."* That deferral is now honoured rather than deleted: duplicating IS save
 * a pattern, then New trip → start from a template. Two steps, each of which is a real
 * screen, rather than a third verb that would need its own client picker and date logic.
 *
 * THE BODY SAYS WHAT DOES NOT COME ACROSS, which matters more than what does. An advisor
 * who assumes a confirmation number came with the pattern will read one to a client.
 *
 * ON MUI (step 2 of the migration, "MUI everywhere"): the native `<dialog>` is an MUI
 * Dialog driven by React state; the Modal brings the focus trap, Escape, the backdrop and
 * focus back to the trigger on close. The trigger is an outlined small MUI Button; `className`
 * still reaches it for the two callers, and `fullWidth` is how the rail stretches it.
 */

/** The legacy .btn-sm box (32px, 16px sides, 8px gap) on MUI's Button, so nothing reflows. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

/** The legacy dialog box: 520px, or the viewport less a 16px gutter on a phone. */
const DIALOG_PAPER_SX = { m: 2, width: "min(520px, calc(100vw - 2rem))", maxWidth: "none" } as const;

export function SaveAsTemplateDialog({
  tripId,
  tripTitle,
  suggestedName,
  label,
  className,
  fullWidth = false,
}: {
  tripId: string;
  tripTitle: string;
  /** The trip's own title, so the commonest case is one keystroke: confirm. */
  suggestedName?: string;
  label: string;
  className?: string;
  /** Stretch the trigger to its container — the builder's rail. */
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const [name, setName] = useState(suggestedName ?? tripTitle);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function show() {
    setError(null);
    setReceipt(null);
    setName(suggestedName ?? tripTitle);
    setDescription("");
    setOpen(true);
  }

  const close = () => setOpen(false);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveAsTemplateAction({
        tripId,
        name: name.trim(),
        description,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // THE RECEIPT STAYS ON SCREEN rather than the dialog closing on success. It says how
      // many bookings and days were captured, and that count is the only way an advisor
      // can tell a pattern saved from a trip with no day-by-day from one that lost it.
      setReceipt(result.message ?? null);
      router.refresh();
    });
  }

  return (
    <>
      <MuiButton
        type="button"
        variant="outlined"
        size="small"
        fullWidth={fullWidth}
        className={className}
        sx={BTN_SM}
        onClick={show}
      >
        {label}
        <Box component="span" sx={VISUALLY_HIDDEN}> — {tripTitle}</Box>
      </MuiButton>

      <Dialog
        open={open}
        // Like the native <dialog> this replaced: Escape closes, a stray backdrop click does
        // not (it would throw away what was typed), and nothing closes mid-write.
        onClose={(_event, reason) => {
          if (reason !== "backdropClick" && !pending) close();
        }}
        maxWidth={false}
        aria-labelledby={titleId}
        slotProps={{ paper: { sx: DIALOG_PAPER_SX } }}
      >
        <DialogContent sx={{ p: 2.5 }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
            <Avatar
              sx={{
                width: 40,
                height: 40,
                flexShrink: 0,
                bgcolor: "secondary.container",
                color: "secondary.onContainer",
              }}
            >
              {/* `star`, not `bookmark` — icon-paths.ts has no bookmark glyph, and adding one for a
                  dialog header is a design-system change for no gain. */}
              <Icon name="star" size={18} />
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                component="span"
                variant="overline"
                sx={{ display: "block", lineHeight: 1.3, color: "text.secondary" }}
              >
                {TEMPLATE_COPY.saveEyebrow}
              </Typography>
              <Typography
                id={titleId}
                component="h2"
                variant="h5"
                sx={{ m: 0, overflowWrap: "break-word" }}
              >
                {TEMPLATE_COPY.saveTitle}
              </Typography>
            </Box>
          </Box>

          <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
            {TEMPLATE_COPY.saveBody}
          </Typography>
          <Typography
            component="p"
            variant="caption"
            sx={{ display: "block", mt: 0.75, color: "text.secondary" }}
          >
            {TEMPLATE_COPY.saveExcludes}
          </Typography>

          {receipt ? (
            <Typography component="p" variant="body2" role="status" sx={{ mt: 1.5 }}>
              {receipt}
            </Typography>
          ) : (
            <>
              <Box sx={{ mt: 1.5 }}>
                <Field
                  id="template-name"
                  label={TEMPLATE_COPY.saveNameLabel}
                  placeholder={TEMPLATE_COPY.saveNamePlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={pending}
                  required
                />
              </Box>
              <Box sx={{ mt: 1.5 }}>
                <Field
                  id="template-description"
                  label={TEMPLATE_COPY.saveDescriptionLabel}
                  placeholder={TEMPLATE_COPY.saveDescriptionPlaceholder}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={pending}
                />
              </Box>

              {/* A courtesy, not the enforcement: the Edge Function and the RPC both refuse a
                  blank name, and one rule in three places is one rule that drifts. */}
              {name.trim() === "" && (
                <Typography
                  component="p"
                  variant="caption"
                  sx={{ display: "block", mt: 1, color: "text.secondary" }}
                >
                  {TEMPLATE_COPY.saveNameRequired}
                </Typography>
              )}

              {error && (
                <Box sx={{ mt: 1 }}>
                  <Alert tone="error">{error}</Alert>
                </Box>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions
          sx={{ px: 2.5, pb: 2.5, pt: 0, justifyContent: receipt ? "flex-end" : "space-between" }}
        >
          {receipt ? (
            <MuiButton
              type="button"
              variant="outlined"
              color="secondary"
              size="small"
              sx={BTN_SM}
              onClick={close}
            >
              {TEMPLATE_COPY.done}
            </MuiButton>
          ) : (
            <>
              <MuiButton
                type="button"
                variant="outlined"
                size="small"
                sx={BTN_SM}
                disabled={pending}
                onClick={close}
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
                onClick={submit}
              >
                {pending ? TEMPLATE_COPY.saving : TEMPLATE_COPY.saveConfirm}
              </MuiButton>
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
