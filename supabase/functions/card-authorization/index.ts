/**
 * Bind a stored card to a trip with a spending limit, and take that binding back.
 * Screens 2.4.3 (authorize), 2.4.4 (its confirmation) and 2.4.7 (revoke).
 *
 * THIS IS THE FIRST FINANCIAL MUTATION IN THE CODEBASE, and it is the reason CLAUDE.md rule
 * 3 exists: `card_authorization` is one of the four tables that rule names by hand. Both
 * actions write an `audit_event`.
 *
 * ONE FUNCTION, TWO ACTIONS, for the same reason `trip-message` ends up with three
 * addressing modes: create and revoke need the identical ownership proof — this card is
 * yours, this authorization hangs off a card of yours — and a second function would be a
 * second place for that proof to drift. The action is explicit in the body rather than
 * inferred from which fields are present, because "guess what the caller meant" is how a
 * revoke ends up looking like a create with missing fields.
 *
 * WHAT IT REFUSES, all checked explicitly — this runs on the service role, so RLS is
 * checking nothing:
 *   * a card that is not the caller's, or does not exist — one answer for both
 *   * a card that is not `active` (a revoked or expired card cannot be newly authorized)
 *   * a trip that is not the caller's
 *   * a limit that is not a positive whole number of cents
 *   * an expiry in the past
 *   * a second active authorization for the same card and trip — the partial unique index
 *     `card_auth_active_per_trip` enforces it, and this turns 23505 into a sentence
 *
 * WHAT IT DOES NOT DO, and this is the section's sharpest edge: it does not revoke a CARD.
 * `payment_card.status = 'revoked'` is a local write, and with no Stripe integration the
 * PaymentMethod stays live in Stripe's vault while the UI says the card is gone —
 * Data-Model §18.5 expects the Stripe Customer to be deleted on erasure. Telling a traveler
 * their card is removed when it is not is worse than not offering the button. Card-level
 * revocation arrives with 2.4.2's Stripe integration, in the change that can actually detach
 * the PaymentMethod. See the amendment at Screen-Inventory §2.4.7.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, notFound, problem } from "../_shared/problem.ts";
import { assertRecentUuidV7, isUuid } from "../_shared/uuid.ts";
import { readJson, requireClientId, tripDb } from "../_shared/trip.ts";

/**
 * $250,000. Not a business rule — a typo guard.
 *
 * A limit is entered in dollars on both stacks and sent as cents, so a missed conversion
 * arrives as a hundredfold overshoot. Rejecting it is kinder than authorizing it: the
 * traveler who meant $2,500 and sent 25000000 finds out now rather than from a statement.
 * There is no upper bound in the schema, deliberately — this is the client surface's guard,
 * and the agent side may legitimately need larger.
 */
const MAX_LIMIT_CENTS = 25_000_000;

/** Ten years. An expiry beyond this is a date-picker accident, not an intention. */
const MAX_EXPIRY_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * The mandate the traveler agrees to, snapshotted into `consent_payload`.
 *
 * FROZEN AT THE MOMENT OF CONSENT and versioned, because `consent_payload` is NOT NULL
 * precisely so the wording cannot be rewritten out from under a past agreement. Change the
 * words and you bump the version; you do not edit what somebody already agreed to.
 *
 * NOTE WHAT IT DOES NOT PROMISE. The prototype's mandate says "I'll be notified every time
 * the card is used". No dispatcher exists on either stack — no transactional email, no push,
 * and `notification_preference` is read and written by nothing. A stored consent record
 * containing an undeliverable term is a compliance artifact rather than a copy nit, so the
 * clause is cut until there is something to deliver it. It returns as version 2.
 */
const CONSENT_VERSION = 1;
const CONSENT_TEXT =
  "I authorize Story-Tail Adventures to use this card to pay suppliers for this trip, up to " +
  "the limit shown. Story-Tail does not charge me a planning or service fee.";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    const clientId = requireClientId(ctx);
    const payload = await readJson(req);
    const db = tripDb();

    const action = payload.action;
    if (action !== "create" && action !== "revoke") {
      throw badRequest('Send an action of "create" or "revoke".');
    }

    // ── Revoke ───────────────────────────────────────────────────────────────
    if (action === "revoke") {
      const authorizationId = payload.authorizationId;
      if (typeof authorizationId !== "string" || !isUuid(authorizationId)) {
        throw badRequest("That is not an authorization id.");
      }

      // Read it through the card, so ownership is proven by the same join the wallet read
      // uses rather than by trusting the id.
      const { data: existing, error: readError } = await db
        .from("card_authorization")
        .select("id, status, payment_card_id, trip_id, payment_card:payment_card_id (client_id)")
        .eq("id", authorizationId)
        .maybeSingle();

      if (readError) throw new Error(`authorization lookup failed: ${readError.message}`);
      // "No such authorization" and "not yours" are one answer, so a client cannot probe for
      // ids belonging to anybody else — the convention every §2.2 write follows.
      if (!existing || existing.payment_card?.client_id !== clientId) {
        throw notFound("No such authorization.");
      }
      // Already revoked is not an error worth a red line: the traveler asked for a state
      // that already holds, and saying so is friendlier than a 409 they cannot act on.
      if (existing.status !== "active") {
        return json({ authorizationId: existing.id, status: existing.status, changed: false });
      }

      const revokedAt = new Date().toISOString();
      const { error: updateError } = await db
        .from("card_authorization")
        .update({
          status: "revoked",
          revoked_at: revokedAt,
          revoked_by_user_id: ctx.platformUserId,
          updated_at: revokedAt,
        })
        .eq("id", existing.id)
        // Re-assert `active` in the WHERE. Two taps on a slow connection would otherwise
        // both write, and the second would overwrite revoked_by_user_id and the timestamp
        // of a revocation that already happened.
        .eq("status", "active");

      if (updateError) throw new Error(`revoke failed: ${updateError.message}`);

      await writeAuditEvent(ctx, {
        eventType: "card_authorization.revoked",
        targetEntity: "card_authorization",
        targetId: existing.id,
        metadata: { tripId: existing.trip_id, paymentCardId: existing.payment_card_id },
      });

      return json({ authorizationId: existing.id, status: "revoked", changed: true });
    }

    // ── Create ───────────────────────────────────────────────────────────────
    const { authorizationId, cardId, tripId, spendingLimitCents, expiresAt } = payload;

    // Minted by the caller so a retry is idempotent against the primary key, and checked for
    // recency per Data-Model §21.6 — `card_authorization.id` has no default.
    if (typeof authorizationId !== "string") throw badRequest("Pass an authorizationId.");
    try {
      assertRecentUuidV7(authorizationId);
    } catch {
      throw badRequest("That authorization id is not a recent UUID v7.");
    }

    if (typeof cardId !== "string" || !isUuid(cardId)) throw badRequest("That is not a card id.");
    if (typeof tripId !== "string" || !isUuid(tripId)) throw badRequest("That is not a trip id.");

    // `Number.isSafeInteger` rather than a `typeof === "number"` check: a limit arriving as
    // 2500.5 would round somewhere invisible, and a limit arriving as a string would be
    // concatenated by Postgres rather than added.
    if (!Number.isSafeInteger(spendingLimitCents) || (spendingLimitCents as number) <= 0) {
      throw badRequest("A spending limit must be a whole number of cents above zero.");
    }
    if ((spendingLimitCents as number) > MAX_LIMIT_CENTS) {
      throw badRequest("That limit looks like a mistake. Check the amount and try again.");
    }

    if (typeof expiresAt !== "string") throw badRequest("Pass an expiry.");
    const expiry = new Date(expiresAt);
    if (Number.isNaN(expiry.getTime())) throw badRequest("That expiry is not a date.");
    const now = Date.now();
    if (expiry.getTime() <= now) {
      throw badRequest("An authorization cannot expire in the past.");
    }
    if (expiry.getTime() - now > MAX_EXPIRY_MS) {
      throw badRequest("That expiry is too far away. Pick a date closer to the trip.");
    }

    // The card must be the caller's AND usable. A revoked card is still visible on 2.4.1 as
    // a record, so the picker could offer one if the screen is wrong; this is where that is
    // refused rather than trusted.
    const { data: card, error: cardError } = await db
      .from("payment_card")
      .select("id, client_id, status")
      .eq("id", cardId)
      .maybeSingle();

    if (cardError) throw new Error(`card lookup failed: ${cardError.message}`);
    if (!card || card.client_id !== clientId) throw notFound("No such card.");
    if (card.status !== "active") {
      throw badRequest("That card is no longer active. Choose another one.");
    }

    const { data: trip, error: tripError } = await db
      .from("trip")
      .select("id, client_id, archived_at")
      .eq("id", tripId)
      .maybeSingle();

    if (tripError) throw new Error(`trip lookup failed: ${tripError.message}`);
    if (!trip || trip.client_id !== clientId || trip.archived_at !== null) {
      throw notFound("No such trip.");
    }

    const { error: insertError } = await db.from("card_authorization").insert({
      id: authorizationId,
      payment_card_id: card.id,
      trip_id: trip.id,
      spending_limit_cents: spendingLimitCents as number,
      expires_at: expiry.toISOString(),
      status: "active",
      consent_payload: {
        version: CONSENT_VERSION,
        agreed_at: new Date().toISOString(),
        text: CONSENT_TEXT,
      },
    });

    if (insertError) {
      // 23505 is one of two indexes and they mean different things to a traveler. The
      // primary key means "you already sent this" — a retry, and the friendly answer is to
      // treat it as done. `card_auth_active_per_trip` means "this card is already authorized
      // for this trip", which is a real conflict they can act on.
      if (insertError.code === "23505") {
        if (insertError.message.includes("card_auth_active_per_trip")) {
          throw badRequest("That card is already authorized for this trip.");
        }
        return json({ authorizationId, status: "active", created: false });
      }
      throw new Error(`authorization insert failed: ${insertError.message}`);
    }

    // AFTER the insert, so a failed write is not recorded as an authorization that never
    // existed — but before returning, so the caller cannot hold a confirmation that is not
    // on the record. The two are not in one transaction; `_shared/audit.ts` records why and
    // dates the fix to this work.
    await writeAuditEvent(ctx, {
      eventType: "card_authorization.created",
      targetEntity: "card_authorization",
      targetId: authorizationId,
      metadata: {
        tripId: trip.id,
        paymentCardId: card.id,
        spendingLimitCents: spendingLimitCents as number,
        expiresAt: expiry.toISOString(),
        consentVersion: CONSENT_VERSION,
      },
    });

    return json({ authorizationId, status: "active", created: true }, 201);
  } catch (err) {
    return problem(err);
  }
});
