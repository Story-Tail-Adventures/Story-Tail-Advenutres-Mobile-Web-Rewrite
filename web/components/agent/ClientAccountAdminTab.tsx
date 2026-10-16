"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import { accountAdminAction, type AccountAdminOp } from "@/app/(agent)/agent/clients/[clientId]/actions";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { TextareaField } from "@/components/ui/Textarea";
import type { AccountAdminView } from "@/lib/agent/accountAdminView";
import { ACCOUNT_ADMIN_COPY as C, CLIENT_COPY } from "@/lib/agent/content";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * §3.9 Login Support: Client Detail's Account admin tab. A391's status panel and quick actions,
 * A392 to A395's confirm dialogs, and 3.9.6's sign-ins (A396) as a section of the same tab.
 * Rulings: docs/Screen-Inventory.md §3.9 (2026-10-16).
 *
 * NOTHING HERE DECIDES WHAT IS ALLOWED. A button is hidden or explained when the snapshot says
 * it cannot work, so the advisor is not invited to try, but every rule is enforced again by the
 * `account-admin` Edge Function, and its refusal is what the dialog shows.
 *
 * The dialogs follow `ClientArchiveDialog`: MUI Dialog, Escape closes, a backdrop click does
 * not (it would throw away a typed reason), nothing closes mid-write, and a success closes the
 * dialog, says what happened in the tab's status line, and refreshes the server data.
 */

type ConfirmSpec = {
  op: AccountAdminOp;
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  field?: { label: string; placeholder: string; hint?: string; min: number; tooShort: string; key: "reason" | "note" };
};

const PAPER_SX = { m: 2, width: "min(480px, calc(100vw - 2rem))", maxWidth: "100%" } as const;

export function ClientAccountAdminTab({
  clientId,
  view,
  mfaReturnTo,
}: {
  clientId: string;
  view: AccountAdminView;
  /** Where the MFA pages send the advisor back to: this tab. */
  mfaReturnTo: string;
}) {
  const router = useRouter();
  const [spec, setSpec] = useState<ConfirmSpec | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; message: string; duplicateClientId?: string | null } | null>(null);
  const [rowPending, startRow] = useTransition();

  const email = view.kind === "account" ? view.email : view.kind === "no-sign-in" ? view.email ?? "" : "";

  function done(result: { ok: boolean; message: string; duplicateClientId?: string | null }) {
    setStatus(result);
    router.refresh();
  }

  function flag(authEventId: string, on: boolean) {
    startRow(async () => {
      done(await accountAdminAction({ clientId, op: on ? "flag" : "unflag", authEventId }));
    });
  }

  return (
    <Box component="section" aria-labelledby="account-admin-heading">
      <Typography id="account-admin-heading" component="h2" variant="h5" sx={{ m: 0 }}>
        {C.tab}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
        {C.sub}
      </Typography>

      <Box role="status" aria-live="polite" sx={{ mt: status ? 1.5 : 0 }}>
        {status && (
          <Alert tone={status.ok ? "success" : "warning"} role="status" aria-live="off">
            {status.message}
            {status.duplicateClientId && (
              <>
                {" "}
                <NextLink href={`/agent/clients/${status.duplicateClientId}`}>{C.duplicateLink}</NextLink>
              </>
            )}
          </Alert>
        )}
      </Box>

      <Box sx={{ mt: 2 }}>
        {view.kind === "needs-mfa" && <MfaGate hasFactor={view.agentHasFactor} returnTo={mfaReturnTo} />}

        {view.kind === "no-sign-in" && (
          <Card variant="outlined" sx={{ maxWidth: 640 }}>
            <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
              <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
                {C.noSignInTitle}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
                {C.noSignInBody(view.firstName)}
              </Typography>
              <Box sx={{ mt: 1.75 }}>
                <ActionTile
                  icon="mail"
                  label={C.actionInvite}
                  blocked={
                    view.archived ? C.archivedFirst
                      : !view.email ? C.noEmail
                      : view.duplicate.any ? C.duplicate
                      : view.sendsLeft === 0 ? C.sendsLeft(0)
                      : null
                  }
                  blockedLink={view.duplicate.clientId}
                  onClick={() =>
                    setSpec({
                      op: "invite",
                      title: C.inviteTitle(view.firstName),
                      body: C.inviteBody(view.email ?? ""),
                      confirm: C.inviteConfirm,
                    })
                  }
                />
              </Box>
              {view.sendsLeft > 0 && view.sendsLeft < 3 && (
                <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
                  {C.sendsLeft(view.sendsLeft)}
                </Typography>
              )}
            </CardContent>
          </Card>
        )}

        {view.kind === "account" && (
          <AccountView
            view={view}
            open={setSpec}
            onFlag={flag}
            rowPending={rowPending}
          />
        )}
      </Box>

      <ConfirmDialog
        spec={spec}
        onClose={() => setSpec(null)}
        onDone={done}
        clientId={clientId}
        email={email}
      />
    </Box>
  );
}

function MfaGate({ hasFactor, returnTo }: { hasFactor: boolean; returnTo: string }) {
  const href = hasFactor
    ? `/login/mfa?next=${encodeURIComponent(returnTo)}`
    : `/mfa/setup?next=${encodeURIComponent(returnTo)}`;
  return (
    <Card variant="outlined" sx={{ maxWidth: 640 }}>
      <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
          <Avatar sx={{ width: 36, height: 36, bgcolor: "secondary.container", color: "secondary.onContainer" }}>
            <Icon name="shield" size={16} />
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
              {C.gateTitle}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
              {hasFactor ? C.gateBodyVerify : C.gateBodyNoFactor}
            </Typography>
            <Box sx={{ mt: 1.5 }}>
              <NextLink href={href}>{hasFactor ? C.gateVerify : C.gateSetUp}</NextLink>
            </Box>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function AccountView({
  view,
  open,
  onFlag,
  rowPending,
}: {
  view: Extract<AccountAdminView, { kind: "account" }>;
  open: (spec: ConfirmSpec) => void;
  onFlag: (id: string, on: boolean) => void;
  rowPending: boolean;
}) {
  const name = view.firstName;
  const capped = view.sendsLeft === 0 ? C.sendsLeft(0) : null;
  const locked = view.locked ? C.lockedFirst : null;

  return (
    <Stack spacing={2}>
      {view.locked && (
        <Alert tone="warning" role="status" aria-live="off">
          {C.lockedSince(view.locked.since)}
          {view.locked.reason && <> {C.lockedReason(view.locked.reason)}</>}
        </Alert>
      )}
      {view.invitePending && (
        <Alert tone="info" role="status" aria-live="off">
          {C.invitePending}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gap: 1.75,
          gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1.4fr) minmax(0, 1fr)" },
          maxWidth: 1080,
        }}
      >
        <Card variant="outlined">
          <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
            <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
              {C.actionsHeading}
            </Typography>
            <Box
              sx={{
                display: "grid",
                gap: 1.25,
                mt: 1.25,
                gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
              }}
            >
              {view.invitePending ? (
                <ActionTile
                  icon="mail"
                  label={C.actionInviteAgain}
                  blocked={capped}
                  onClick={() =>
                    open({ op: "invite", title: C.inviteTitle(name), body: C.inviteBody(view.email), confirm: C.inviteConfirm })
                  }
                />
              ) : (
                <ActionTile
                  icon="lock"
                  label={C.actionReset}
                  blocked={view.socialOnly ? C.socialOnly(view.socialOnly) : locked ?? capped}
                  onClick={() =>
                    open({ op: "reset", title: C.resetTitle(name), body: C.resetBody(view.email), confirm: C.resetConfirm })
                  }
                />
              )}
              <ActionTile
                icon="link"
                label={C.actionMagic}
                blocked={locked ?? capped}
                onClick={() =>
                  open({ op: "magic_link", title: C.magicTitle(name), body: C.magicBody(view.email), confirm: C.magicConfirm })
                }
              />
              <ActionTile
                icon="check"
                label={C.actionVerify}
                blocked={view.emailVerified ? C.alreadyVerified : view.duplicate.any ? C.duplicate : null}
                blockedLink={view.emailVerified ? null : view.duplicate.clientId}
                onClick={() =>
                  open({
                    op: "verify_email",
                    title: C.verifyTitle(view.email),
                    body: C.verifyBody,
                    confirm: C.verifyConfirm,
                    field: {
                      key: "note",
                      label: C.verifyNoteLabel,
                      placeholder: C.verifyNotePlaceholder,
                      hint: C.verifyNoteHint,
                      min: 20,
                      tooShort: C.noteTooShort,
                    },
                  })
                }
              />
              <ActionTile icon="users" label={C.actionMerge} blocked={CLIENT_COPY.mergeDeferred} />
              {view.locked ? (
                <ActionTile
                  icon="lock"
                  label={C.actionUnlock}
                  onClick={() =>
                    open({
                      op: "unlock",
                      title: C.unlockTitle(name),
                      body: C.unlockBody,
                      confirm: C.unlockConfirm,
                      field: { key: "reason", label: C.lockReasonLabel, placeholder: C.unlockReasonPlaceholder, min: 1, tooShort: C.reasonRequired },
                    })
                  }
                />
              ) : (
                <ActionTile
                  icon="lock"
                  label={C.actionLock}
                  onClick={() =>
                    open({
                      op: "lock",
                      title: C.lockTitle(name),
                      body: C.lockBody,
                      confirm: C.lockConfirm,
                      danger: true,
                      field: { key: "reason", label: C.lockReasonLabel, placeholder: C.lockReasonPlaceholder, min: 1, tooShort: C.reasonRequired },
                    })
                  }
                />
              )}
              <ActionTile
                icon="close"
                label={C.actionSignOut}
                blocked={view.sessions.length === 0 ? C.devicesEmpty : null}
                onClick={() =>
                  open({ op: "sign_out_everywhere", title: C.signOutTitle(name), body: C.signOutBody, confirm: C.signOutConfirm })
                }
              />
            </Box>
            {view.sendsLeft > 0 && view.sendsLeft < 3 && (
              <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
                {C.sendsLeft(view.sendsLeft)}
              </Typography>
            )}
          </CardContent>
        </Card>

        <Card variant="outlined" component="aside" aria-label={C.statusHeading} sx={{ alignSelf: "start" }}>
          <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
            <Typography variant="overline" sx={{ display: "block", color: "text.secondary", lineHeight: 1.3 }}>
              {C.statusHeading}
            </Typography>
            <Box component="dl" sx={{ m: 0, mt: 0.75, display: "grid", gap: 0.75 }}>
              <StatusRow label={C.statusAccount}>
                {view.locked ? <StatusChip kind="due" label={C.statusLocked} />
                  : view.invitePending ? <StatusChip kind="proposal" label={C.statusInviteSent} />
                  : <StatusChip kind="booked" label={C.statusActive} />}
              </StatusRow>
              <StatusRow label={C.statusEmail}>
                <StatusChip kind={view.emailVerified ? "booked" : "proposal"} label={view.emailVerified ? C.statusVerified : C.statusNotVerified} />
              </StatusRow>
              <StatusRow label={C.statusMfa}>
                <StatusChip kind={view.mfaOn ? "booked" : "past"} label={view.mfaOn ? C.statusOn : C.statusOff} />
              </StatusRow>
              <StatusRow label={C.statusLastSignIn}>
                <Typography component="span" variant="body2" sx={{ fontWeight: 500, textAlign: "right" }}>
                  {view.lastSignIn ?? C.statusNever}
                </Typography>
              </StatusRow>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Card variant="outlined" sx={{ maxWidth: 1080 }}>
        <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
          <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
            {C.devicesHeading}
          </Typography>
          {view.sessions.length === 0 ? (
            <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
              {C.devicesEmpty}
            </Typography>
          ) : (
            <Box component="ul" sx={{ m: 0, mt: 1, p: 0, listStyle: "none", display: "grid", gap: 0.75 }}>
              {view.sessions.map((s) => (
                <Box component="li" key={s.id} sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "baseline" }}>
                  <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>
                    {s.device}
                  </Typography>
                  <Typography component="span" variant="body2" sx={{ color: "text.secondary" }}>
                    {C.deviceLastActive(s.lastActive)}
                  </Typography>
                  {s.ip && (
                    <Typography component="span" variant="body2" sx={{ color: "text.secondary", fontFamily: "mono", fontSize: 12 }}>
                      {s.ip}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ maxWidth: 1080 }}>
        <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
          <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
            {C.activityHeading}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
            {C.activitySub}
          </Typography>
          {view.activity.length === 0 ? (
            <Typography variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
              {C.activityEmpty}
            </Typography>
          ) : (
            <Box sx={{ mt: 1, overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{C.colWhen}</TableCell>
                    <TableCell>{C.colDevice}</TableCell>
                    <TableCell>{C.colIp}</TableCell>
                    <TableCell><Box component="span" sx={VISUALLY_HIDDEN}>{C.flag}</Box></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {view.activity.map((a) => (
                    <TableRow key={a.id} hover sx={a.flagged ? { bgcolor: "status.due.bg" } : undefined}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{a.when}</TableCell>
                      <TableCell>{a.device}</TableCell>
                      <TableCell sx={{ fontFamily: "mono", fontSize: 12, color: "text.secondary" }}>
                        {a.ip ?? C.ipUnknown}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {a.flagged && (
                          <Box component="span" sx={{ mr: 1 }}>
                            <StatusChip kind="due" label={C.flagged} />
                          </Box>
                        )}
                        <Button
                          type="button"
                          variant="text"
                          size="sm"
                          disabled={rowPending}
                          onClick={() => onFlag(a.id, !a.flagged)}
                        >
                          {a.flagged ? C.unflag : C.flag}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5 }}>
      <Typography component="dt" variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>
        {label}
      </Typography>
      <Box component="dd" sx={{ m: 0 }}>
        {children}
      </Box>
    </Box>
  );
}

/**
 * One quick action (A391's tile). Blocked tiles stay visible with the reason under the label,
 * so the advisor learns why rather than wondering where a button went.
 */
function ActionTile({
  icon,
  label,
  blocked = null,
  blockedLink = null,
  onClick,
}: {
  icon: IconName;
  label: string;
  blocked?: string | null;
  blockedLink?: string | null;
  onClick?: () => void;
}) {
  const disabled = Boolean(blocked) || !onClick;
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <ButtonBase
        onClick={onClick}
        disabled={disabled}
        sx={{
          width: "100%",
          minHeight: 52,
          px: 1.5,
          py: 1,
          gap: 1.25,
          justifyContent: "flex-start",
          textAlign: "left",
          "&.Mui-disabled": { opacity: 0.55 },
          "&:hover": { bgcolor: "surface.2" },
        }}
      >
        <Avatar sx={{ width: 32, height: 32, bgcolor: "surface.3", color: "text.primary", flexShrink: 0 }}>
          <Icon name={icon} size={14} />
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="span" variant="subtitle2" sx={{ display: "block" }}>
            {label}
          </Typography>
          {blocked && (
            <Typography component="span" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
              {blocked}
            </Typography>
          )}
        </Box>
        {!disabled && <Icon name="chevron_right" size={14} />}
      </ButtonBase>
      {blocked && blockedLink && (
        <Box sx={{ px: 1.5, pb: 1 }}>
          <NextLink href={`/agent/clients/${blockedLink}`}>{C.duplicateLink}</NextLink>
        </Box>
      )}
    </Paper>
  );
}

function ConfirmDialog({
  spec,
  onClose,
  onDone,
  clientId,
  email,
}: {
  spec: ConfirmSpec | null;
  onClose: () => void;
  onDone: (r: { ok: boolean; message: string; duplicateClientId?: string | null }) => void;
  clientId: string;
  email: string;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [shownFor, setShownFor] = useState<ConfirmSpec | null>(null);

  // A fresh dialog starts empty; reopening must not show the last action's text or error.
  if (spec !== shownFor) {
    setShownFor(spec);
    setValue("");
    setError(null);
  }

  function submit() {
    if (!spec) return;
    const field = spec.field;
    const trimmed = value.trim();
    if (field && trimmed.length < field.min) {
      setError(field.tooShort);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await accountAdminAction({
        clientId,
        op: spec.op,
        email,
        ...(field ? { [field.key]: trimmed } : {}),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onClose();
      onDone(result);
    });
  }

  return (
    <Dialog
      open={spec !== null}
      onClose={(_event, reason) => {
        if (reason !== "backdropClick" && !pending) onClose();
      }}
      maxWidth={false}
      slotProps={{ paper: { "aria-label": spec?.title ?? "", sx: PAPER_SX } }}
    >
      {spec && (
        <DialogContent sx={{ p: 2.5 }}>
          <Typography component="h2" variant="h5" sx={{ m: 0, overflowWrap: "anywhere" }}>
            {spec.title}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.75, color: "text.secondary" }}>
            {spec.body}
          </Typography>

          {spec.field && (
            <Box sx={{ mt: 1.5 }}>
              <TextareaField
                id={`account-admin-${spec.field.key}`}
                label={spec.field.label}
                hint={spec.field.hint}
                rows={2}
                placeholder={spec.field.placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={pending}
              />
            </Box>
          )}

          <Paper
            variant="outlined"
            sx={{ p: 1.25, mt: 1.5, bgcolor: "surface.2", color: "text.secondary", display: "flex", gap: 1, alignItems: "center" }}
          >
            <Icon name="info" size={13} />
            <Typography variant="caption" sx={{ fontWeight: 500 }}>
              {C.auditNotice}
            </Typography>
          </Paper>

          {error && (
            <Typography component="p" variant="body2" role="alert" sx={{ mt: 1, color: "error.main" }}>
              {error}
            </Typography>
          )}

          <Box sx={{ mt: 1.75, display: "flex", alignItems: "center", gap: 1 }}>
            <Button type="button" variant="outlined" size="sm" disabled={pending} onClick={onClose}>
              {C.cancel}
            </Button>
            <Box sx={{ ml: "auto" }}>
              <Button type="button" variant={spec.danger ? "danger" : "filled"} size="sm" disabled={pending} onClick={submit}>
                {pending ? C.working : spec.confirm}
              </Button>
            </Box>
          </Box>
        </DialogContent>
      )}
    </Dialog>
  );
}
