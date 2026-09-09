/**
 * Turn a search result into a trip in `inquiry` status. Screen 2.3.8 / 2.0.4. P2.
 *
 * Roles: client.
 * Sensitive mutation: no (trip and trip_component; not on CLAUDE.md rule 3's list, but the
 * event is audited anyway — see the audit note below).
 * MFA step-up: not required.
 *
 * WHY A TRIP AND NOT A LEAD. BRD §6.5 said a quote request "creates a lead in the agent
 * workspace", and Screen Inventory 2.3.8 and §3.8.x followed from it. Gyasi's decision on
 * 2026-09-09 was Trip-direct: `trip.status` already defaults to `inquiry`, so the
 * "awaiting a quote" state needed no new entity, and the agent works one queue instead of
 * two. All four documents were amended in the same change.
 *
 * THE CONSEQUENCE IS THIS FUNCTION'S AUTH SHAPE, and it is worth naming rather than
 * discovering. `trip.client_id` is NOT NULL and `client.first_name`/`last_name` are NOT NULL
 * too, so a trip cannot be attached to somebody who has given only an email. There is no
 * anonymous path here at all: the caller must be a signed-in client, and the sign-up gate
 * (2.0.6) sits in front of the CTA rather than beside it. A visitor who will not register
 * gets the "Message Gyasi" email instead, which is a mailbox rather than a queue — the
 * accepted cost of the decision, recorded in BRD §6.5.
 *
 * WHY THE SERVICE ROLE. `20260907113546_revoke_write_grants.sql` removed write grants from
 * client roles, so a PostgREST insert would match nothing and return 204 — looking like it
 * worked. The caller is resolved from their own verified token and the client row is read
 * back before anything is written; the service role is used to write, not to decide.
 *
 * MONEY STAYS ZERO. A hotel result carries an indicative nightly rate from Google. It is
 * NOT a quote and must not become one: `cost_cents` and `commission_cents` are left at their
 * zero defaults, because they roll into `trip.total_value_cents` and from there into
 * commission forecasting. The provider's figure is kept in `trip_component.payload` under a
 * name that says what it is, so Gyasi can see what the traveler was looking at without the
 * platform ever having claimed it was a price.
 */
import { requireRole, requireUser } from "../_shared/auth.ts";
import type { Database } from "../_shared/database.types.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, notFound, problem } from "../_shared/problem.ts";
import { serviceClient } from "../_shared/db.ts";
import { parseBody } from "../_shared/quote.ts";
import { readJson, requireClientId } from "../_shared/trip.ts";
import { uuidV7 } from "../_shared/uuid.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    // Agents and admins have their own way into the trip builder (3.4.x); this is the
    // traveler-facing path and a trip it creates belongs to the caller.
    requireRole(ctx, "client");
    const clientId = requireClientId(ctx);

    const payload = await readJson(req);
    const input = parseBody(payload);

    const db = serviceClient();

    // The agent is read from the client rather than taken from the request: `trip.agent_id`
    // is denormalized from `client.agent_id` (Data-Model §19.1), and letting a caller name
    // their own agent would be a way to put a trip in somebody else's workspace.
    const { data: client, error: clientError } = await db
      .from("client")
      .select("id, agent_id, first_name")
      .eq("id", clientId)
      .maybeSingle();

    if (clientError) throw new Error(`client lookup failed: ${clientError.message}`);
    if (!client) throw notFound("No client record for this account.");

    const tripId = input.tripId;
    const componentId = uuidV7();

    const { error: tripError } = await db.from("trip").insert({
      id: tripId,
      client_id: client.id,
      agent_id: client.agent_id,
      title: input.title,
      trip_type: input.tripType,
      // `status` is left to its DEFAULT of 'inquiry' on purpose: that default IS the
      // "awaiting a quote" state this whole decision turned on, and naming it here would
      // create a second place to change it.
      start_date: input.checkIn,
      end_date: input.checkOut,
      destinations: input.destinations,
      traveler_count: input.travelers,
      notes: input.note,
    });

    if (tripError) {
      // A duplicate id means the client retried a submission — the trip already exists and
      // saying so is friendlier than a 500 and safer than a second trip.
      if (tripError.code === "23505") throw badRequest("That request has already been sent.");
      throw new Error(`trip insert failed: ${tripError.message}`);
    }

    const { error: componentError } = await db.from("trip_component").insert({
      id: componentId,
      trip_id: tripId,
      kind: input.kind,
      display_name: input.displayName,
      start_date: input.checkIn,
      end_date: input.checkOut,
      location: input.location,
      // cost_cents and commission_cents keep their zero defaults. See the header.
      payload: input.snapshot as Database["public"]["Tables"]["trip_component"]["Insert"]["payload"],
      api_source: input.apiSource,
      api_reference: input.apiReference,
    });

    // The trip is the thing the traveler asked for and the thing Gyasi works from; a missing
    // component is a poorer inquiry, not a failed one. Logged rather than rolled back,
    // because there is no transaction across these two round trips (the same limitation
    // trip-message documents) and losing the trip would be the worse outcome.
    if (componentError) {
      console.error("[quote-request] component insert failed", { code: componentError.code });
    }

    await writeAuditEvent(ctx, {
      eventType: "trip.inquiry_created",
      targetEntity: "trip",
      targetId: tripId,
      metadata: {
        kind: input.kind,
        apiSource: input.apiSource,
        // Deliberately not the snapshot: an audit row is a trail, not a copy of the payload.
        componentWritten: !componentError,
      },
    });

    return new Response(JSON.stringify({ tripId, status: "inquiry" }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return problem(err);
  }
});
