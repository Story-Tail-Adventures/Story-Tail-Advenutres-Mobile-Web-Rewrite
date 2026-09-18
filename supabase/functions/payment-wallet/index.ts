/**
 * The traveler's wallet: their cards, the authorizations on them, and the record of every
 * time one was used. Screens 2.4.1, 2.4.3's picker, 2.4.5, 2.4.6 and 2.4.7's confirmation.
 *
 * WHY THIS IS A FUNCTION AND NOT A POSTGREST READ, which is the question every other §2.x
 * read answers the other way.
 *
 * `payment_card`, `card_authorization`, `authorization_request` and `card_use_event` hold no
 * client-role privilege at all — `20260917090000_payment_domain_lockdown.sql` revoked it and
 * deliberately added no policy to replace it. That is not an oversight waiting to be fixed
 * by this function's author: `.claude/skills/rls-policy/SKILL.md` classifies three of those
 * tables service-role-only ("No `authenticated` policy whatsoever") and `card_use_event` as
 * append-only with SELECT for admins. §2.4 is the first section to need that ruling, and it
 * holds.
 *
 * The reason it holds is `payment_card`'s shape. Two of its columns —
 * `stripe_payment_method_id` and `stripe_customer_id` — are named server-only by Data-Model
 * §21.2 and by CLAUDE.md rule 4. A row-level policy cannot withhold a column; only a GRANT
 * can. So the choice was a revoke-then-column-grant like `client`'s, or no client path at
 * all. The column grant would have worked, and it was rejected for one reason: it puts the
 * safety of the two most sensitive strings in this schema in a migration nobody reads again,
 * where a later `GRANT SELECT` on the table silently widens it. Here the projection is a
 * literal list in a file that a reviewer looks at whenever this endpoint changes.
 *
 * SO: NEITHER STRIPE COLUMN IS SELECTED. Not selected-and-dropped — never named in the
 * query. `contracts/openapi.yaml` has no field for them either, and `audit-pci`'s check 3
 * greps for exactly that.
 *
 * WHAT IT CHECKS, all explicitly, because on the service role RLS is checking nothing:
 *   1. the caller is a client (an agent has no wallet and does not belong here)
 *   2. every row returned is keyed to THEIR client_id — cards directly, authorizations and
 *      use events through the card they hang off
 *
 * NO AUDIT ROW. This one is a read of the traveler's own record by the traveler, which is
 * the case Data-Model §18.3 does not ask for — unlike `trip-document-url`, where each call
 * signs a URL to a passport scan and the trail is the point. Writing an audit row per wallet
 * render would bury the agent's card-use entries, which are what that trail exists to make
 * findable.
 */
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, problem } from "../_shared/problem.ts";
import { isUuid } from "../_shared/uuid.ts";
import { requireClientId, tripDb } from "../_shared/trip.ts";

/**
 * The client-visible projection of `payment_card`. Written out rather than spread from a
 * row, so adding a column to the table cannot widen this response by accident.
 *
 * `consent_recorded_at` is here because 2.4.1 says when the card was authorized, which is
 * the traveler's own act and the thing that makes the list feel like a record rather than a
 * setting.
 */
const CARD_COLUMNS =
  "id, brand, last4, exp_month, exp_year, nickname, status, consent_recorded_at, revoked_at, revoked_reason";

/**
 * `spending_limit_cents` and `amount_used_cents` are bigint in Postgres and arrive as
 * NUMBERS through PostgREST, not strings — they are well inside the safe integer range at
 * any amount a card can hold, so no bigint-as-string handling is needed here. The §2.2
 * surface learned that the hard way in the other direction; see the note in
 * web/lib/trips/queries.ts.
 */
const AUTHORIZATION_COLUMNS =
  "id, payment_card_id, trip_id, spending_limit_cents, amount_used_cents, expires_at, status, revoked_at, created_at";

/**
 * `justification` is NOT here. Data-Model §9.4 classifies it Internal and it stays Internal:
 * it is the agent's reason, written for the audit trail. `amount_cents` IS here — §9.4 had
 * it Internal too, and that was amended on 2026-09-17, because it is the amount charged to
 * the traveler's own card and BRD §10.3 makes that transparency part of the trust posture.
 *
 * `client_flag_status` and `client_flagged_at` are omitted while the append-only conflict in
 * §9.4 is unresolved — see the amendment there. 2.4.6 renders its flag control disabled, so
 * nothing on either stack reads them yet.
 *
 * ONE STRING LITERAL, NOT A CONCATENATION — and the same goes for the two lists above.
 * supabase-js parses the column list at the TYPE level to infer the row shape, and
 * `"a, b" + "c, d"` is not a literal it can read: the whole select degrades to
 * `GenericStringError` and every field access below fails to compile. It looks like a
 * formatting preference and is not one.
 */
const USE_EVENT_COLUMNS =
  "id, card_authorization_id, payment_card_id, trip_id, supplier_name_snapshot, amount_cents, currency, reference_number, created_at";

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
    if (req.method !== "GET") throw badRequest("Use GET.");

    const ctx = await requireUser(req);
    const clientId = requireClientId(ctx);

    // Optional narrowing for 2.4.5's filters. A missing parameter means "everything of
    // mine"; a malformed one is a 400 rather than an opaque 500 from Postgres.
    const params = new URL(req.url).searchParams;
    const tripFilter = params.get("tripId");
    const cardFilter = params.get("cardId");
    if (tripFilter !== null && !isUuid(tripFilter)) throw badRequest("That is not a trip id.");
    if (cardFilter !== null && !isUuid(cardFilter)) throw badRequest("That is not a card id.");

    const db = tripDb();

    // ── Cards ────────────────────────────────────────────────────────────────
    //
    // THE ONLY QUERY IN THIS FUNCTION THAT FILTERS ON client_id, and everything below is
    // scoped by the ids it returns. That is deliberate: one place to get the ownership test
    // right, and two queries that cannot be reached with somebody else's id because the id
    // list they filter on was built from this result.
    const { data: cardRows, error: cardError } = await db
      .from("payment_card")
      .select(CARD_COLUMNS)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (cardError) throw new Error(`card lookup failed: ${cardError.message}`);

    const cards = cardRows ?? [];
    const cardIds = cards.map((c) => c.id);

    // A traveler with no cards has no authorizations and no use events either, and
    // `.in(col, [])` is a query worth not making.
    if (cardIds.length === 0) {
      return json({ cards: [], authorizations: [], events: [] });
    }

    // ── Authorizations ───────────────────────────────────────────────────────
    let authQuery = db
      .from("card_authorization")
      .select(AUTHORIZATION_COLUMNS)
      .in("payment_card_id", cardIds)
      .order("created_at", { ascending: false });
    if (tripFilter) authQuery = authQuery.eq("trip_id", tripFilter);
    if (cardFilter) authQuery = authQuery.eq("payment_card_id", cardFilter);

    const { data: authRows, error: authError } = await authQuery;
    if (authError) throw new Error(`authorization lookup failed: ${authError.message}`);

    // ── Use events ───────────────────────────────────────────────────────────
    //
    // Newest first: this is a statement, and a statement reads from the most recent charge
    // backwards. The thread in §2.2.7 is the opposite and for the opposite reason — a
    // conversation reads forwards.
    let eventQuery = db
      .from("card_use_event")
      .select(USE_EVENT_COLUMNS)
      .in("payment_card_id", cardIds)
      .order("created_at", { ascending: false });
    if (tripFilter) eventQuery = eventQuery.eq("trip_id", tripFilter);
    if (cardFilter) eventQuery = eventQuery.eq("payment_card_id", cardFilter);

    const { data: eventRows, error: eventError } = await eventQuery;
    if (eventError) throw new Error(`card use lookup failed: ${eventError.message}`);

    // Trip titles for the rows that carry a trip. Read through `trip` filtered by this
    // client, so a card_authorization pointing at somebody else's trip — which the unique
    // index makes impossible, but which this function must not depend on — yields no title
    // rather than disclosing one.
    const tripIds = [
      ...new Set(
        [
          ...(authRows ?? []).map((a) => a.trip_id),
          ...(eventRows ?? []).map((e) => e.trip_id),
        ].filter((id): id is string => typeof id === "string"),
      ),
    ];

    let titles: Record<string, string> = {};
    if (tripIds.length > 0) {
      const { data: tripRows, error: tripError } = await db
        .from("trip")
        .select("id, title")
        .eq("client_id", clientId)
        .in("id", tripIds);
      if (tripError) throw new Error(`trip lookup failed: ${tripError.message}`);
      titles = Object.fromEntries((tripRows ?? []).map((t) => [t.id, t.title]));
    }

    return json({
      cards: cards.map((card) => ({
        id: card.id,
        brand: card.brand,
        last4: card.last4,
        expMonth: card.exp_month,
        expYear: card.exp_year,
        nickname: card.nickname,
        status: card.status,
        consentRecordedAt: card.consent_recorded_at,
        revokedAt: card.revoked_at,
        revokedReason: card.revoked_reason,
      })),
      authorizations: (authRows ?? []).map((auth) => ({
        id: auth.id,
        cardId: auth.payment_card_id,
        tripId: auth.trip_id,
        tripTitle: titles[auth.trip_id] ?? null,
        spendingLimitCents: auth.spending_limit_cents,
        amountUsedCents: auth.amount_used_cents,
        expiresAt: auth.expires_at,
        status: auth.status,
        revokedAt: auth.revoked_at,
        createdAt: auth.created_at,
      })),
      events: (eventRows ?? []).map((event) => ({
        id: event.id,
        authorizationId: event.card_authorization_id,
        cardId: event.payment_card_id,
        tripId: event.trip_id,
        tripTitle: titles[event.trip_id] ?? null,
        // The snapshot, never a join. A supplier renamed later must not rewrite a
        // traveler's history, and a portal booking names a merchant with no supplier row.
        supplierName: event.supplier_name_snapshot,
        amountCents: event.amount_cents,
        currency: event.currency,
        referenceNumber: event.reference_number,
        createdAt: event.created_at,
      })),
    });
  } catch (err) {
    return problem(err);
  }
});
