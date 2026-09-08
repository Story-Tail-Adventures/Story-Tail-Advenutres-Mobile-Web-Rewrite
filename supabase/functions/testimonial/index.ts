/**
 * Save or submit a client's reflection on a trip. Screen 2.2.11.
 *
 * WHY THIS IS A FUNCTION and not an insert. `testimonial` has no client write policy, for
 * two reasons that are both about the state machine:
 *
 *   1. Every mutation needs an `audit_event` (CLAUDE.md rule 3), and a PostgREST insert
 *      carries none.
 *   2. A CLIENT MAY ONLY EVER REACH `draft` AND `submitted`. `approved` and `published` are
 *      agent actions arriving with §3.x, and the whole point of modelling this entity with
 *      an approval gate was that nothing reaches a public surface without an explicit
 *      `approved_at`. If a client could write `status` directly, the gate would be a
 *      suggestion. The table's own CHECK constraints are the backstop — they refuse a
 *      `published_at` with no `approved_at` — so a bug here fails loudly rather than
 *      quietly publishing somebody's words.
 *
 * THE ROW IS FOUND BY TRIP, NOT BY THE ID THE CLIENT SENT. `testimonial_client_trip` is a
 * unique index on `(client_id, trip_id)` and its own migration comment says why: "a second
 * reflection on the same trip is an edit, not a new row." So a client returning to 2.2.11
 * on a device that has forgotten its draft id must land on the reflection that already
 * exists, not mint a second one — which is precisely what an id-keyed upsert did, colliding
 * on that index and 500ing. The supplied `testimonialId` is used only when there is no row
 * for the trip yet, which is also the only case where its recency matters.
 *
 * A reflection with no `trip_id` is outside that index (it is partial, `WHERE trip_id IS NOT
 * NULL`) and is keyed by id alone — a traveler may write more than one of those.
 *
 * SUBMITTING IS ONE-WAY. Once it leaves `draft` the body is frozen: Gyasi may already have
 * read it, and silently editing text he has seen — or worse, text already approved and
 * quoted on a public surface — is not something a client-facing screen should be able to do.
 * The screen renders the submitted state as read-only for the same reason.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, forbidden, notFound, problem } from "../_shared/problem.ts";
import { assertRecentUuidV7, isUuid } from "../_shared/uuid.ts";
import { readJson, requireClientId, requireOwnedTrip, tripDb } from "../_shared/trip.ts";

const MAX_BODY = 4000;
const MAX_ATTRIBUTION = 120;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    const clientId = requireClientId(ctx);
    const payload = await readJson(req);

    const suppliedId = str(payload.testimonialId);
    if (!suppliedId) throw badRequest("Pass testimonialId.");
    // Shape only, here. The RECENCY check comes later and only for a row being created —
    // see the note there — but the lookup below queries by this id, so a non-uuid has to be
    // refused before it reaches Postgres.
    if (!isUuid(suppliedId)) throw badRequest("That is not a reflection id.");

    const body = str(payload.body)?.trim();
    if (!body) throw badRequest("A reflection needs something in it.");
    if (body.length > MAX_BODY) {
      throw badRequest(`Keep the reflection under ${MAX_BODY} characters.`);
    }

    const attribution = str(payload.attribution)?.trim() || null;
    if (attribution && attribution.length > MAX_ATTRIBUTION) {
      throw badRequest(`Keep the attribution under ${MAX_ATTRIBUTION} characters.`);
    }

    const rating = payload.rating === undefined || payload.rating === null
      ? null
      : Number(payload.rating);
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      throw badRequest("A rating is a whole number from 1 to 5.");
    }

    const submit = payload.submit === true;
    const db = tripDb();

    // A reflection may be about one trip or about nothing in particular, which is why
    // `testimonial.trip_id` is nullable. When it names a trip, that trip has to be theirs —
    // otherwise this is a way to attach words to a stranger's booking.
    const tripId = str(payload.tripId) ?? null;
    let agentId: string;
    if (tripId) {
      const trip = await requireOwnedTrip(db, clientId, tripId);
      agentId = trip.agentId;
    } else {
      // No trip to inherit an agent from, so fall back to the one on their client record.
      // `agent_id` is NOT NULL on testimonial: a reflection with nobody to approve it would
      // sit in `submitted` forever.
      const { data: client, error } = await db
        .from("client")
        .select("id, agent_id")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw new Error(`client lookup failed: ${error.message}`);
      if (!client?.agent_id) throw notFound("No advisor on record.");
      agentId = client.agent_id;
    }

    // Find what is already there. Keyed by trip when there is one — see the header note on
    // `testimonial_client_trip` — and by id otherwise. Both queries are scoped to this
    // client, so a row belonging to somebody else is simply not found rather than being
    // found and then refused, which is what keeps ids unprobeable.
    const lookup = db.from("testimonial").select("id, status, submitted_at").eq("client_id", clientId);
    const { data: existing, error: findError } = await (
      tripId ? lookup.eq("trip_id", tripId) : lookup.eq("id", suppliedId)
    ).maybeSingle();
    if (findError) throw new Error(`testimonial lookup failed: ${findError.message}`);

    // Immutable once it leaves draft. Checked on STATUS and not only on `submitted_at`,
    // because an agent approving a reflection is the case that matters most and
    // `approved`/`published` are states a `submitted_at` test would let through if the
    // agent-side flow ever sets one without the other.
    if (existing && existing.status !== "draft") {
      throw forbidden("This reflection is already with Gyasi. Message him to change it.");
    }

    // The client's id is used only for a row that does not exist yet, so its recency is
    // only asserted then. Rejecting a stale id on an EDIT would lock a traveler out of
    // their own draft because the id they are carrying is older than an hour, which is
    // exactly what a returning visitor's id would be.
    const testimonialId = existing?.id ?? suppliedId;
    if (!existing) {
      try {
        assertRecentUuidV7(testimonialId);
      } catch (err) {
        throw badRequest(`testimonialId must be a recent UUID v7: ${(err as Error).message}`);
      }
    }

    const now = new Date().toISOString();
    const status = submit ? "submitted" : "draft";
    const submittedAt = submit ? now : null;

    const { error: writeError } = await db
      .from("testimonial")
      .upsert({
        id: testimonialId,
        client_id: clientId,
        trip_id: tripId,
        agent_id: agentId,
        body,
        attribution,
        rating,
        status,
        submitted_at: submittedAt,
        // Never set by this function, at any input. Listed rather than omitted so the
        // intent is on the record: these are the agent's to set, and an upsert that
        // inherited them from a client payload is the failure this whole endpoint exists
        // to prevent.
        approved_at: null,
        approved_by_user_id: null,
        published_at: null,
        updated_at: now,
      }, { onConflict: "id" });


    if (writeError) throw new Error(`testimonial write failed: ${writeError.message}`);

    await writeAuditEvent(ctx, {
      eventType: submit ? "testimonial.submitted" : "testimonial.saved",
      targetEntity: "testimonial",
      targetId: testimonialId,
      // The body is NOT in the metadata. An audit row records that somebody wrote a
      // reflection, not a second copy of what they said.
      metadata: { tripId, rating, hasAttribution: attribution !== null },
    });

    return json({ testimonialId, status, ...(submittedAt ? { submittedAt } : {}) });
  } catch (err) {
    return problem(err);
  }
});

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
