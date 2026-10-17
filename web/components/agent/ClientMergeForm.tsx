"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import MuiLink from "@mui/material/Link";
import DialogContent from "@mui/material/DialogContent";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import { mergeClientsAction } from "@/app/(agent)/agent/clients/[clientId]/merge/actions";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { MERGE_COPY as C } from "@/lib/agent/content";
import { changedChoices, type MergeField, type MergeSide, type MergeView, mergedValues } from "@/lib/agent/mergeView";

/**
 * §3.9.7 / §3.3.11's field picker and confirm step (A3311_MergeClients). Rulings:
 * docs/Screen-Inventory.md §3.9, "Merge (PR 2), ruled now".
 *
 * The artboard's three chips per row (Source, Target, "Both → keep target") became one choice
 * per row between the two values, because the ruling is "defaults to the kept value, falls back
 * when it is empty, can be flipped", and a radio pair says exactly that. Its "Merge" chip for
 * tags (a union) was not ruled, so tags pick one side like every other detail.
 *
 * ONLY WHAT DIFFERS is drawn as a row; the rest is one sentence. The email row is fixed when a
 * sign-in survives, because the record's address has to be the address they sign in with.
 *
 * THE CONFIRM STEP follows `ClientArchiveDialog`: Escape closes, a backdrop click does not,
 * nothing closes mid-write. It shows the record as it will be, the counts that move, what
 * happens to the sign-ins, and that there is no undo and no email. A success goes to the kept
 * record.
 */

const PAPER_SX = { m: 2, width: "min(560px, calc(100vw - 2rem))", maxWidth: "100%" } as const;
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

type Preview = Extract<MergeView, { kind: "preview" }>;

export function ClientMergeForm({ view }: { view: Preview }) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<string, "keep" | "retire">>(() =>
    Object.fromEntries(view.fields.map((f) => [f.field, f.pick])),
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function merge() {
    setError(null);
    startTransition(async () => {
      const result = await mergeClientsAction({
        keepId: view.keep.clientId,
        otherId: view.retire.clientId,
        keepVersion: view.keep.version,
        otherVersion: view.retire.version,
        choices: changedChoices(view.fields, picks),
      });
      if (!result.ok) {
        setError(result.message);
        // A stale version only clears with fresh props; the page's key then resets the picks.
        if (result.stale) router.refresh();
        return;
      }
      router.push(`/agent/clients/${result.keptClientId}`);
      router.refresh();
    });
  }

  return (
    <>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) 60px minmax(0, 1fr)" },
          gap: 1.25,
        }}
      >
        <SideCard overline={C.mergingIn} side={view.retire}>
          <Box sx={{ mt: 1 }}>
            <MuiLink
              component={NextLink}
              href={`/agent/clients/${view.retire.clientId}/merge?with=${view.keep.clientId}`}
              variant="body2"
              underline="hover"
            >
              {C.swap}
            </MuiLink>
          </Box>
        </SideCard>
        <Typography
          aria-hidden
          sx={{ alignSelf: "center", textAlign: "center", color: "text.secondary", display: { xs: "none", md: "block" } }}
        >
          →
        </Typography>
        <SideCard overline={C.keeping} side={view.keep}>
          <Box sx={{ mt: 1 }}>
            <MuiLink component={NextLink} href={`/agent/clients/${view.keep.clientId}/merge`} variant="body2" underline="hover">
              {C.pickAnother}
            </MuiLink>
          </Box>
        </SideCard>
      </Box>

      {view.blocked && (
        <Box sx={{ mt: 1.75 }}>
          <Alert tone="warning">{view.blocked}</Alert>
        </Box>
      )}

      <Box component="section" aria-labelledby="merge-fields-heading" sx={{ mt: 2.5 }}>
        <Typography id="merge-fields-heading" component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>
          {C.pickerHeading}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.25, mb: 1.5, color: "text.secondary" }}>
          {C.pickerSub}
        </Typography>

        {view.fields.length > 0 ? (
          <Card variant="outlined">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{C.colField}</TableCell>
                    <TableCell>{C.mergingIn}</TableCell>
                    <TableCell>{C.keeping}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {view.fields.map((f) => (
                    <FieldRow
                      key={f.field}
                      field={f}
                      pick={f.pinned ? f.pick : picks[f.field] ?? f.pick}
                      onPick={(pick) => setPicks((p) => ({ ...p, [f.field]: pick }))}
                      disabled={pending}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        ) : null}
        <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
          {view.fields.length === 0 ? C.allSame : view.sameCount > 0 ? C.sameCount(view.sameCount) : null}
        </Typography>
      </Box>

      <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 1.25 }}>
        <MuiButton component={NextLink} href={`/agent/clients/${view.keep.clientId}`} variant="text" color="primary" sx={BTN_SM}>
          {C.cancel}
        </MuiButton>
        <Box sx={{ ml: "auto" }}>
          <Button
            type="button"
            variant="filled"
            size="sm"
            disabled={Boolean(view.blocked)}
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
          >
            <Icon name="users" size={14} /> {C.review}
          </Button>
        </Box>
      </Box>

      <Dialog
        open={open}
        onClose={(_event, reason) => {
          if (reason !== "backdropClick" && !pending) setOpen(false);
        }}
        maxWidth={false}
        slotProps={{ paper: { "aria-label": C.confirmTitle(view.keep.name), sx: PAPER_SX } }}
      >
        <DialogContent sx={{ p: 2.5 }}>
          <Typography component="h2" variant="h5" sx={{ m: 0, overflowWrap: "anywhere" }}>
            {C.confirmTitle(view.keep.name)}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.75 }}>
            {view.moves ? C.confirmMoves(view.moves, view.retire.name) : C.nothingMoves(view.retire.name)}
          </Typography>

          {view.fields.length > 0 && (
            <>
              <Typography component="h3" variant="overline" sx={{ display: "block", mt: 1.5, lineHeight: 1.3 }}>
                {C.confirmResult}
              </Typography>
              <Box component="dl" sx={{ m: 0, mt: 0.5, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 1.5, rowGap: 0.5 }}>
                {mergedValues(view.fields, picks).map((v) => (
                  <Box key={v.label} sx={{ display: "contents" }}>
                    <Typography component="dt" variant="body2" sx={{ color: "text.secondary" }}>
                      {v.label}
                    </Typography>
                    <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: "anywhere" }}>
                      {v.value}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </>
          )}

          {view.plan && (
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              {view.plan}
            </Typography>
          )}

          <Paper
            variant="outlined"
            sx={{ p: 1.25, mt: 1.5, bgcolor: "surface.2", color: "text.secondary", display: "flex", gap: 1, alignItems: "flex-start" }}
          >
            <Box sx={{ pt: "2px" }}>
              <Icon name="info" size={13} />
            </Box>
            <Typography variant="caption" sx={{ fontWeight: 500 }}>
              {C.noUndo} {C.noEmail}
            </Typography>
          </Paper>

          {error && (
            <Typography component="p" variant="body2" role="alert" sx={{ mt: 1, color: "error.main" }}>
              {error}
            </Typography>
          )}

          <Box sx={{ mt: 1.75, display: "flex", alignItems: "center", gap: 1 }}>
            <Button type="button" variant="outlined" size="sm" disabled={pending} onClick={() => setOpen(false)}>
              {C.cancel}
            </Button>
            <Box sx={{ ml: "auto" }}>
              <Button type="button" variant="filled" size="sm" disabled={pending} onClick={merge}>
                {pending ? C.working : C.confirm}
              </Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SideCard({ overline, side, children }: { overline: string; side: MergeSide; children?: React.ReactNode }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
        <Typography variant="overline" sx={{ display: "block", lineHeight: 1.3 }}>
          {overline}
        </Typography>
        <Typography component="p" variant="subtitle1" sx={{ mt: 0.5, lineHeight: 1.3, overflowWrap: "anywhere" }}>
          {side.name}
        </Typography>
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          {side.line}
        </Typography>
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary", overflowWrap: "anywhere" }}>
          {side.signIn}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

function FieldRow({
  field,
  pick,
  onPick,
  disabled,
}: {
  field: MergeField;
  pick: "keep" | "retire";
  onPick: (pick: "keep" | "retire") => void;
  disabled: boolean;
}) {
  const cell = (which: "keep" | "retire") => {
    const value = which === "keep" ? field.keep : field.retire;
    const chosen = pick === which;
    if (field.pinned) {
      return (
        <TableCell sx={{ color: chosen ? "text.primary" : "text.secondary", overflowWrap: "anywhere" }}>
          {value}
          {chosen && (
            <Chip
              size="small"
              label={C.pinned}
              sx={{ ml: 1, bgcolor: "primary.container", color: "primary.onContainer" }}
            />
          )}
        </TableCell>
      );
    }
    return (
      <TableCell sx={{ py: 0.5 }}>
        <Box
          component="label"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            cursor: disabled ? "default" : "pointer",
            color: chosen ? "text.primary" : "text.secondary",
            fontWeight: chosen ? 600 : 400,
            overflowWrap: "anywhere",
          }}
        >
          <Radio
            size="small"
            name={`merge-${field.field}`}
            checked={chosen}
            disabled={disabled}
            onChange={() => onPick(which)}
            slotProps={{ input: { "aria-label": C.pickValueLabel(field.label, value) } }}
          />
          <Typography component="span" variant="body2" sx={{ fontWeight: "inherit" }}>
            {value}
          </Typography>
        </Box>
      </TableCell>
    );
  };

  return (
    <TableRow>
      <TableCell component="th" scope="row" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
        {field.label}
      </TableCell>
      {cell("retire")}
      {cell("keep")}
    </TableRow>
  );
}
