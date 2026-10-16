"use client";

import { useActionState, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { setPayLinkAction } from "@/app/(agent)/agent/trips/[tripId]/payments/actions";
import { TRIP_DETAIL } from "@/app/(client)/trips/[tripId]/content";
import { MilestoneSummary, type MilestoneSummaryProps } from "@/components/agent/MilestoneSummary";
import { Alert } from "@/components/ui/Alert";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PAYMENTS_COPY } from "@/lib/agent/content";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";
import type { PayLinkState } from "@/lib/agent/payments";
import { payButtonLabel, paySiteName } from "@/lib/trips/payLink";

/** The A36 modal paper: 600px, or the viewport less a 16px gutter on a phone. */
const PAPER_SX = { m: 2, width: "min(600px, calc(100vw - 2rem))", maxWidth: "none" } as const;

/**
 * §3.6.1b Add or edit a pay link (artboard A361b_EditPayLink, ruled 2026-10-16). P1, web.
 *
 * URL AS STATE, like §3.4.15's `?edit=`: the page renders this open for `?link=<id>`, and
 * closing it goes back to the schedule. The preview under the field is what the client will
 * see, worked out from what is typed with the same helpers the client screen uses, so a
 * look-alike host shows its punycode here before it is saved.
 *
 * NOT DRAWN: the artboard's "Link from: supplier / Travefy" radio. Nothing would store the
 * choice (the milestone has one `pay_url` and no label column, by design, Data-Model §9.5),
 * so the "Travefy invoice" tag is read from the link's host instead.
 */
export function PayLinkDialog({
  tripId,
  milestoneId,
  label,
  currentUrl,
  closeHref,
  summary,
}: {
  tripId: string;
  milestoneId: string;
  label: string;
  currentUrl: string | null;
  closeHref: string;
  summary: MilestoneSummaryProps;
}) {
  const router = useRouter();
  const titleId = useId();
  const [state, formAction, pending] = useActionState<PayLinkState, FormData>(setPayLinkAction, {});
  const [value, setValue] = useState(state.value ?? currentUrl ?? "");
  const site = paySiteName(value.trim());

  return (
    <Dialog
      open
      onClose={(_event, reason) => {
        if (reason !== "backdropClick" && !pending) router.push(closeHref);
      }}
      maxWidth={false}
      aria-labelledby={titleId}
      slotProps={{ paper: { sx: PAPER_SX } }}
    >
      <DialogContent sx={{ p: 2.75 }}>
        <Box component="form" action={formAction}>
          <input type="hidden" name="tripId" value={tripId} />
          <input type="hidden" name="milestoneId" value={milestoneId} />

          <Typography id={titleId} component="h2" variant="h5" sx={{ m: 0 }}>
            {currentUrl ? PAYMENTS_COPY.linkTitleEdit : PAYMENTS_COPY.linkTitleAdd}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            {PAYMENTS_COPY.linkBody}
          </Typography>
          <MilestoneSummary {...summary} />

          <Box sx={{ mt: 1.75, "& input": { fontFamily: "mono" } }}>
            <Field
              id="pay-url"
              name="payUrl"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              label={PAYMENTS_COPY.linkLabel}
              placeholder="https://"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              hint={PAYMENTS_COPY.linkHint}
              error={state.error}
              maxLength={2100}
            />
          </Box>

          {site && (
            <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5 }}>
              <Typography component="p" variant="overline" sx={{ display: "block", lineHeight: 1.3, color: "text.secondary" }}>
                {PAYMENTS_COPY.linkPreview}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 1, flexWrap: "wrap" }}>
                {/* A picture of the button, not a working one: the advisor checks the link by
                    reading its site name, and nothing here should send them off the page. */}
                <Box
                  aria-hidden="true"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.75,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 999,
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    typography: "button",
                    textTransform: "none",
                  }}
                >
                  {payButtonLabel(label)} <Icon name="external" size={12} />
                </Box>
                <Box>
                  <Typography component="p" variant="body2" sx={{ fontWeight: 600 }}>
                    {site}
                  </Typography>
                  <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
                    {TRIP_DETAIL.payDirect}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          )}

          <Box sx={{ mt: 1.25 }}>
            <Alert tone="info">{PAYMENTS_COPY.linkAudit}</Alert>
          </Box>
          <Typography component="p" variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
            {PAYMENTS_COPY.linkTravefyGuard}
          </Typography>

          <Box sx={{ mt: 1.75, display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
            {/* Enter in the URL field submits the form's FIRST submit button. Without this,
                that is Remove, and fixing a typo then pressing Enter would delete the link. */}
            <Box
              component="button"
              type="submit"
              name="intent"
              value="save"
              tabIndex={-1}
              aria-hidden="true"
              disabled={pending}
              sx={VISUALLY_HIDDEN}
            />
            {currentUrl && (
              <MuiButton
                type="submit"
                name="intent"
                value="remove"
                variant="text"
                color="error"
                disabled={pending}
                startIcon={<Icon name="trash" size={12} />}
              >
                {PAYMENTS_COPY.linkRemove}
              </MuiButton>
            )}
            <MuiButton
              type="button"
              variant="text"
              disabled={pending}
              onClick={() => router.push(closeHref)}
              sx={{ ml: "auto" }}
            >
              {PAYMENTS_COPY.cancel}
            </MuiButton>
            <MuiButton type="submit" name="intent" value="save" variant="contained" disabled={pending}>
              {pending ? PAYMENTS_COPY.linkSaving : PAYMENTS_COPY.linkSave}
            </MuiButton>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
