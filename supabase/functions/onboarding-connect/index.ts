/**
 * Screen 2.1.13 Connect with Agent — redeeming an invitation code.
 *
 * See docs/Screen-Inventory.md §2.1.13, docs/Data-Model.md §6.7, and
 * design/source-prototype/screens/client-auth.jsx `C2113_ConnectAgent`. P1.
 *
 * THIS IS THE MOST CONSEQUENTIAL WRITE IN §2.1. It moves account ownership: afterwards the
 * signed-in account points at a DIFFERENT client row, and every policy in the system —
 * trips, documents, payment authorizations — answers about that traveler instead. So the
 * code is treated as a bearer token for somebody's itinerary and passport details, which is
 * what it is.
 *
 * The plaintext code is never stored, never logged, never echoed back, and never put in an
 * audit row. It is hashed by `client_invite_code_hash()` — a SECURITY DEFINER function
 * whose EXECUTE is granted to the service role alone — and only the hash is compared.
 * `client_invite` itself has RLS enabled with deliberately zero policies, so no browser can
 * reach it at all.
 *
 * WHY THERE IS SO MUCH MIGRATION CODE. The automatic path already ran:
 * `handle_user_email_confirmed()` adopts a matching unclaimed client the moment somebody
 * confirms their address. This screen exists for when it could not — the traveler signed up
 * with a different address, or two rows matched and the trigger deliberately claimed
 * nothing. By then the traveler has spent steps 2 through 4 filling in a profile,
 * preferences and a household, all attached to the throwaway client their sign-up created.
 * Redeeming has to bring that with them, or the reward for connecting is losing the work.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { requireUser, type AuthContext } from "../_shared/auth.ts";
import { withAudit, writeAuditEvent } from "../_shared/audit.ts";
import { badRequest, forbidden, problem } from "../_shared/problem.ts";
import {
  advanceOnboarding,
  nextStep,
  onboardingDb,
  optionalText,
  readJson,
  requireClientId,
} from "../_shared/onboarding.ts";
import type { Db } from "../_shared/db.ts";
import type { TablesUpdate } from "../_shared/database.types.ts";

/**
 * What went wrong, in the vocabulary the audit trail uses.
 *
 * Every attempt writes one of these, success or failure — Data-Model §6.7 asks for it, and
 * it is also the only place a rate limit can count from today.
 */
type Outcome =
  | "ok"
  | "unknown"
  | "expired"
  | "revoked"
  | "used"
  | "already_connected"
  | "claimed_by_another"
  | "rate_limited";

/**
 * A code is six characters of a 36-symbol alphabet, so guessing is expensive but not
 * impossible over enough tries. Ten attempts a quarter-hour makes it hopeless without
 * inconveniencing anybody retyping a code off a printed email.
 *
 * WHAT THIS DOES NOT STOP, said plainly: the window is scoped to the signed-in account, and
 * accounts are cheap — sign up, confirm, get ten more. `enable_confirmations = true` and
 * GoTrue's own signup throttling make that slow rather than impossible, so the real budget
 * against one invite is ten times however many mailboxes somebody can work through, against
 * a space of about two billion. That is still hopeless, but it is a different sentence from
 * "ten tries, ever". Counting by target as well as by actor is the fix if invite codes ever
 * get shorter or the space gets smaller.
 */
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MINUTES = 15;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    const currentClientId = requireClientId(ctx);
    const body = await readJson(req);
    const db = onboardingDb();

    const code = optionalText(body, "code");

    // "I don't have a code" is a first-class exit and writes nothing but the cursor.
    if (code === undefined || code === null) {
      if (body.advance === true) {
        await advanceOnboarding(db, ctx.platformUserId, nextStep("connect"));
      }
      return ok({ redeemed: false });
    }

    const outcome = await redeem(db, ctx, currentClientId, code);

    if (outcome !== "ok") {
      // Recorded before the refusal is returned, so a burst of guesses is countable.
      await recordAttempt(ctx, outcome);
      throw refusal(outcome);
    }

    if (body.advance === true) {
      await advanceOnboarding(db, ctx.platformUserId, nextStep("connect"));
    }
    return ok({ redeemed: true });
  } catch (err) {
    return problem(err);
  }
});

function ok(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Why the code did not work, said plainly.
 *
 * SPECIFIC, and that is a considered departure from how the sign-in screen behaves. There,
 * "no such account" and "wrong password" must be indistinguishable, because an email
 * address is guessable from outside knowledge and confirming one exists is most of the
 * attack. A code is not like that: it is six characters of a 36-symbol alphabet, so the
 * space is around two billion, and the ten-attempts-per-quarter-hour limit above puts a
 * brute-force search comfortably past the heat death of the invitation. Enumeration is not
 * the live risk here.
 *
 * What IS live is a traveler whose invitation has been sitting in an inbox for five weeks.
 * Told only "that code isn't working", they will retype it correctly, be told the same
 * thing, and have no idea that what they actually need is a fresh code. The kind answer and
 * the safe answer are the same answer.
 */
function refusal(outcome: Outcome): Error {
  switch (outcome) {
    case "expired":
      return badRequest(
        "That code has expired. Message Gyasi and he'll send you a fresh one.",
      );
    case "used":
      return badRequest(
        "That code has already been used. If that wasn't you, message Gyasi and he'll " +
          "sort it out.",
      );
    case "revoked":
      return badRequest(
        "That code is no longer active. Message Gyasi and he'll send you a fresh one.",
      );
    case "already_connected":
      return badRequest(
        "You're already linked up with Gyasi, so this code isn't needed. If something's " +
          "missing, message him and he'll sort it out.",
      );
    case "claimed_by_another":
      // Deliberately vaguer than the rest. The specific truth — "another account already
      // holds that traveler record" — is a fact about somebody else's account, and the
      // person who needs to untangle it is Gyasi rather than whoever is typing.
      return badRequest(
        "That code can't be used on this account. Message Gyasi and he'll sort it out.",
      );
    case "rate_limited":
      return forbidden(
        "That's a few tries in a row. Give it fifteen minutes, or message Gyasi and he'll " +
          "link it for you.",
      );
    default:
      return badRequest(
        "That code didn't match anything. Check the invitation email — codes look like " +
          "STA-7HX2J9.",
      );
  }
}

/**
 * One audit row per attempt, carrying the outcome and never the code or its hash.
 *
 * `targetId` is the account doing the trying rather than an invite, because most failures
 * have no invite to name — an unknown code matched nothing, and recording which row a
 * guess ALMOST hit would be the leak the uniform refusal exists to prevent.
 */
async function recordAttempt(ctx: AuthContext, outcome: Outcome): Promise<void> {
  await writeAuditEvent(ctx, {
    eventType: "client_invite.redeem_attempted",
    targetEntity: "client_invite",
    targetId: ctx.platformUserId,
    metadata: { outcome },
  });
}

async function tooManyAttempts(db: Db, ctx: AuthContext): Promise<boolean> {
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60_000).toISOString();
  const { count, error } = await db
    .from("audit_event")
    .select("id", { count: "exact", head: true })
    .eq("actor_user_id", ctx.platformUserId)
    .eq("event_type", "client_invite.redeem_attempted")
    // A refusal is not an attempt against a code. Counting them would mean each retry after
    // the limit extends the lockout, so somebody who trips it once by mistyping is held out
    // for as long as they keep asking — the row is still written, because a burst of them
    // is exactly what an operator wants to see, it just does not feed the counter.
    .neq("metadata->>outcome", "rate_limited")
    .gte("created_at", since);
  // Fail CLOSED on a counting error: the alternative is a broken rate limit that nobody
  // notices, on the one endpoint where guessing is the attack.
  if (error) throw new Error(`attempt count failed: ${error.message}`);
  return (count ?? 0) >= MAX_ATTEMPTS;
}

async function redeem(
  db: Db,
  ctx: AuthContext,
  currentClientId: string,
  code: string,
): Promise<Outcome> {
  if (await tooManyAttempts(db, ctx)) return "rate_limited";

  const { data: hashed, error: hashError } = await db.rpc("client_invite_code_hash", {
    p_code: code,
  });
  if (hashError) throw new Error(`code hash failed: ${hashError.message}`);
  const codeHash = hashed as unknown as string;

  const { data: invite, error: readError } = await db
    .from("client_invite")
    .select("id, client_id, expires_at, accepted_at, revoked_at")
    .eq("code_hash", codeHash)
    .maybeSingle();
  if (readError) throw new Error(`invite read failed: ${readError.message}`);

  if (!invite) return "unknown";
  if (invite.revoked_at) return "revoked";
  if (invite.accepted_at) return "used";
  if (new Date(invite.expires_at).getTime() <= Date.now()) return "expired";

  const targetClientId = invite.client_id;
  if (targetClientId === currentClientId) return "already_connected";

  // Somebody else's account already holds the target. The partial unique index
  // platform_user_client would refuse the UPDATE anyway; catching it here turns a
  // constraint error into an answer.
  const { data: holder, error: holderError } = await db
    .from("platform_user")
    .select("id")
    .eq("client_id", targetClientId)
    .maybeSingle();
  if (holderError) throw new Error(`holder read failed: ${holderError.message}`);
  if (holder) return "claimed_by_another";

  await migrate(db, ctx, currentClientId, targetClientId, invite.id);
  return "ok";
}

/**
 * Move the account, and everything the traveler entered, onto the target client.
 *
 * NOT ATOMIC, and that is worth naming rather than implying. These are separate PostgREST
 * round trips; a failure partway leaves the account still pointing at the throwaway with
 * some children already moved, and the traveler can retry — the invite is only marked
 * accepted at the very end, so a half-finished redemption is a retryable one rather than a
 * burnt code. Doing it properly means one plpgsql function called over RPC, which is the
 * right shape for this and is worth having before the first booking depends on it.
 *
 * The ORDER is chosen so that every intermediate state is recoverable: children first,
 * then the profile fields, then the account pointer, then the invite, then the cleanup.
 */
async function migrate(
  db: Db,
  ctx: AuthContext,
  fromClientId: string,
  toClientId: string,
  inviteId: string,
): Promise<void> {
  const migrated: Record<string, number> = {};

  migrated.travel_preference = await mergePreferences(db, ctx, fromClientId, toClientId);
  migrated.companion = await repoint(db, "companion", fromClientId, toClientId);
  migrated.travel_document = await repoint(db, "travel_document", fromClientId, toClientId);

  const fields = await rescueClientFields(db, ctx, fromClientId, toClientId);

  // The agent's spelling of the name wins, the same precedent handle_user_email_confirmed()
  // sets: somebody who typed "maya carter" into a sign-up form should still be greeted as
  // Maya Carter, because that is what Gyasi has been calling them in email for weeks.
  const { data: target, error: nameError } = await db
    .from("client")
    .select("first_name, last_name")
    .eq("id", toClientId)
    .single();
  if (nameError) throw new Error(`target read failed: ${nameError.message}`);

  const { error: moveError } = await db
    .from("platform_user")
    .update({
      client_id: toClientId,
      display_name: `${target.first_name} ${target.last_name}`.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.platformUserId);
  if (moveError) throw new Error(`account move failed: ${moveError.message}`);

  const { data: accepted, error: acceptError } = await db
    .from("client_invite")
    .update({ accepted_at: new Date().toISOString(), accepted_account_id: ctx.accountId })
    .eq("id", inviteId)
    // Only if still unaccepted: two tabs, or one impatient double-click, must not both win.
    .is("accepted_at", null)
    // `.select()` is load-bearing. PostgREST does NOT error on an update that matches zero
    // rows, so without it `acceptError` is null whether this claimed the invite or lost the
    // race — and the loser would carry on to write a second `client_invite.redeemed` audit
    // row for a redemption that never happened.
    .select("id");
  if (acceptError) throw new Error(`invite accept failed: ${acceptError.message}`);
  if (!accepted || accepted.length === 0) {
    throw refusal("used");
  }

  await disposeOf(db, ctx, fromClientId);

  await writeAuditEvent(ctx, {
    eventType: "client_invite.redeemed",
    targetEntity: "client",
    targetId: toClientId,
    // Ids and counts, never the code, never its hash, never a field VALUE.
    metadata: {
      source: "onboarding-connect",
      from_client_id: fromClientId,
      migrated,
      client_fields: fields,
    },
  });
}

/**
 * `travel_preference` is 1:1 — `client_id` is UNIQUE — so a blind re-point raises 23505.
 *
 * When the target has no row, the traveler's simply moves across. When it has one, the two
 * are MERGED rather than one of them thrown away. The first draft deleted the target's, on
 * the reasoning that it was an agent-created row nobody had run a wizard against — but
 * Screen Inventory §3.3.9 lets an agent fill preferences in directly, so that row can hold
 * dietary needs Gyasi took down over the phone. Losing those to a code redemption would be
 * a bad way to find out.
 *
 * The merge rule is the same "never overwrite" as `rescueClientFields`: the target keeps
 * everything it has, and only what it is missing is filled in. An empty array counts as
 * missing, which is exactly what the `none` sentinel exists to distinguish it from.
 */
async function mergePreferences(
  db: Db,
  ctx: AuthContext,
  fromClientId: string,
  toClientId: string,
): Promise<number> {
  const columns =
    "id, preferred_destinations, travel_styles, dietary_restrictions, dietary_notes, accessibility_needs, accessibility_notes, loyalty_programs, budget_band, favorite_past_trips";

  const [{ data: from, error: fromError }, { data: to, error: toError }] = await Promise.all([
    db.from("travel_preference").select(columns).eq("client_id", fromClientId).maybeSingle(),
    db.from("travel_preference").select(columns).eq("client_id", toClientId).maybeSingle(),
  ]);
  if (fromError) throw new Error(`preference read failed: ${fromError.message}`);
  if (toError) throw new Error(`target preference read failed: ${toError.message}`);

  if (!from) return 0;
  if (!to) return repoint(db, "travel_preference", fromClientId, toClientId);

  // Typed against the generated row rather than an open index signature: the client's
  // excess-property check rejects the latter with an error about `never`, and typing it
  // properly is what stops a typo'd column reaching Postgres as a silent no-op.
  const patch: TablesUpdate<"travel_preference"> = {};
  for (const key of Object.keys(from)) {
    if (key === "id") continue;
    const mine = (from as Record<string, unknown>)[key];
    const theirs = (to as Record<string, unknown>)[key];
    const theirsEmpty =
      theirs === null || (Array.isArray(theirs) && theirs.length === 0);
    const mineHasSomething =
      mine !== null && !(Array.isArray(mine) && mine.length === 0);
    if (theirsEmpty && mineHasSomething) {
      (patch as Record<string, unknown>)[key] = mine;
    }
  }

  const fields = Object.keys(patch).sort();
  if (fields.length > 0) {
    patch.updated_at = new Date().toISOString();
    const { error } = await db.from("travel_preference").update(patch).eq("id", to.id);
    if (error) throw new Error(`preference merge failed: ${error.message}`);
  }

  // Column names only — two of these hold health-adjacent answers.
  await writeAuditEvent(ctx, {
    eventType: "travel_preference.updated",
    targetEntity: "travel_preference",
    targetId: to.id,
    metadata: { source: "onboarding-connect", reason: "invite_redeemed", fields },
  });

  const { error: dropError } = await db
    .from("travel_preference")
    .delete()
    .eq("id", from.id);
  if (dropError) throw new Error(`preference cleanup failed: ${dropError.message}`);

  return fields.length > 0 ? 1 : 0;
}

/** Move every row of `table` from one client to the other. Returns how many moved. */
async function repoint(
  db: Db,
  table: "travel_preference" | "companion" | "travel_document",
  fromClientId: string,
  toClientId: string,
): Promise<number> {
  const { data, error } = await db
    .from(table)
    .update({ client_id: toClientId })
    .eq("client_id", fromClientId)
    .select("id");
  if (error) throw new Error(`${table} repoint failed: ${error.message}`);
  return data?.length ?? 0;
}

/**
 * Copy what the traveler entered onto the target, but only where the target has nothing.
 *
 * Never overwrite: the agent has had this record for weeks and may have better information
 * than a sign-up form. What this rescues is the half-hour of typing the traveler just did
 * on steps 2 and 3, which would otherwise be attached to a row about to be deleted.
 *
 * `client` is a rule-3 sensitive table, so the write is audited — with the names of the
 * fields that moved and none of their contents.
 */
async function rescueClientFields(
  db: Db,
  ctx: AuthContext,
  fromClientId: string,
  toClientId: string,
): Promise<string[]> {
  const columns = "phone, date_of_birth, emergency_contact, mailing_address_id, preferred_name";

  const [{ data: from, error: fromError }, { data: to, error: toError }] = await Promise.all([
    db.from("client").select(columns).eq("id", fromClientId).single(),
    db.from("client").select(columns).eq("id", toClientId).single(),
  ]);
  if (fromError) throw new Error(`throwaway read failed: ${fromError.message}`);
  if (toError) throw new Error(`target read failed: ${toError.message}`);

  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(from) as (keyof typeof from)[]) {
    if (from[key] !== null && to[key] === null) patch[key] = from[key];
  }
  const fields = Object.keys(patch).sort();
  if (fields.length === 0) return fields;

  await withAudit(
    ctx,
    {
      eventType: "client.updated",
      targetEntity: "client",
      targetId: toClientId,
      metadata: { source: "onboarding-connect", reason: "invite_redeemed", fields },
    },
    async () => {
      const { error } = await db
        .from("client")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", toClientId);
      if (error) throw new Error(`client rescue failed: ${error.message}`);
    },
  );

  // The throwaway's pointer is dropped AFTER the target holds it, and this order is the
  // whole point. Doing it the other way round — which this did until review — put a crash
  // window between "neither client references the address" and "the target does": on
  // retry, `from.mailing_address_id` reads null, the loop below drops it from the patch,
  // and where somebody lives is gone with no error and no audit line. Two clients pointing
  // at one address for a moment is recoverable; nought pointing at it is not.
  //
  // (There is no cascade on `client.mailing_address_id`, so `disposeOf` deleting the
  // throwaway never touches `address` either way. The unlink is tidiness, not safety.)
  if ("mailing_address_id" in patch) {
    const { error } = await db
      .from("client")
      .update({ mailing_address_id: null })
      .eq("id", fromClientId);
    if (error) throw new Error(`address unlink failed: ${error.message}`);
  }

  return fields;
}

/**
 * Get rid of the client row the sign-up made.
 *
 * Delete, falling back to archive on a foreign key — exactly what
 * `handle_user_email_confirmed()` does, and for the same reason: a traveler being unable to
 * finish connecting would be far worse than a stray archived row.
 */
async function disposeOf(db: Db, ctx: AuthContext, throwawayId: string): Promise<void> {
  // Audited HERE rather than described afterwards in the redemption summary. `client` is one
  // of CLAUDE.md rule 3's four named tables, and this sequence is not transactional: if the
  // closing summary write fails, or the process dies in between, a client row would have
  // been deleted with no record of it anywhere. The audit has to sit with the deletion.
  await withAudit(
    ctx,
    {
      eventType: "client.disposed",
      targetEntity: "client",
      targetId: throwawayId,
      metadata: { source: "onboarding-connect", reason: "invite_redeemed" },
    },
    async () => {
      const { error } = await db.from("client").delete().eq("id", throwawayId);
      if (!error) return;
      if (error.code !== "23503") {
        throw new Error(`throwaway delete failed: ${error.message}`);
      }

      const { error: archiveError } = await db
        .from("client")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", throwawayId);
      if (archiveError) {
        throw new Error(`throwaway archive failed: ${archiveError.message}`);
      }
    },
  );
}
