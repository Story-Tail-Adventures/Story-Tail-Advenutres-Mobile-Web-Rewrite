/**
 * §3.9 Login Support: every button on Client Detail's Account admin tab, and the merge page.
 * Screens 3.9.1 to 3.9.7 (3.9.7 is 3.3.11) and the invite. Rulings: docs/Screen-Inventory.md
 * §3.9 (2026-10-16).
 *
 * ONE FUNCTION, TEN OPS, matching `agent-client`: each is `requireUser` → `requireAgentId` →
 * the MFA gate → the snapshot → one action, and ten copies of that preamble would be ten
 * places to forget the gate.
 *
 * ── THE MFA GATE ───────────────────────────────────────────────────────────────
 *
 * Every op needs an aal2 session. `verify_email` and `merge` also need the second factor within
 * the last 15 minutes (`requireRecentMfa`): marking an address verified that the advisor did not
 * see verified, or folding one person's trips into another's, is where a stolen laptop does real
 * harm. Lock does NOT need a fresh factor, because
 * locking has to be fast.
 *
 * ── NOTHING A CLIENT CAN SIGN IN WITH LEAVES THIS FUNCTION EXCEPT BY EMAIL ────
 *
 * generateLink returns a link and a token hash. They go into `buildSignInEmail` and from there
 * into nodemailer, and nowhere else: not the response, not a log line, not an audit row, not an
 * error message. `generated` is never logged, and a send failure is logged through
 * `classifySmtpError`, which keeps only the code and the server's words.
 *
 * ── ORDER OF THE TWO HALVES OF A LOCK ─────────────────────────────────────────
 *
 * GoTrue's ban (Admin API) and our row (`account_admin_set_lock`) cannot share a transaction.
 * So the Admin API goes FIRST and the row second, and a failed row undoes the Admin API call:
 * a ban with no row would leave the tab saying "Active" about a client who cannot sign in.
 *
 * ── MERGE ───────────────────────────────────────────────────────────────────────
 *
 * When both records have a sign-in, the retired one is locked, and its GoTrue ban is the same
 * two halves as a lock: ban FIRST, then `account_admin_merge_clients` (which locks the row
 * through `account_admin_set_lock` inside its own transaction), and a merge that does not land
 * lifts the ban again, unless the account was already locked before. The SQL is told which
 * account was banned and answers `stale` if that is no longer the sign-in it would lock.
 *
 * ── ANSWERS ─────────────────────────────────────────────────────────────────────
 *
 * 200 with an `outcome` for every answer the tab draws (sent, capped, duplicate, ...), as the
 * house shape (`agent-client`) does. 4xx only for a malformed request, a missing client (404,
 * never 403, so an id's existence is not confirmed) or the MFA gate (403).
 */
import { requireRecentMfa, requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { classifySmtpError, emailConfigFromEnv } from "../_shared/email.ts";
import { badRequest, forbidden, HttpError, notFound, problem } from "../_shared/problem.ts";
import { buildSignInEmail, type SignInEmailKind, VERIFY_TYPE } from "../_shared/signInEmail.ts";
import { smtpTransport } from "../_shared/smtp.ts";
import { readJson } from "../_shared/trip.ts";
import { isUuid, uuidV7 } from "../_shared/uuid.ts";
import { agentDb, requireAgentId } from "../_shared/agent.ts";
import type { AuthContext } from "../_shared/auth.ts";
import type { Db } from "../_shared/db.ts";

const OPS = [
  "reset",
  "magic_link",
  "invite",
  "verify_email",
  "lock",
  "unlock",
  "sign_out_everywhere",
  "flag",
  "unflag",
  "merge",
] as const;
type Op = (typeof OPS)[number];

/** Long enough that one letter is not a record of how the advisor checked. */
const MIN_VERIFY_NOTE = 20;
const MAX_NOTE = 500;
/** GoTrue's "forever": a ban is lifted only by unlock. */
const BAN_FOREVER = "876000h";

/** account_admin_target(), as the SQL builds it. */
interface Snapshot {
  clientId: string;
  firstName: string | null;
  lastName: string | null;
  clientEmail: string | null;
  clientArchived: boolean;
  duplicateEmail: boolean;
  duplicateEmailClientId: string | null;
  signInEmailsLastHour: number;
  hasSignIn: boolean;
  accountId?: string;
  signInEmail?: string | null;
  emailVerifiedAt?: string | null;
  invitedAt?: string | null;
  hasPassword?: boolean;
  providers?: string[];
  lockedAt?: string | null;
  bannedUntil?: string | null;
  duplicateSignInEmail?: boolean;
}

/** A GoTrue ban still in force. Normally only with lockedAt; alone, a lock's row half failed. */
function banned(s: Snapshot): boolean {
  return Boolean(s.bannedUntil && Date.parse(s.bannedUntil) > Date.now());
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function requireOp(value: unknown): Op {
  if (typeof value !== "string" || !(OPS as readonly string[]).includes(value)) {
    throw badRequest(`op must be one of: ${OPS.join(", ")}.`);
  }
  return value as Op;
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") throw badRequest(`${field} is required.`);
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw badRequest(min > 1 ? `${field} needs at least ${min} characters.` : `${field} is required.`);
  }
  if (trimmed.length > max) throw badRequest(`${field} is too long.`);
  return trimmed;
}

/** aal2 for every op. The message is what the tab shows under its gate. */
function requireAal2(ctx: AuthContext): void {
  if (ctx.aal !== "aal2") {
    throw forbidden("Set up two-step sign-in first.");
  }
}

async function snapshot(db: Db, agentId: string, clientId: string): Promise<Snapshot> {
  const { data, error } = await db.rpc("account_admin_target", {
    p_agent_id: agentId,
    p_client_id: clientId,
  });
  if (error) throw new Error(`account snapshot failed: ${error.message}`);
  if (!data) throw notFound("No such client.");
  return data as unknown as Snapshot;
}

function audit(ctx: AuthContext) {
  return { p_actor_user_id: ctx.platformUserId, p_ip: ctx.ip ?? undefined, p_user_agent: ctx.userAgent ?? undefined };
}

async function agentFirstName(db: Db, agentId: string): Promise<string | null> {
  const { data } = await db.from("agent").select("display_name").eq("id", agentId).maybeSingle();
  return data?.display_name ?? null;
}

// ── Sign-in emails ───────────────────────────────────────────────────────────

/** Why this kind cannot go to this client, in the tab's words, or null when it can. */
function emailRefusal(kind: SignInEmailKind, s: Snapshot): string | null {
  if (kind === "invite") {
    if (s.hasSignIn && (s.emailVerifiedAt || !s.invitedAt)) return "They already have a sign-in.";
    if (s.clientArchived) return "Restore this client before inviting them.";
    if (s.duplicateEmail) return "Another client record has this email. Merge them first.";
    if (!s.clientEmail) return "Add an email address first.";
    return null;
  }
  if (!s.hasSignIn) return "They haven't signed in yet. Send an invite instead.";
  if (s.lockedAt || banned(s)) return "Their account is locked. Unlock it first.";
  // Reset is refused only for a Google- or Apple-only sign-in. An email sign-in with no password
  // yet (an accepted invite, or one verified by hand) is exactly who a recovery link helps: it
  // lets them choose one. Found clicking through 2026-10-16.
  if (kind === "reset" && !s.hasPassword && (s.providers ?? []).some((p) => p !== "email")) {
    return "They sign in with Google or Apple, so there's no password to reset.";
  }
  return null;
}

async function sendSignInEmail(
  ctx: AuthContext,
  db: Db,
  agentId: string,
  clientId: string,
  kind: SignInEmailKind,
): Promise<Response> {
  const s = await snapshot(db, agentId, clientId);
  const refusal = emailRefusal(kind, s);
  if (refusal) return json({ outcome: "refused", reason: refusal });

  const cfg = emailConfigFromEnv((name) => Deno.env.get(name));
  if (!cfg) {
    throw new HttpError(503, "Service Unavailable", "Email isn't set up yet, so nothing was sent.");
  }

  // Claim BEFORE making the link: a capped request never creates one.
  const { data: claim, error: claimError } = await db.rpc("account_admin_claim_signin_email", {
    p_agent_id: agentId,
    p_audit_id: uuidV7(),
    p_client_id: clientId,
    p_kind: kind,
    ...audit(ctx),
  });
  if (claimError) throw new Error(`claim failed: ${claimError.message}`);
  if (claim === "not_found") throw notFound("No such client.");
  if (claim === "capped") return json({ outcome: "capped" });

  const email = (kind === "invite" ? s.clientEmail : s.signInEmail) as string;
  const admin = db.auth.admin;
  const generated = kind === "invite"
    ? await admin.generateLink({
      type: "invite",
      email,
      // handle_new_user() reads these: this advisor owns the sign-in's client, and the name is
      // the advisor's spelling. The bind below then points it at THIS record.
      options: { data: { agent_id: agentId, first_name: s.firstName ?? "", last_name: s.lastName ?? "" } },
    })
    : await admin.generateLink({ type: kind === "reset" ? "recovery" : "magiclink", email });

  if (generated.error || !generated.data?.properties?.hashed_token) {
    // Status and code only; the AuthError carries nothing secret, but its message is GoTrue's.
    console.warn("[account-admin] generateLink failed", {
      kind,
      status: generated.error?.status,
      code: generated.error?.code,
    });
    await writeAuditEvent(ctx, {
      eventType: "client.signin_email_failed",
      targetEntity: "client",
      targetId: clientId,
      metadata: { kind, stage: "link", code: generated.error?.code ?? null },
    });
    return json({ outcome: "failed" });
  }
  if (generated.data.properties.verification_type !== VERIFY_TYPE[kind]) {
    throw new Error(`generateLink answered ${generated.data.properties.verification_type} for ${kind}`);
  }

  if (kind === "invite") {
    const { data: bound, error: bindError } = await db.rpc("account_admin_bind_invite", {
      p_agent_id: agentId,
      p_audit_id: uuidV7(),
      p_client_id: clientId,
      p_account_id: generated.data.user.id,
      ...audit(ctx),
    });
    if (bindError) throw new Error(`invite bind failed: ${bindError.message}`);
    if (bound !== "bound" && bound !== "already") {
      // An address that already belongs to someone else's sign-in, most likely. Nothing is sent.
      return json({ outcome: "refused", reason: "That email already has a different sign-in." });
    }
  }

  const built = buildSignInEmail({
    kind,
    to: email,
    clientFirstName: s.firstName,
    agentFirstName: await agentFirstName(db, agentId),
    tokenHash: generated.data.properties.hashed_token,
    messageKey: uuidV7(),
  }, cfg);

  try {
    await smtpTransport(cfg).sendMail({ ...built, disableFileAccess: true, disableUrlAccess: true });
  } catch (err) {
    const { permanent, error } = classifySmtpError(err);
    console.warn("[account-admin] send failed", { kind, permanent, error });
    await writeAuditEvent(ctx, {
      eventType: "client.signin_email_failed",
      targetEntity: "client",
      targetId: clientId,
      metadata: { kind, stage: "send", permanent },
    });
    return json({ outcome: "failed" });
  }

  await writeAuditEvent(ctx, {
    eventType: "client.signin_email_sent",
    targetEntity: "client",
    targetId: clientId,
    metadata: { kind },
  });
  return json({ outcome: "sent", kind });
}

// ── Merge (3.9.7 / 3.3.11) ───────────────────────────────────────────────────

/** client_merge_preview(), the parts this function decides from. */
interface MergePreview {
  keep: { version: number };
  retire: { version: number; signIn: { accountId: string; locked: boolean } | null };
  signInPlan: "none" | "keep" | "move" | "lock_retired";
  blocked: "kept_archived" | "companion_cap" | null;
}

const MERGE_REFUSALS: Record<string, string> = {
  kept_archived: "Restore the record you're keeping before merging into it.",
  companion_cap: "Together they'd have more than 12 companions. Archive a few first.",
  name_required: "The record you keep needs a first and last name.",
};

function version(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw badRequest(`${field} must be a positive integer.`);
  }
  return value;
}

function choices(value: unknown): Record<string, "keep" | "retire"> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest("choices must be an object.");
  }
  const out: Record<string, "keep" | "retire"> = {};
  for (const [key, pick] of Object.entries(value)) {
    if (!/^[a-z_]{1,40}$/.test(key) || (pick !== "keep" && pick !== "retire")) {
      throw badRequest("Each choice is a field name and \"keep\" or \"retire\".");
    }
    out[key] = pick;
  }
  return out;
}

async function mergeClients(
  ctx: AuthContext,
  db: Db,
  agentId: string,
  keepId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  requireRecentMfa(ctx, 900);
  if (!isUuid(payload.otherClientId)) throw badRequest("otherClientId must be a uuid.");
  const retireId = payload.otherClientId;
  const keepVersion = version(payload.keepVersion, "keepVersion");
  const retireVersion = version(payload.otherVersion, "otherVersion");
  const picks = choices(payload.choices);

  const { data: raw, error: previewError } = await db.rpc("client_merge_preview", {
    p_agent_id: agentId,
    p_keep_id: keepId,
    p_retire_id: retireId,
  });
  if (previewError) throw new Error(`merge preview failed: ${previewError.message}`);
  if (!raw) throw notFound("No such client.");
  const preview = raw as unknown as MergePreview;

  if (preview.blocked) return json({ outcome: "refused", reason: MERGE_REFUSALS[preview.blocked] });
  if (preview.keep.version !== keepVersion || preview.retire.version !== retireVersion) {
    return json({ outcome: "stale" });
  }

  // Both sign in: ban the retired one first. See the header.
  const lockAccount = preview.signInPlan === "lock_retired" ? preview.retire.signIn?.accountId ?? null : null;
  const wasLocked = Boolean(preview.retire.signIn?.locked);
  const ban = (duration: string) => db.auth.admin.updateUserById(lockAccount!, { ban_duration: duration });
  if (lockAccount) {
    const first = await ban(BAN_FOREVER);
    if (first.error) throw new Error(`ban failed: ${first.error.status} ${first.error.code}`);
  }

  let data: unknown = null;
  let error: { code?: string; message: string } | null = null;
  let thrown: unknown = null;
  try {
    ({ data, error } = await db.rpc("account_admin_merge_clients", {
      p_agent_id: agentId,
      p_audit_id: uuidV7(),
      p_keep_id: keepId,
      p_retire_id: retireId,
      p_keep_version: keepVersion,
      p_retire_version: retireVersion,
      p_choices: picks,
      // The generated types say `string`; the SQL takes NULL for "banned nothing".
      p_expect_lock_account: lockAccount as string,
      ...audit(ctx),
    }));
  } catch (err) {
    thrown = err;
  }
  const result = data as { outcome?: string; reason?: string; counts?: Record<string, number> } | null;

  if (thrown || error || result?.outcome !== "merged") {
    if (lockAccount && !wasLocked) {
      // A thrown call is ambiguous: the merge may have committed and only the answer was lost.
      // The row says which, so the ban is lifted only when the account is not locked.
      const { data: acct } = await db.from("account").select("locked_at").eq("id", lockAccount).maybeSingle();
      if (!acct?.locked_at) {
        const undo = await ban("none");
        if (undo.error) console.error("[account-admin] could not lift the merge ban", { status: undo.error.status });
      }
    }
    if (thrown) throw thrown;
    if (error) {
      // A field the picker does not offer, from a hand-made request.
      if (error.code === "22023") throw badRequest("One of those choices isn't a field the merge offers.");
      throw new Error(`merge failed: ${error.message}`);
    }
    if (result?.outcome === "not_found") throw notFound("No such client.");
    if (result?.outcome === "refused") {
      return json({ outcome: "refused", reason: MERGE_REFUSALS[result.reason ?? ""] ?? null });
    }
    return json({ outcome: "stale" });
  }

  return json({ outcome: "merged", keptClientId: keepId, counts: result!.counts ?? {} });
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    const db = agentDb();
    const agentId = await requireAgentId(ctx, db);
    requireAal2(ctx);

    const payload = await readJson(req);
    const op = requireOp(payload.op);
    if (!isUuid(payload.clientId)) throw badRequest("clientId must be a uuid.");
    const clientId = payload.clientId;

    if (op === "merge") {
      return await mergeClients(ctx, db, agentId, clientId, payload);
    }

    if (op === "reset" || op === "magic_link" || op === "invite") {
      return await sendSignInEmail(ctx, db, agentId, clientId, op);
    }

    // ── 3.9.4 Verify email ────────────────────────────────────────────────
    if (op === "verify_email") {
      requireRecentMfa(ctx, 900);
      const note = text(payload.note, "How you confirmed it", MIN_VERIFY_NOTE, MAX_NOTE);
      const s = await snapshot(db, agentId, clientId);
      if (!s.hasSignIn || !s.accountId) {
        return json({ outcome: "refused", reason: "They haven't signed in yet." });
      }
      if (s.emailVerifiedAt) return json({ outcome: "noop" });
      // The adoption trigger matches the SIGN-IN address. If the record's address was edited
      // away from it, the duplicate check on the record proves nothing, so refuse outright.
      if ((s.signInEmail ?? "").toLowerCase() !== (s.clientEmail ?? "").toLowerCase()) {
        return json({
          outcome: "refused",
          reason: "Their sign-in address and the one on their record are different. Fix the record first.",
        });
      }
      if (s.duplicateEmail || s.duplicateSignInEmail) {
        // Confirming fires the adoption trigger, which would bind this sign-in to that record.
        return json({ outcome: "duplicate", duplicateClientId: s.duplicateEmailClientId });
      }
      // Audited BEFORE GoTrue is called (review finding): this is the riskiest op on the tab, and
      // a confirmation that lands with no record of who made it is the gap rule 3 exists for.
      await writeAuditEvent(ctx, {
        eventType: "client.email_verified_manually",
        targetEntity: "client",
        targetId: clientId,
        metadata: { accountId: s.accountId, note },
        when: "before",
      });
      const { error } = await db.auth.admin.updateUserById(s.accountId, { email_confirm: true });
      if (error) {
        await writeAuditEvent(ctx, {
          eventType: "client.email_verify_failed",
          targetEntity: "client",
          targetId: clientId,
          metadata: { accountId: s.accountId, status: error.status ?? null, code: error.code ?? null },
        });
        throw new Error(`email confirm failed: ${error.status} ${error.code}`);
      }
      return json({ outcome: "changed" });
    }

    // ── 3.9.5 Lock / unlock ───────────────────────────────────────────────
    if (op === "lock" || op === "unlock") {
      const reason = text(payload.reason, "Reason", 1, MAX_NOTE);
      const s = await snapshot(db, agentId, clientId);
      if (!s.hasSignIn || !s.accountId) {
        return json({ outcome: "refused", reason: "They haven't signed in yet." });
      }
      const lock = op === "lock";
      // A ban with no row (a lock whose second half failed and could not be undone) still
      // blocks sign-in, so Unlock must not call that a no-op.
      if (lock ? Boolean(s.lockedAt) : !s.lockedAt && !banned(s)) return json({ outcome: "noop" });

      const ban = (duration: string) =>
        db.auth.admin.updateUserById(s.accountId!, { ban_duration: duration });

      const first = await ban(lock ? BAN_FOREVER : "none");
      if (first.error) throw new Error(`ban change failed: ${first.error.status} ${first.error.code}`);

      const { data, error } = await db.rpc("account_admin_set_lock", {
        p_agent_id: agentId,
        p_audit_id: uuidV7(),
        p_client_id: clientId,
        p_lock: lock,
        p_reason: reason,
        ...audit(ctx),
      });
      if (error || !data) {
        // Undo the Admin API half so the tab and GoTrue agree. See the header.
        const undo = await ban(lock ? "none" : BAN_FOREVER);
        if (undo.error) console.error("[account-admin] could not undo ban change", { op, status: undo.error.status });
        throw new Error(`lock row failed: ${error?.message ?? "no row"}`);
      }
      return json({ outcome: "changed", sessionsEnded: (data as { sessionsEnded: number }).sessionsEnded });
    }

    // ── Sign out everywhere ───────────────────────────────────────────────
    if (op === "sign_out_everywhere") {
      const { data, error } = await db.rpc("account_admin_sign_out_everywhere", {
        p_agent_id: agentId,
        p_audit_id: uuidV7(),
        p_client_id: clientId,
        ...audit(ctx),
      });
      if (error) throw new Error(`sign out failed: ${error.message}`);
      if (data === null) throw notFound("No such client, or they haven't signed in yet.");
      return json({ outcome: "changed", sessionsEnded: data });
    }

    // ── 3.9.6 Flag / unflag ───────────────────────────────────────────────
    if (!isUuid(payload.authEventId)) throw badRequest("authEventId must be a uuid.");
    const { data, error } = await db.rpc("account_admin_set_flag", {
      p_agent_id: agentId,
      p_audit_id: uuidV7(),
      p_client_id: clientId,
      p_auth_event_id: payload.authEventId,
      p_flag: op === "flag",
      ...audit(ctx),
    });
    if (error) throw new Error(`flag failed: ${error.message}`);
    if (data === "not_found") throw notFound("No such sign-in.");
    return json({ outcome: data });
  } catch (err) {
    return problem(err);
  }
});
