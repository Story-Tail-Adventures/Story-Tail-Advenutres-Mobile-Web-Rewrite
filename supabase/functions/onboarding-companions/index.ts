/**
 * Screen 2.1.12 Travel Companions — the write path.
 *
 * See docs/Screen-Inventory.md §2.1.12 and
 * design/source-prototype/screens/client-auth.jsx `C2112_Companions`. P1.
 *
 * Add, edit and remove the people a traveler usually travels with. An Edge Function for the
 * usual reason: `companion` grants SELECT only to `authenticated` and has no write policy,
 * so a browser write would match nothing and report success.
 *
 * OWNERSHIP IS RE-CHECKED, NEVER TRUSTED. Edit and remove carry a companion id from the
 * browser, and `companion.client_id` is the only thing scoping a companion into an agent's
 * book of business (Data-Model §19.1). Every statement therefore carries
 * `.eq("client_id", clientId)` alongside the id — a service-role update matched on id alone
 * would let anybody who guesses a uuid rewrite a stranger's traveler record.
 *
 * NO PASSPORT NUMBER, for the same reason 2.1.10 collects none: `passport_number_encrypted`
 * is bytea that Data-Model §18.2 wants encrypted under a backend-held key, and nothing
 * implements that yet. Expiry and issuing country are plaintext columns, are what drive the
 * renewal reminders, and are collected. That also closes a second problem the screen would
 * otherwise have: the column is outside the client's SELECT grant, so the surface cannot
 * even ask whether a number is on file, let alone show one.
 *
 * EDIT IS A FULL REPLACE, and that is a deliberate difference from `onboarding-profile`,
 * which treats an absent key as "leave it alone". A companion is edited through a form that
 * shows every one of its fields at once, so a field arriving empty means the traveler
 * cleared it — "Sam no longer has a passport on file" has to be sayable. Any caller that
 * sends a partial body will blank what it omitted.
 *
 * REMOVE ARCHIVES, IT DOES NOT DELETE. `companion` has always been on the Data-Model §20.1
 * soft-delete list; the column arrived late, in 20260904132811. Hard deleting would also
 * have started raising a foreign-key violation the day `travel_document.companion_id` is
 * first written, because that reference has no ON DELETE clause.
 *
 * IT IS AUDITED, even though CLAUDE.md rule 3 names four sensitive tables and this is not
 * one of them. `onboarding-preferences` is audited on Data-Model §20.3's "every write to a
 * tracked table", and the argument is stronger here rather than weaker: a companion's date
 * of birth and passport details belong to a THIRD PARTY who has no account, cannot see what
 * is held about them, and never agreed to any of it. Field names only, never values — the
 * table is append-only, kept seven years, and §18.5 exempts it from erasure.
 *
 * NO PLATFORM INVITE. Screen-Inventory §2.1.12 lists "option to invite them to the platform",
 * and it cannot be honoured yet: `companion` has no email column, `client_invite.client_id`
 * is NOT NULL and FKs to `client`, and `client.agent_id` is NOT NULL — so a client-initiated
 * invite would silently write a new record into an agent's book. Setting
 * `is_invited_to_platform` without the workflow behind it only puts a lie in the database.
 * Deferred to P3 alongside agent-side invite issuance.
 */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
import { requireUser, type AuthContext } from "../_shared/auth.ts";
import { withAudit } from "../_shared/audit.ts";
import { badRequest, notFound, problem } from "../_shared/problem.ts";
import { isUuid, uuidV7 } from "../_shared/uuid.ts";
import {
  advanceOnboarding,
  nextStep,
  onboardingDb,
  optionalCountry,
  optionalDate,
  optionalText,
  readJson,
  requireClientId,
} from "../_shared/onboarding.ts";
import type { Db } from "../_shared/db.ts";

const NAME_MAX = 80;
const RELATIONSHIP_MAX = 40;
/** Enough for a household. Past this, an agent should be doing the adding. */
const MAX_COMPANIONS = 12;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    const clientId = requireClientId(ctx);
    const body = await readJson(req);
    const db = onboardingDb();

    const action = optionalText(body, "action") ?? "add";
    let id: string | null = null;

    if (action === "remove") {
      id = await removeCompanion(db, clientId, requireId(body), ctx);
    } else if (action === "add" || action === "edit") {
      id = await saveCompanion(db, clientId, body, action, ctx);
    } else if (action !== "none") {
      throw badRequest("action must be add, edit, remove or none.");
    }

    // "Save & continue" with nothing left to add posts `action: "none"` — the list is
    // already complete, and the only thing left to do is move the cursor.
    if (body.advance === true) {
      await advanceOnboarding(db, ctx.platformUserId, nextStep("companions"));
    }

    return new Response(JSON.stringify({ ok: true, id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return problem(err);
  }
});

/**
 * A uuid, or a 400.
 *
 * The predicate itself moved to `_shared/uuid.ts` when the §2.2 functions turned out to
 * have been written without it — see `isUuid` there for the reasoning this comment used to
 * carry alone.
 */
function requireId(body: Record<string, unknown>): string {
  const id = optionalText(body, "id");
  if (!id) throw badRequest("This action needs the companion's id.");
  if (!isUuid(id)) throw badRequest("That is not a companion id.");
  return id;
}

interface CompanionInput {
  first_name: string;
  last_name: string;
  relationship: string | null;
  date_of_birth: string | null;
  passport_expiry: string | null;
  passport_country: string | null;
  updated_at: string;
}

function parseCompanion(body: Record<string, unknown>): CompanionInput {
  const firstName = optionalText(body, "firstName");
  const lastName = optionalText(body, "lastName");
  // NOT NULL in the DDL, and an all-whitespace name would otherwise reach Postgres as a
  // constraint violation the caller cannot read.
  if (!firstName || !lastName) {
    throw badRequest("A companion needs a first and a last name.");
  }
  if (firstName.length > NAME_MAX || lastName.length > NAME_MAX) {
    throw badRequest(`A name is at most ${NAME_MAX} characters.`);
  }

  const relationship = optionalText(body, "relationship") ?? null;
  if (relationship && relationship.length > RELATIONSHIP_MAX) {
    throw badRequest(`A relationship is at most ${RELATIONSHIP_MAX} characters.`);
  }

  // Refused loudly rather than dropped: a caller that sends a passport number needs to know
  // it was not stored, not discover later that it never was.
  if ("passportNumber" in body) {
    throw badRequest(
      "Passport numbers are not accepted yet — send only passportExpiry and passportCountry.",
    );
  }

  return {
    first_name: firstName,
    last_name: lastName,
    relationship,
    date_of_birth: optionalDate(body, "dateOfBirth") ?? null,
    passport_expiry: optionalDate(body, "passportExpiry") ?? null,
    passport_country: optionalCountry(body, "passportCountry") ?? null,
    updated_at: new Date().toISOString(),
  };
}

async function saveCompanion(
  db: Db,
  clientId: string,
  body: Record<string, unknown>,
  action: string,
  ctx: AuthContext,
): Promise<string> {
  const row = parseCompanion(body);
  const editing = action === "edit";
  // The id has to exist before the audit wrapper does, because the audit row names it.
  const id = editing ? requireId(body) : uuidV7();

  await withAudit(
    ctx,
    {
      eventType: editing ? "companion.updated" : "companion.created",
      targetEntity: "companion",
      targetId: id,
      // Column names, never values: a companion's date of birth belongs to somebody who
      // cannot see what is held about them.
      metadata: { source: "onboarding-companions", fields: Object.keys(row).sort() },
    },
    async () => {
      if (editing) {
        // `client_id` in the predicate, not just `id`. This runs as the service role, so it
        // is the only thing between a guessed uuid and somebody else's traveler record.
        const { data, error } = await db
          .from("companion")
          .update(row)
          .eq("id", id)
          .eq("client_id", clientId)
          .is("archived_at", null)
          .select("id")
          .maybeSingle();
        if (error) throw new Error(`companion update failed: ${error.message}`);
        // Deliberately the same answer whether the row belongs to somebody else or does not
        // exist: distinguishing them would confirm that a guessed uuid is real.
        if (!data) throw notFound("That companion is not on your list.");
        return;
      }

      // Advisory, and the trigger added in 20260904132811 is what makes it true — a count
      // and an insert are two round trips, so two tabs can both read eleven. This exists to
      // turn that into a sentence somebody can read instead of a constraint violation.
      const { count, error: countError } = await db
        .from("companion")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .is("archived_at", null);
      if (countError) throw new Error(`companion count failed: ${countError.message}`);
      if ((count ?? 0) >= MAX_COMPANIONS) {
        throw badRequest(
          `That is as many companions as we can hold — up to ${MAX_COMPANIONS}.`,
        );
      }

      // Minted here rather than in the browser. Data-Model §21.6 wants client-side v7 uuids
      // for OFFLINE drafts; a form post has no offline concern, and accepting an id from a
      // caller is one more thing to validate for nothing.
      const { error } = await db
        .from("companion")
        .insert({ id, client_id: clientId, ...row });
      if (error) throw new Error(`companion insert failed: ${error.message}`);
    },
  );

  return id;
}

/**
 * Archived, not deleted — Data-Model §20.1 lists `companion` in the soft-delete set.
 *
 * Idempotent, and the same 200 whether the row was theirs, was already archived, or never
 * existed: a different answer for a stranger's id would confirm that a guessed uuid is
 * real, and somebody who asked for a row to be gone and finds it gone got what they wanted.
 */
async function removeCompanion(
  db: Db,
  clientId: string,
  id: string,
  ctx: AuthContext,
): Promise<string> {
  await withAudit(
    ctx,
    {
      eventType: "companion.archived",
      targetEntity: "companion",
      targetId: id,
      metadata: { source: "onboarding-companions" },
    },
    async () => {
      const { error } = await db
        .from("companion")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id)
        .eq("client_id", clientId)
        .is("archived_at", null);
      if (error) throw new Error(`companion archive failed: ${error.message}`);
    },
  );
  return id;
}
