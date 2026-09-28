-- Story-Tail Adventures — local development seed
--
-- Re-run on every `supabase db reset`, against a freshly created database, so it does
-- not need to be idempotent — but it must never contain anything real.
--
-- Rules this file follows:
--   * UUIDs are v7 shaped and hard-coded. Postgres 17 has no built-in uuidv7() (that
--     arrives in 18), and deterministic IDs make the FK wiring readable and the diffs
--     meaningful. Layout: 48-bit millisecond timestamp, version nibble 7, variant 8-b.
--   * Money is bigint cents with an explicit char(3) currency. Never numeric, never float.
--   * Email addresses use example.com — RFC 2606 reserved, so nothing here can reach a real
--     mailbox. The design prototype used to carry personas at gmail/yahoo/hotmail, which are
--     registrable domains and therefore somebody else's inbox; those were moved to
--     example.com before this repo went public. Keep it that way in both places.
--   * NOTHING resembling cardholder data. No payment_card rows at all; when UI work needs
--     one, use brand='visa', last4='4242', stripe_payment_method_id='pm_card_visa_DEV_FAKE'
--     and nothing else. CLAUDE.md rule 1.
--
-- Passwords for every seeded login: DevPassword!234

BEGIN;

-- ============================================================
-- Agent
-- ============================================================

INSERT INTO public.agent (id, display_name, pronouns, email, phone, bio, time_zone, status, commission_split_pct)
VALUES (
    '0195a2c0-1a00-7000-8000-000000000001',
    'Gyasi Story',
    'he/him',
    'gyasi@example.com',
    '+1-555-0100',
    'Travel advisor. I plan trips the way I would want mine planned — carefully, then out '
    'of the way, so the week itself is yours.',
    'America/Chicago',
    'active',
    70.00
);

-- ============================================================
-- Auth users
--
-- Inserted directly into auth.users so the seeded logins actually work against local
-- GoTrue. The handle_new_user() trigger fires on each insert and provisions the matching
-- account + client + platform_user rows, so this file does not create those by hand —
-- which also means the seed exercises the trigger on every reset.
--
-- The agent's own client row is a side effect of that trigger; it is corrected below.
-- ============================================================

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    -- These four are nullable with no default, and GoTrue scans them into non-nullable
    -- Go strings. Leave them NULL and every login fails with a 500:
    --   "Scan error on column index 3, name \"confirmation_token\":
    --    converting NULL to string is unsupported"
    -- Empty string, not NULL. (phone_change, phone_change_token,
    -- email_change_token_current and reauthentication_token already default to ''.)
    confirmation_token, recovery_token, email_change_token_new, email_change
)
VALUES
    -- The agent.
    (
        '0195a2c0-1a00-7000-8000-000000000010',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        'gyasi@example.com',
        extensions.crypt('DevPassword!234', extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"first_name":"Gyasi","last_name":"Story"}'::jsonb,
        now(), now(),
        '', '', '', ''
    ),
    -- An active client with a trip.
    (
        '0195a2c0-1a00-7000-8000-000000000011',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        'jordan.hayes@example.com',
        extensions.crypt('DevPassword!234', extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"first_name":"Jordan","last_name":"Hayes"}'::jsonb,
        now(), now(),
        '', '', '', ''
    ),
    -- A second client, archived below, so list filters have something to exclude.
    (
        '0195a2c0-1a00-7000-8000-000000000012',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        'sam.rivera@example.com',
        extensions.crypt('DevPassword!234', extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"first_name":"Sam","last_name":"Rivera"}'::jsonb,
        now(), now(),
        '', '', '', ''
    );

-- ============================================================
-- Promote Gyasi's platform_user from client to agent
--
-- handle_new_user() provisions everyone as a client, because that is what a public signup
-- is. Agents are created deliberately, not by self-registration, so the agent's row is
-- corrected here. The platform_user CHECK requires role='agent' to carry agent_id and a
-- NULL client_id, so the stand-in client row is dropped once nothing references it.
-- ============================================================

DO $$
DECLARE
    v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id
    FROM public.platform_user
    WHERE account_id = '0195a2c0-1a00-7000-8000-000000000010';

    UPDATE public.platform_user
    SET role = 'agent',
        agent_id = '0195a2c0-1a00-7000-8000-000000000001',
        client_id = NULL,
        display_name = 'Gyasi Story'
    WHERE account_id = '0195a2c0-1a00-7000-8000-000000000010';

    DELETE FROM public.client WHERE id = v_client_id;
END $$;

-- Agent accounts always require MFA (Data-Model §5.1).
UPDATE public.account
SET mfa_required = true
WHERE id = '0195a2c0-1a00-7000-8000-000000000010';

-- ============================================================
-- Jordan has finished onboarding
--
-- Without this every §2.2 session starts at /welcome: the (client) layout's onboarding gate
-- correctly bounces an un-onboarded traveler out of the portal, so the dashboard is
-- unreachable until the wizard is done. Jordan is the §2.2 fixture — five trips, an
-- itinerary, a thread — so Jordan is onboarded.
--
-- Sam is deliberately left un-onboarded, which keeps a fixture for §2.1.9-2.1.14: the
-- wizard needs somebody to walk it.
-- ============================================================

UPDATE public.platform_user
SET onboarding_completed_at = now() - interval '30 days',
    onboarding_step = NULL
WHERE account_id = '0195a2c0-1a00-7000-8000-000000000011';

-- ============================================================
-- Client detail
-- ============================================================

INSERT INTO public.address (id, line1, line2, city, region, postal_code, country)
VALUES (
    '0195a2c0-1a00-7000-8000-000000000020',
    '1400 Lakeview Terrace', 'Apt 6B', 'Chicago', 'IL', '60640', 'US'
);

UPDATE public.client
SET preferred_name = 'Jordan',
    phone = '+1-555-0142',
    date_of_birth = '1988-04-17',
    mailing_address_id = '0195a2c0-1a00-7000-8000-000000000020',
    tags = ARRAY['anniversary', 'all-inclusive'],
    lifetime_value_cents = 1284500,
    status = 'active'
WHERE email = 'jordan.hayes@example.com';

-- Archived, so "active clients" filters have something to leave out.
UPDATE public.client
SET status = 'archived',
    archived_at = now() - interval '90 days'
WHERE email = 'sam.rivera@example.com';

-- ============================================================
-- Supplier
--
-- A portal-payment cruise line, deliberately: portal suppliers are the ones that drive
-- the audited PAN-reveal flow (Screen Inventory 3.6.4), so it is the more useful of the
-- two kinds to have sitting in dev data.
-- ============================================================

INSERT INTO public.supplier (
    id, name, kind, payment_method_kind, payment_portal_url,
    default_commission_pct, commission_payment_terms, contact_email
) VALUES (
    '0195a2c0-1a00-7000-8000-000000000030',
    'Sandals Resorts',
    'resort',
    'portal',
    'https://portal.example.com/agent-booking',
    12.00,
    'Paid 30 days after travel completion.',
    'agents@example.com'
);

-- ============================================================
-- Trip
-- ============================================================

INSERT INTO public.trip (
    id, client_id, agent_id, title, trip_type, status,
    start_date, end_date, destinations, traveler_count,
    total_value_cents, total_paid_cents, total_commission_cents, currency, notes
)
SELECT
    '0195a2c0-1a00-7000-8000-000000000040',
    c.id,
    '0195a2c0-1a00-7000-8000-000000000001',
    'Anniversary Week in Negril',
    'all_inclusive',
    'booked',
    current_date + 67,
    current_date + 74,
    ARRAY['Negril, Jamaica'],
    2,
    1284500,   -- $12,845.00
    500000,    -- $5,000.00 paid
    154140,    -- $1,541.40 commission
    'USD',
    'Ocean-view suite. They mentioned wanting one quiet day with nothing scheduled.'
FROM public.client c
WHERE c.email = 'jordan.hayes@example.com';

-- ============================================================
-- Audit event
--
-- One row in exactly the shape _shared/audit.ts writes, so the helper has a known-good
-- reference to match. CLAUDE.md rule 3.
-- ============================================================

INSERT INTO public.audit_event (
    id, actor_user_id, actor_role, event_type, target_entity, target_id,
    metadata, ip_address, user_agent, created_at
)
SELECT
    '0195a2c0-1a00-7000-8000-000000000050',
    pu.id,
    pu.role,
    'trip.status_changed',
    'trip',
    '0195a2c0-1a00-7000-8000-000000000040',
    '{"from":"proposal","to":"booked","source":"seed"}'::jsonb,
    '127.0.0.1'::inet,
    'seed.sql',
    now() - interval '3 days'
FROM public.platform_user pu
WHERE pu.account_id = '0195a2c0-1a00-7000-8000-000000000010';

-- ============================================================
-- A client Gyasi created before they ever signed up
--
-- The state Screen 2.1.13 exists for: the agent has a record and a trip in flight, the
-- traveler has no account yet. It makes both halves of that screen testable locally.
--
--   * Sign up as maya.carter@example.com — handle_new_user() claims this row by email and
--     the Aruba trip is there on first sign-in, no code needed.
--   * Sign up as anything else and redeem STA-7HX2J9 — the invite-code path, for when the
--     traveler uses a different address than the one the agent has on file.
--
-- Deliberately NO auth.users row: an unclaimed client is one with no platform_user
-- pointing at it, and creating a login here would defeat the whole fixture.
-- ============================================================

INSERT INTO public.client (
    id, agent_id, first_name, last_name, preferred_name, email, phone, tags
) VALUES (
    '0195a2c0-1a00-7000-8000-000000000013',
    '0195a2c0-1a00-7000-8000-000000000001',
    'Maya', 'Carter', 'Maya',
    'maya.carter@example.com',
    '+1-555-0188',
    ARRAY['referral', 'first-trip']
);

INSERT INTO public.trip (
    id, client_id, agent_id, title, trip_type, status,
    start_date, end_date, destinations, traveler_count,
    total_value_cents, total_paid_cents, total_commission_cents, currency, notes
) VALUES (
    '0195a2c0-1a00-7000-8000-000000000041',
    '0195a2c0-1a00-7000-8000-000000000013',
    '0195a2c0-1a00-7000-8000-000000000001',
    'Aruba, Somewhere Quiet',
    'all_inclusive',
    'proposal',
    current_date + 118,
    current_date + 125,
    ARRAY['Palm Beach, Aruba'],
    2,
    964000,    -- $9,640.00
    0,
    115680,    -- $1,156.80 commission
    'USD',
    'Wants a week with nothing on the calendar after Wednesday.'
);

-- Invite code STA-7HX2J9. Only the hash is stored — see Data-Model §6.7 and the
-- client_invite_code_hash() comment for why, and for why "sta 7hx2j9" hashes the same.
INSERT INTO public.client_invite (
    id, client_id, code_hash, issued_by_user_id, expires_at
)
SELECT
    '0195a2c0-1a00-7000-8000-000000000060',
    '0195a2c0-1a00-7000-8000-000000000013',
    public.client_invite_code_hash('STA-7HX2J9'),
    pu.id,
    now() + interval '30 days'
FROM public.platform_user pu
WHERE pu.account_id = '0195a2c0-1a00-7000-8000-000000000010';


-- ============================================================
-- §2.2 fixtures
--
-- Everything from here down exists so Screens 2.2.1–2.2.11 have something real to render
-- and so the RLS tests have something real to be denied. Four rows are deliberately
-- POISON — they must NOT be visible to a client session, and a policy that leaks one looks
-- identical to a working policy until you execute it as that client:
--
--   * the unpublished itinerary on the proposal trip     (itinerary.published_at IS NULL)
--   * the internal note in Jordan's thread               (message.is_internal_note)
--   * the supplier-charge receipt on Jordan's own trip   (document.kind = 'receipt')
--   * the unsent proposal draft                          (proposal.sent_at IS NULL)
--
-- The trip set covers every status the dashboard can label, because three of the seven
-- derived labels would otherwise ship never having rendered against a real row.
-- ============================================================

-- Two more suppliers, so an itinerary has a flight and an excursion with real names.
INSERT INTO public.supplier (id, name, kind, payment_method_kind, default_commission_pct, contact_email)
VALUES
    ('0195a2c0-1a00-7000-8000-000000000031', 'American Airlines', 'airline', 'api', 0.00, 'groups@example.com'),
    ('0195a2c0-1a00-7000-8000-000000000032', 'Island Routes Adventures', 'tour_operator', 'portal', 10.00, 'bookings@example.com');

-- Three more, one per component kind that had no supplier to pick.
--
-- §3.4.5 – §3.4.12's sheets each offer the suppliers matching their kind, so a kind with
-- none renders an empty picker — which looks like a broken control rather than an honest
-- "none on file". `supplier_kind` has eight values; these three close the gap for the four
-- sheets that had nothing, and `hotel_brand` and `other` stay empty on purpose so the
-- empty-picker state is one an advisor can actually reach in dev.
INSERT INTO public.supplier (id, name, kind, payment_method_kind, default_commission_pct, contact_email)
VALUES
    ('0195a2c0-1a00-7000-8000-000000000033', 'Royal Caribbean', 'cruise_line', 'portal', 16.00, 'agents@example.com'),
    ('0195a2c0-1a00-7000-8000-000000000034', 'Allianz Travel', 'insurance', 'api', 25.00, 'partners@example.com'),
    ('0195a2c0-1a00-7000-8000-000000000035', 'Nassau Airport Transfers', 'transfer', 'unknown', 8.00, 'ops@example.com');

-- ── More trips for Jordan, one per renderable status ─────────────────────────
-- 0040 (booked, +67d, part-paid) already exists above and is the dashboard hero.

INSERT INTO public.trip (
    id, client_id, agent_id, title, trip_type, status, status_changed_at,
    start_date, end_date, destinations, traveler_count,
    total_value_cents, total_paid_cents, total_commission_cents, currency,
    cancellation_reason, refund_status, refund_detail, notes
)
SELECT v.id, c.id, '0195a2c0-1a00-7000-8000-000000000001',
       v.title, v.trip_type::public.trip_type, v.status::public.trip_status, v.changed_at,
       v.start_date, v.end_date, v.destinations, v.traveler_count,
       v.total_value_cents, v.total_paid_cents, v.total_commission_cents, 'USD',
       v.cancellation_reason, v.refund_status, v.refund_detail, v.notes
FROM public.client c
CROSS JOIN (VALUES
    -- Proposal ready: what 2.2.9's status-change sheet lands on.
    ('0195a2c0-1a00-7000-8000-000000000042'::uuid, 'Family Week in Turks', 'all_inclusive', 'proposal',
     now() - interval '2 days', (current_date + 150)::date, (current_date + 157)::date,
     ARRAY['Providenciales, Turks & Caicos'], 4, 1912000::bigint, 0::bigint, 229440::bigint,
     NULL::text, NULL::text, NULL::text, 'Two room-type options; they are deciding.'),
    -- Inquiry: no dates yet. Proves the UI survives null start_date.
    ('0195a2c0-1a00-7000-8000-000000000043'::uuid, 'Somewhere Quiet in December', 'custom', 'inquiry',
     now() - interval '9 days', NULL::date, NULL::date,
     ARRAY[]::text[], 2, 0::bigint, 0::bigint, 0::bigint,
     NULL::text, NULL::text, NULL::text, 'Open-ended. Wants "not a resort".'),
    -- Completed: the 2.2.11 memory view.
    ('0195a2c0-1a00-7000-8000-000000000044'::uuid, 'Beaches Turks & Caicos', 'all_inclusive', 'completed',
     now() - interval '600 days', (current_date - 610)::date, (current_date - 603)::date,
     ARRAY['Providenciales, Turks & Caicos'], 4, 692000::bigint, 692000::bigint, 83040::bigint,
     NULL::text, NULL::text, NULL::text, 'Sesame Street breakfast was the hit. Bight Reef snorkel.'),
    -- Cancelled: 2.2.10. cancellation_reason, refund_status and refund_detail are all
    -- client-visible per §21. The prose used to live in refund_status, which had no
    -- vocabulary; 20261001100000 split it so the STATE can be filtered and the SPECIFICS
    -- survive. 'partial' plus that sentence says strictly more than either alone: a credit
    -- with an expiry is not a number you can total, and 'partial' cannot tell you when the
    -- money landed.
    ('0195a2c0-1a00-7000-8000-000000000045'::uuid, 'Carnival Mardi Gras · Spring Break', 'cruise', 'cancelled',
     now() - interval '210 days', (current_date - 175)::date, (current_date - 168)::date,
     ARRAY['Port Canaveral, Florida'], 4, 318000::bigint, 176000::bigint, 0::bigint,
     'Family schedule conflict', 'partial',
     'Refunded $1,640 on Feb 12; $240 future-trip credit through Dec 2027',
     'They asked to rebook in the autumn.')
) AS v(id, title, trip_type, status, changed_at, start_date, end_date, destinations,
       traveler_count, total_value_cents, total_paid_cents, total_commission_cents,
       cancellation_reason, refund_status, refund_detail, notes)
WHERE c.email = 'jordan.hayes@example.com';

-- ── Trip components for the Negril trip ─────────────────────────────────────
-- cost_cents and commission_cents are populated on purpose: they are what the client column
-- grant withholds, so a leak has something to leak.

-- ── An ARCHIVED trip, so §3.4.1's exclusion can fail ────────────────────────
--
-- §3.4.16 archives a trip to take it off the working surfaces, and `agent_trip_roster()`
-- drops archived rows unconditionally — not as a status the caller may ask for. Without a
-- row in this state the assertion that proves it compares a number against itself and
-- passes for nothing, which is exactly what rls_agent_client_detail.sql recorded happening
-- to four tabs at once.
--
-- Deliberately `completed` and not `cancelled`: archived and cancelled are different
-- states, and a fixture that is both cannot tell the two exclusions apart.
INSERT INTO public.trip (
    id, client_id, agent_id, title, trip_type, status, status_changed_at,
    start_date, end_date, destinations, traveler_count,
    total_value_cents, total_paid_cents, total_commission_cents, currency,
    archived_at, notes
)
SELECT
    '0195a2c0-1a00-7000-8000-0000000000af',
    c.id,
    '0195a2c0-1a00-7000-8000-000000000001',
    'Barbados, long weekend (archived)',
    'custom',
    'completed',
    now() - interval '400 days',
    (current_date - 405)::date,
    (current_date - 401)::date,
    ARRAY['Bridgetown, Barbados'],
    2,
    288000, 288000, 34560, 'USD',
    now() - interval '390 days',
    'Archived after reconciliation. Present so the roster can prove it hides archived trips.'
FROM public.client c
WHERE c.email = 'maya.carter@example.com';

INSERT INTO public.trip_component (
    id, trip_id, kind, supplier_id, display_name, start_date, end_date, start_time, end_time,
    location, confirmation_number, cost_cents, commission_pct, commission_cents, payload, order_index
) VALUES
    ('0195a2c0-1a00-7000-8000-000000000070', '0195a2c0-1a00-7000-8000-000000000040',
     'flight', '0195a2c0-1a00-7000-8000-000000000031', 'AA 1413 · MIA → MBJ',
     current_date + 67, current_date + 67, '06:40', '09:30',
     'Miami International Airport', 'TLR8QV', 84200, 0.00, 0,
     -- PAYLOAD HOLDS ONLY WHAT NO COLUMN DOES, as of 2026-09-28 and Data-Model §23.
     -- `airline` went to `supplier_id`, `origin`/`destination` to the route already in
     -- `display_name`. Both were a second copy of a fact a column held, and a second copy
     -- is what an edit sheet silently picks one of.
     '{"flight_number":"AA 1413","cabin":"main","seat":"14A, 14B"}'::jsonb, 0),
    -- THE RETURN LEG, added 2026-09-28 when trip.total_value_cents became a computed sum.
    -- Its absence was a fixture bug hiding behind a hand-set total: the components summed to
    -- $11,645 while the row claimed $12,845 and the payment milestones were balanced against
    -- the claim. Nothing checked, because nothing computed the sum. A round trip to Jamaica
    -- with no way home was the tell nobody read.
    ('0195a2c0-1a00-7000-8000-00000000007f', '0195a2c0-1a00-7000-8000-000000000040',
     'flight', '0195a2c0-1a00-7000-8000-000000000031', 'AA 1410 · MBJ → MIA',
     current_date + 74, current_date + 74, '11:35', '14:20',
     'Sangster International Airport', 'TLR8QV', 120000, 0.00, 0,
     '{"flight_number":"AA 1410","cabin":"main","seat":"12A, 12B"}'::jsonb, 5),
    ('0195a2c0-1a00-7000-8000-000000000071', '0195a2c0-1a00-7000-8000-000000000040',
     -- NO SUPPLIER, deliberately. It was filed under Island Routes, which is a tour
     -- operator rather than a transfer company — and a local Montego Bay driver who is
     -- not on the supplier list is the ordinary case, not an edge one. It is also the
     -- only thing keeping `agent_trip_components`' LEFT JOIN honest: with every component
     -- naming a supplier, an INNER join would pass every test and empty the builder for
     -- every trip built by hand.
     'transfer', NULL, 'Private transfer · Mercedes Vito',
     current_date + 67, current_date + 67, '10:20', '11:45',
     'Montego Bay', NULL, 14000, 10.00, 1400,
     '{"vehicle":"Mercedes Vito","duration":"85 minutes"}'::jsonb, 1),
    ('0195a2c0-1a00-7000-8000-000000000072', '0195a2c0-1a00-7000-8000-000000000040',
     'hotel', '0195a2c0-1a00-7000-8000-000000000030', 'Ocean-view suite · 7 nights',
     current_date + 67, current_date + 74, '15:00', '11:00',
     'Negril, Jamaica', 'SRB-220119', 1010300, 12.00, 121236,
     -- `nights` and `rate_cents_per_night` are gone. The first is `start_date` to
     -- `end_date`; the second was money outside a money column, and it had ALREADY drifted
     -- — 144328 × 7 is 1,010,296 against the 1,010,300 beside it. Four cents, no
     -- constraint, nothing anywhere to notice. The same shape `total_value_cents` was in.
     '{"room_type":"Ocean-view suite","board_basis":"all-inclusive"}'::jsonb, 2),
    ('0195a2c0-1a00-7000-8000-000000000073', '0195a2c0-1a00-7000-8000-000000000040',
     'excursion', '0195a2c0-1a00-7000-8000-000000000032', 'Catamaran to Booby Cay',
     current_date + 69, current_date + 69, '09:00', '15:00',
     'Negril Marina, pier 2', 'IR-88214', 32000, 10.00, 3200,
     '{"duration":"6 hours","notes":"Includes snorkel gear and lunch."}'::jsonb, 3);

-- An insurance component and an emergency contact, so §2.2.4's Important info panel has
-- something to show. Without these it correctly reads "Nothing filed for this trip yet",
-- which is a true empty state but leaves the populated one untested.
INSERT INTO public.trip_component (
    id, trip_id, kind, supplier_id, display_name, start_date, end_date,
    confirmation_number, cost_cents, commission_pct, commission_cents, payload, order_index
) VALUES (
    '0195a2c0-1a00-7000-8000-000000000074', '0195a2c0-1a00-7000-8000-000000000040',
    -- `provider` became `supplier_id` and `policy_number` became `confirmation_number`.
    -- The second one is how the whole class was found: the seed held the identical string
    -- "98-7124" in a column and in the blob beside it.
    'insurance', '0195a2c0-1a00-7000-8000-000000000034', 'Allianz OneTrip Prime',
    current_date + 67, current_date + 74,
    '98-7124', 24000, 25.00, 6000,
    '{"coverage":"medical, cancellation, baggage"}'::jsonb, 4
);

UPDATE public.client
SET emergency_contact = '{"name":"Dana Hayes","phone":"+1-555-0143","relationship":"sister"}'::jsonb
WHERE email = 'jordan.hayes@example.com';

-- ── The published itinerary (trip 0040) ─────────────────────────────────────

INSERT INTO public.itinerary (id, trip_id, cover_image_url, intro_note, closing_note, published_at, last_published_at)
VALUES (
    '0195a2c0-1a00-7000-8000-000000000080',
    '0195a2c0-1a00-7000-8000-000000000040',
    NULL,
    -- Design-System §2.4: the intro note is the voice-forward surface of the itinerary.
    'You have been carrying a lot this year. For these seven days the only thing on your calendar is the water. I have left Thursday completely open on purpose — no tour, no reservation, nothing to be on time for.',
    'You made it. Rest deeply this week.',
    now() - interval '5 days',
    now() - interval '5 days'
);

INSERT INTO public.itinerary_day (id, itinerary_id, day_number, date, label, summary, weather_forecast) VALUES
    ('0195a2c0-1a00-7000-8000-000000000081', '0195a2c0-1a00-7000-8000-000000000080', 1, current_date + 67,
     'Miami → Negril', 'Travel day. You land early enough for lunch on the sand.',
     '{"high_f":88,"low_f":76,"summary":"Mostly sunny","wind_mph":8,"wind_dir":"SE","uv_index":9}'::jsonb),
    ('0195a2c0-1a00-7000-8000-000000000082', '0195a2c0-1a00-7000-8000-000000000080', 2, current_date + 68,
     'Seven Mile Beach', 'Nothing scheduled before dinner.',
     '{"high_f":87,"low_f":75,"summary":"Sunny","wind_mph":6,"wind_dir":"E","uv_index":10}'::jsonb),
    ('0195a2c0-1a00-7000-8000-000000000083', '0195a2c0-1a00-7000-8000-000000000080', 3, current_date + 69,
     'Booby Cay day-trip', 'Catamaran out, snorkel, lunch on the cay.',
     '{"high_f":86,"low_f":75,"summary":"Partly cloudy","wind_mph":11,"wind_dir":"NE","uv_index":8}'::jsonb),
    ('0195a2c0-1a00-7000-8000-000000000084', '0195a2c0-1a00-7000-8000-000000000080', 4, current_date + 70,
     'An open day', 'Deliberately empty.', NULL);

INSERT INTO public.itinerary_activity (
    id, itinerary_day_id, block, start_time, end_time, title, body,
    location, address, phone, confirmation_number, gyasis_tip, component_id, order_index
) VALUES
    ('0195a2c0-1a00-7000-8000-000000000090', '0195a2c0-1a00-7000-8000-000000000081', 'morning',
     '06:40', '09:30', 'AA 1413 · MIA → MBJ', 'Direct, 2h 50m. Seats 14A and 14B.',
     'Miami International Airport', 'MIA Terminal D', NULL, 'TLR8QV', NULL,
     '0195a2c0-1a00-7000-8000-000000000070', 0),
    ('0195a2c0-1a00-7000-8000-000000000091', '0195a2c0-1a00-7000-8000-000000000081', 'morning',
     '10:20', '11:45', 'Private transfer to Negril', 'Sun & Fun Tours will be past customs holding a sign.',
     'Montego Bay', 'Sangster International, arrivals hall', '+1-876-555-0142', NULL,
     'Skip the taxi queue and walk left out of arrivals — the private transfer desk is quieter.',
     '0195a2c0-1a00-7000-8000-000000000071', 1),
    ('0195a2c0-1a00-7000-8000-000000000092', '0195a2c0-1a00-7000-8000-000000000081', 'afternoon',
     '15:00', NULL, 'Check in · ocean-view suite', 'Seven nights, all-inclusive.',
     'Negril, Jamaica', 'Norman Manley Blvd, Negril', '+1-876-555-0100', 'SRB-220119',
     'Ask for Devon at the desk. He knows it is your anniversary.', '0195a2c0-1a00-7000-8000-000000000072', 2),
    ('0195a2c0-1a00-7000-8000-000000000093', '0195a2c0-1a00-7000-8000-000000000083', 'morning',
     '09:00', '15:00', 'Catamaran to Booby Cay', 'Snorkel gear and lunch included. Six hours.',
     'Negril Marina', 'Negril Marina, pier 2', '+1-876-555-0177', 'IR-88214',
     'Reef-safe sunscreen only — they will turn you away at the pier otherwise.',
     '0195a2c0-1a00-7000-8000-000000000073', 0);

-- POISON 1: an UNPUBLISHED itinerary on the proposal trip. Jordan owns the trip, so an
-- ownership-only policy returns this; the published_at gate is what stops it.
INSERT INTO public.itinerary (id, trip_id, intro_note, published_at)
VALUES (
    '0195a2c0-1a00-7000-8000-000000000085',
    '0195a2c0-1a00-7000-8000-000000000042',
    'DRAFT — do not send. Still waiting on the Beaches contract, and I have not priced the connecting flight yet.',
    NULL
);

INSERT INTO public.itinerary_day (id, itinerary_id, day_number, date, label, summary)
VALUES ('0195a2c0-1a00-7000-8000-000000000086', '0195a2c0-1a00-7000-8000-000000000085',
        1, current_date + 150, 'DRAFT arrival', 'placeholder');

-- The PAST trip's itinerary, published and closed out. Screen 2.2.11.
--
-- Its `closing_note` is the whole reason this row exists. 2.2.11's leading element is "a
-- note from Gyasi", which `loadPastTrip` prefers `closing_note` for — an intro note reads
-- oddly in the past tense — and without a published itinerary on a COMPLETED trip that card
-- never rendered and the "itinerary, as it was" link went to an empty state. A fixture that
-- leaves a screen's primary element unexercised is how it ships looking half-built.
INSERT INTO public.itinerary (id, trip_id, intro_note, closing_note, published_at, last_published_at)
VALUES (
    '0195a2c0-1a00-7000-8000-000000000090',
    '0195a2c0-1a00-7000-8000-000000000044',
    'Four of you, seven nights, and one job: be somewhere the kids can run and you can stop.',
    -- Design-System §2.4 names gratitude as this screen's register, and the closing note is
    -- where Gyasi actually writes it.
    'Seven nights of reef, family and salt air. Thank you for letting me hold the details. Welcome home.',
    now() - interval '18 months',
    now() - interval '18 months'
);

INSERT INTO public.itinerary_day (id, itinerary_id, day_number, date, label, summary) VALUES
    ('0195a2c0-1a00-7000-8000-000000000091', '0195a2c0-1a00-7000-8000-000000000090', 1,
     -- `::date`, because `current_date - interval` is a TIMESTAMP and `timestamp + integer`
     -- is not an operator — the day-2 row below needs the cast to add a day at all.
     (current_date - interval '18 months')::date, 'Arrival · Providenciales',
     'Landed late morning. The kids were in the water before the bags were up.'),
    ('0195a2c0-1a00-7000-8000-000000000092', '0195a2c0-1a00-7000-8000-000000000090', 2,
     (current_date - interval '18 months')::date + 1, 'Bight Reef',
     'Snorkelling straight off the beach, then the Sesame Street breakfast.');

-- ── Payment milestones (trip 0040) ──────────────────────────────────────────
-- Sums to 1284500, which is what the trip's COMPONENTS now sum to as well — see the return
-- leg above. `trip.total_value_cents` is no longer a hand-set number to be balanced against:
-- a trigger recomputes it from the components (20260928100000), so this comment is now a
-- statement the database enforces rather than one a reader has to take on faith.
-- Paid sums to total_paid_cents 500000, which IS still hand-set: money that moved is not a
-- function of the component list.

INSERT INTO public.payment_milestone (
    id, trip_id, kind, label, amount_cents, currency, due_date, paid_at, paid_cents, status, order_index
) VALUES
    ('0195a2c0-1a00-7000-8000-0000000000a0', '0195a2c0-1a00-7000-8000-000000000040',
     'deposit', 'Deposit', 100000, 'USD', current_date - 40, now() - interval '38 days', 100000, 'paid', 0),
    ('0195a2c0-1a00-7000-8000-0000000000a1', '0195a2c0-1a00-7000-8000-000000000040',
     'interim', 'Second payment', 400000, 'USD', current_date - 10, now() - interval '9 days', 400000, 'paid', 1),
    ('0195a2c0-1a00-7000-8000-0000000000a2', '0195a2c0-1a00-7000-8000-000000000040',
     'final', 'Final balance', 784500, 'USD', current_date + 14, NULL, 0, 'scheduled', 2);

-- ── Conversation and messages (trip 0040) ───────────────────────────────────

INSERT INTO public.conversation (
    id, client_id, agent_id, trip_id, subject, last_message_at, last_message_preview, client_unread_count, agent_unread_count
)
SELECT '0195a2c0-1a00-7000-8000-0000000000b0', c.id, '0195a2c0-1a00-7000-8000-000000000001',
       '0195a2c0-1a00-7000-8000-000000000040', 'Anniversary Week in Negril',
       now() - interval '2 hours',
       'Locked. I also flagged your card for the final balance.', 2, 0
FROM public.client c WHERE c.email = 'jordan.hayes@example.com';

INSERT INTO public.message (id, conversation_id, sender_user_id, sender_role, body, is_internal_note, created_at)
SELECT v.id, '0195a2c0-1a00-7000-8000-0000000000b0',
       (SELECT pu.id FROM public.platform_user pu WHERE pu.account_id = v.account_id),
       v.sender_role::public.user_role, v.body, v.internal, v.created_at
FROM (VALUES
    ('0195a2c0-1a00-7000-8000-0000000000b1'::uuid, '0195a2c0-1a00-7000-8000-000000000010'::uuid, 'agent',
     'Quick win — the resort just opened the ocean-view suites for your dates. I held one tentatively. Want me to lock it?',
     false, now() - interval '1 day 5 hours'),
    ('0195a2c0-1a00-7000-8000-0000000000b2'::uuid, '0195a2c0-1a00-7000-8000-000000000011'::uuid, 'client',
     'Yes please. What does the upgrade run us?', false, now() - interval '1 day 4 hours'),
    ('0195a2c0-1a00-7000-8000-0000000000b3'::uuid, '0195a2c0-1a00-7000-8000-000000000010'::uuid, 'agent',
     '$680 over the base, and I got a spa credit and a private island day with it. Net win.',
     false, now() - interval '1 day 4 hours'),
    -- POISON 2: an internal note in the client's own thread. is_internal_note is withheld
    -- from the client column grant, which does NOT hide the row — only the policy does.
    ('0195a2c0-1a00-7000-8000-0000000000b4'::uuid, '0195a2c0-1a00-7000-8000-000000000010'::uuid, 'agent',
     'INTERNAL: margin on the suite upgrade is thin, do not discount further. Chase Sandals about the missing commission on the 2024 booking.',
     true, now() - interval '1 day 3 hours'),
    ('0195a2c0-1a00-7000-8000-0000000000b5'::uuid, '0195a2c0-1a00-7000-8000-000000000010'::uuid, 'agent',
     'Locked. I also flagged your card for the final balance of $7,845 — there is an authorization request waiting on your dashboard.',
     false, now() - interval '2 hours')
) AS v(id, account_id, sender_role, body, internal, created_at);

-- ── Documents ───────────────────────────────────────────────────────────────

-- `storage_key` is `trips/<trip id>/<document id>.<ext>` — the exact shape the
-- trip-document function derives server-side, never from a client-supplied filename. The
-- fixtures use it so nobody reading the seed infers a shorter convention and writes a
-- signer that parses the key. The receipt below is the deliberate exception: agency records
-- are filed outside the `trips/` prefix and no client route ever reaches them.
INSERT INTO public.document (
    id, owner_user_id, client_id, trip_id, kind, filename, mime_type, size_bytes,
    storage_bucket, storage_key, checksum_sha256, is_sensitive
)
SELECT v.id,
       (SELECT pu.id FROM public.platform_user pu WHERE pu.account_id = v.account_id),
       c.id, v.trip_id, v.kind::public.document_kind, v.filename, v.mime_type, v.size_bytes,
       'trip-documents', v.storage_key, sha256(convert_to(v.filename, 'UTF8')), v.is_sensitive
FROM public.client c
CROSS JOIN (VALUES
    ('0195a2c0-1a00-7000-8000-0000000000c0'::uuid, '0195a2c0-1a00-7000-8000-000000000010'::uuid,
     '0195a2c0-1a00-7000-8000-000000000040'::uuid, 'supplier_confirmation',
     'negril-confirmation.pdf', 'application/pdf', 327680::bigint,
     'trips/0195a2c0-1a00-7000-8000-000000000040/0195a2c0-1a00-7000-8000-0000000000c0.pdf', false),
    ('0195a2c0-1a00-7000-8000-0000000000c1'::uuid, '0195a2c0-1a00-7000-8000-000000000010'::uuid,
     '0195a2c0-1a00-7000-8000-000000000040'::uuid, 'insurance_cert',
     'allianz-policy-987124.pdf', 'application/pdf', 634880::bigint,
     'trips/0195a2c0-1a00-7000-8000-000000000040/0195a2c0-1a00-7000-8000-0000000000c1.pdf', false),
    -- is_sensitive on a passport, and the client must STILL be able to see it: the flag
    -- governs access logging, not visibility. This row is why document_self_select does not
    -- filter on it.
    ('0195a2c0-1a00-7000-8000-0000000000c2'::uuid, '0195a2c0-1a00-7000-8000-000000000011'::uuid,
     '0195a2c0-1a00-7000-8000-000000000040'::uuid, 'passport',
     'passport-jordan.jpg', 'image/jpeg', 1153434::bigint,
     'trips/0195a2c0-1a00-7000-8000-000000000040/0195a2c0-1a00-7000-8000-0000000000c2.jpg', true),
    ('0195a2c0-1a00-7000-8000-0000000000c3'::uuid, '0195a2c0-1a00-7000-8000-000000000011'::uuid,
     '0195a2c0-1a00-7000-8000-000000000044'::uuid, 'photo',
     'bight-reef.jpg', 'image/jpeg', 2411724::bigint,
     'trips/0195a2c0-1a00-7000-8000-000000000044/0195a2c0-1a00-7000-8000-0000000000c3.jpg', false),
    -- POISON 3: a supplier-charge receipt, on Jordan's OWN trip. This is the row that makes
    -- the document kind allowlist necessary — card_use_event.trip_id is NOT NULL, so
    -- receipts are trip-scoped by construction and an ownership-only policy hands the
    -- traveler what the agency actually paid.
    ('0195a2c0-1a00-7000-8000-0000000000c4'::uuid, '0195a2c0-1a00-7000-8000-000000000010'::uuid,
     '0195a2c0-1a00-7000-8000-000000000040'::uuid, 'receipt',
     'sandals-supplier-charge-1010300.pdf', 'application/pdf', 88064::bigint,
     'internal/receipts/sandals-1010300.pdf', false)
) AS v(id, account_id, trip_id, kind, filename, mime_type, size_bytes, storage_key, is_sensitive)
WHERE c.email = 'jordan.hayes@example.com';

-- An attachment, so 2.2.7's thumbnail rail has a row and message_attachment has coverage.
INSERT INTO public.message_attachment (id, message_id, document_id)
VALUES ('0195a2c0-1a00-7000-8000-0000000000d0',
        '0195a2c0-1a00-7000-8000-0000000000b5',
        '0195a2c0-1a00-7000-8000-0000000000c0');

-- POISON 4: an unsent proposal draft on the proposal trip. snapshot carries per-component
-- cost, which is exactly what the withheld column and the sent_at gate protect.
INSERT INTO public.proposal (
    id, trip_id, version_number, snapshot, cover_title, opening_note, pricing_valid_until, sent_at
) VALUES (
    '0195a2c0-1a00-7000-8000-0000000000e0',
    '0195a2c0-1a00-7000-8000-000000000042',
    2,
    '{"draft":true,"components":[{"display_name":"Beaches T&C","cost_cents":1650000,"commission_cents":198000}]}'::jsonb,
    'Family Week in Turks — v2 DRAFT',
    'Not finished. Pricing is stale and the flight is a guess.',
    current_date + 14,
    NULL
);

-- The sent proposal the client is actually looking at.
INSERT INTO public.proposal (
    id, trip_id, version_number, snapshot, cover_title, cover_image_url,
    opening_note, closing_note, pricing_valid_until, sent_at, viewed_at
) VALUES (
    '0195a2c0-1a00-7000-8000-0000000000e1',
    '0195a2c0-1a00-7000-8000-000000000042',
    1,
    '{"components":[{"display_name":"Beaches T&C","cost_cents":1650000,"commission_cents":198000}]}'::jsonb,
    'Family Week in Turks',
    NULL,
    'Four of you, seven nights, and a kids club that actually earns its name.',
    'Take your time with it. Nothing expires this week.',
    current_date + 21,
    now() - interval '2 days',
    now() - interval '1 day'
);

-- ── A testimonial on the completed trip (2.2.11) ────────────────────────────
-- Approved but NOT published: the state that proves the gate is a gate.

INSERT INTO public.testimonial (
    id, client_id, trip_id, agent_id, body, attribution, rating, status,
    submitted_at, approved_at, approved_by_user_id
)
SELECT '0195a2c0-1a00-7000-8000-0000000000f0', c.id,
       '0195a2c0-1a00-7000-8000-000000000044',
       '0195a2c0-1a00-7000-8000-000000000001',
       'We came home rested, which has not happened in years. The part I keep telling people about is that Gyasi left one day completely empty and told us not to fill it.',
       'The Hayes family', 5, 'approved',
       now() - interval '580 days', now() - interval '575 days',
       (SELECT pu.id FROM public.platform_user pu WHERE pu.account_id = '0195a2c0-1a00-7000-8000-000000000010')
FROM public.client c WHERE c.email = 'jordan.hayes@example.com';

-- ─────────────────────────────────────────────────────────────────────────────
-- Cruise catalog fixtures (P2)
--
-- The cruise domain shipped with its sync but no fixtures, so nothing could be developed
-- or reviewed against it without a track.cruises key and a live run — which spends a
-- 100-request monthly budget to look at a page. These four sailings are enough to build
-- and test the public Cruises mode; the sync overwrites them by `(provider, provider_key)`
-- when it runs for real.
--
-- `provider` is 'seed' rather than 'track-cruises' ON PURPOSE: the sync upserts on that
-- pair, so a seeded row can never be mistaken for, or silently merged with, one the
-- provider actually returned.
--
-- Departure dates are relative to now(), because a fixture with hard-coded 2026 dates
-- becomes invisible the moment the search's "not in the past" filter passes them — the
-- same trap the cruise sync's own `departure_within_days` comment records.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.cruise_line (id, slug, name, display_order, is_booked, provider, provider_key)
VALUES ('01a08376-dc00-7000-8000-000000000200', 'royal-caribbean', 'Royal Caribbean', 1, true, 'seed', 'seed:royal-caribbean')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cruise_ship (id, cruise_line_id, name, slug, provider, provider_key)
VALUES
    ('01a08376-dc00-7000-8000-000000000210', '01a08376-dc00-7000-8000-000000000200', 'Symphony of the Seas', 'symphony-of-the-seas', 'seed', 'seed:symphony'),
    ('01a08376-dc00-7000-8000-000000000211', '01a08376-dc00-7000-8000-000000000200', 'Wonder of the Seas', 'wonder-of-the-seas', 'seed', 'seed:wonder')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cruise_sailing
    (id, cruise_line_id, ship_id, provider, provider_key, provider_locale, title,
     departure_date, duration_nights, lead_price_cents, currency, destinations, synced_at)
VALUES
    ('01a08376-dc00-7000-8000-000000000220', '01a08376-dc00-7000-8000-000000000200', '01a08376-dc00-7000-8000-000000000210',
     'seed', 'seed:sailing-1', 'en', '7 Night Eastern Caribbean & Perfect Day',
     (now() + interval '48 days')::date, 7, 129900, 'USD', ARRAY['Caribbean', 'Eastern Caribbean'], now()),
    ('01a08376-dc00-7000-8000-000000000221', '01a08376-dc00-7000-8000-000000000200', '01a08376-dc00-7000-8000-000000000210',
     'seed', 'seed:sailing-2', 'en', '7 Night Western Caribbean & Perfect Day',
     (now() + interval '62 days')::date, 7, 118900, 'USD', ARRAY['Caribbean', 'Western Caribbean'], now()),
    ('01a08376-dc00-7000-8000-000000000222', '01a08376-dc00-7000-8000-000000000200', '01a08376-dc00-7000-8000-000000000211',
     'seed', 'seed:sailing-3', 'en', '6 Night Southern Caribbean',
     (now() + interval '95 days')::date, 6, 149900, 'USD', ARRAY['Caribbean', 'Southern Caribbean'], now()),
    ('01a08376-dc00-7000-8000-000000000223', '01a08376-dc00-7000-8000-000000000200', '01a08376-dc00-7000-8000-000000000211',
     'seed', 'seed:sailing-4', 'en', '4 Night Bahamas & Perfect Day',
     (now() + interval '31 days')::date, 4, 79900, 'USD', ARRAY['Bahamas', 'Caribbean'], now())
ON CONFLICT (id) DO NOTHING;

-- Port calls, in sequence. Sailing 1 deliberately has an overnight — two consecutive calls
-- at the same port — because that is a real itinerary shape and the reader collapses it.
INSERT INTO public.cruise_port_call (id, sailing_id, port_name, sequence, day)
VALUES
    ('01a08376-dc00-7000-8000-000000000230', '01a08376-dc00-7000-8000-000000000220', 'Miami, Florida', 1, 1),
    ('01a08376-dc00-7000-8000-000000000231', '01a08376-dc00-7000-8000-000000000220', 'Perfect Day at CocoCay', 2, 2),
    ('01a08376-dc00-7000-8000-000000000232', '01a08376-dc00-7000-8000-000000000220', 'Charlotte Amalie, St. Thomas', 3, 4),
    ('01a08376-dc00-7000-8000-000000000233', '01a08376-dc00-7000-8000-000000000220', 'Charlotte Amalie, St. Thomas', 4, 5),
    ('01a08376-dc00-7000-8000-000000000234', '01a08376-dc00-7000-8000-000000000220', 'Philipsburg, St. Maarten', 5, 6),
    ('01a08376-dc00-7000-8000-000000000235', '01a08376-dc00-7000-8000-000000000220', 'Miami, Florida', 6, 8),
    ('01a08376-dc00-7000-8000-000000000240', '01a08376-dc00-7000-8000-000000000221', 'Miami, Florida', 1, 1),
    ('01a08376-dc00-7000-8000-000000000241', '01a08376-dc00-7000-8000-000000000221', 'Perfect Day at CocoCay', 2, 2),
    ('01a08376-dc00-7000-8000-000000000242', '01a08376-dc00-7000-8000-000000000221', 'Costa Maya, Mexico', 3, 4),
    ('01a08376-dc00-7000-8000-000000000243', '01a08376-dc00-7000-8000-000000000221', 'Roatán, Honduras', 4, 5),
    ('01a08376-dc00-7000-8000-000000000244', '01a08376-dc00-7000-8000-000000000221', 'Cozumel, Mexico', 5, 6),
    ('01a08376-dc00-7000-8000-000000000250', '01a08376-dc00-7000-8000-000000000222', 'Port Canaveral, Florida', 1, 1),
    ('01a08376-dc00-7000-8000-000000000251', '01a08376-dc00-7000-8000-000000000222', 'Basseterre, St. Kitts', 2, 3),
    ('01a08376-dc00-7000-8000-000000000252', '01a08376-dc00-7000-8000-000000000222', 'Bridgetown, Barbados', 3, 4),
    ('01a08376-dc00-7000-8000-000000000260', '01a08376-dc00-7000-8000-000000000223', 'Port Canaveral, Florida', 1, 1),
    ('01a08376-dc00-7000-8000-000000000261', '01a08376-dc00-7000-8000-000000000223', 'Nassau, Bahamas', 2, 2),
    ('01a08376-dc00-7000-8000-000000000262', '01a08376-dc00-7000-8000-000000000223', 'Perfect Day at CocoCay', 3, 3)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- Payment domain (Screen Inventory §2.4)
--
-- NOTHING HERE RESEMBLES CARDHOLDER DATA, and the values are the ones this file's own header
-- mandates: brand 'visa', last4 '4242', stripe_payment_method_id 'pm_card_visa_DEV_FAKE'.
-- `pm_card_visa` is Stripe's published test PaymentMethod handle — a token, not a card — and
-- the _DEV_FAKE suffix makes the row unusable against a real Stripe account should one ever
-- be configured. There is no cardholder name and no security-code column; the schema has
-- neither, by CLAUDE.md rule 1 and the table's own COMMENT. Never write a test card number
-- into this file, not even inside a comment: a fixture is exactly where one gets normalised,
-- and the repo's pre-write guard rejects one on sight.
--
-- WHY THESE ROWS EXIST AT ALL. payment_card.stripe_payment_method_id and .stripe_customer_id
-- are both NOT NULL, so no card row can be created without a real Stripe tokenization, and
-- Screen 2.4.2 (Add Card) is deferred until a Stripe account exists. Six of §2.4's seven
-- screens read rows that only 2.4.2 can create. Without a fixture they render empty and
-- cannot be built, reviewed or demoed at all.
--
-- These rows are readable ONLY through the service role. 20260917090000_payment_domain_
-- lockdown.sql revoked every client-role grant on these four tables and no policy replaced
-- it — see supabase/tests/rls_payment.sql.
-- ============================================================

-- Jordan's card, and Sam's.
--
-- SAM'S IS A POISON ROW, not decoration. Every §2.4 read is scoped by client, and a scoping
-- bug that returns "all cards" looks identical to a correct one when only a single client
-- owns a card. With two, an isolation test can fail honestly — the same reason the trip
-- fixtures span more than one traveler.
INSERT INTO public.payment_card (
    id, client_id, stripe_payment_method_id, stripe_customer_id,
    brand, last4, exp_month, exp_year, nickname, consent_recorded_at, status
)
SELECT '01a0b1c2-d300-7000-8000-000000000010', c.id,
       'pm_card_visa_DEV_FAKE', 'cus_DEV_FAKE_JORDAN',
       'visa', '4242', 11, 2029, 'Personal Visa', now() - interval '40 days', 'active'
FROM public.client c WHERE c.email = 'jordan.hayes@example.com'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payment_card (
    id, client_id, stripe_payment_method_id, stripe_customer_id,
    brand, last4, exp_month, exp_year, nickname, consent_recorded_at, status
)
SELECT '01a0b1c2-d300-7000-8000-000000000011', c.id,
       'pm_card_visa_DEV_FAKE_SAM', 'cus_DEV_FAKE_SAM',
       'visa', '4242', 4, 2028, 'Sam''s card — must never appear in Jordan''s wallet',
       now() - interval '12 days', 'active'
FROM public.client c WHERE c.email = 'sam.rivera@example.com'
ON CONFLICT (id) DO NOTHING;

-- A revoked card for Jordan, so 2.4.1 has a non-active row to render. The list is not a list
-- of usable cards; it is a record, and a revoked card stays visible with its date.
INSERT INTO public.payment_card (
    id, client_id, stripe_payment_method_id, stripe_customer_id,
    brand, last4, exp_month, exp_year, nickname, consent_recorded_at,
    status, revoked_at, revoked_reason
)
SELECT '01a0b1c2-d300-7000-8000-000000000012', c.id,
       'pm_card_mastercard_DEV_FAKE', 'cus_DEV_FAKE_JORDAN',
       'mastercard', '4444', 2, 2027, 'Old joint card', now() - interval '400 days',
       'revoked', now() - interval '90 days', 'client_request'
FROM public.client c WHERE c.email = 'jordan.hayes@example.com'
ON CONFLICT (id) DO NOTHING;

-- An active authorization on the Negril trip — the one §2.2.1's "Authorize a card" tile and
-- §2.2.3's payment timeline both point at.
--
-- consent_payload is a SNAPSHOT of the mandate text the traveler actually agreed to, frozen
-- at the moment of consent. It is jsonb and NOT NULL precisely so the wording cannot be
-- rewritten out from under a past agreement. Note what it does NOT promise: there is no
-- per-use notification clause, because no dispatcher exists on either stack to deliver one —
-- see the §2.4 amendment in docs/Screen-Inventory.md.
INSERT INTO public.card_authorization (
    id, payment_card_id, trip_id, spending_limit_cents, amount_used_cents,
    expires_at, status, consent_payload
)
VALUES (
    '01a0b1c2-d300-7000-8000-000000000020',
    '01a0b1c2-d300-7000-8000-000000000010',
    '0195a2c0-1a00-7000-8000-000000000040',
    900000, 784500,
    now() + interval '75 days', 'active',
    jsonb_build_object(
        'version', 1,
        'agreed_at', (now() - interval '30 days')::text,
        'text', 'I authorize Story-Tail Adventures to use this card to pay suppliers for '
                || 'this trip, up to the limit shown. Story-Tail does not charge me a '
                || 'planning or service fee.'
    )
)
ON CONFLICT (id) DO NOTHING;

-- Three uses against it, oldest first. Between them they cover the three shapes 2.4.5 and
-- 2.4.6 have to render: a supplier we have a row for, a supplier we do not (portal bookings
-- name a merchant that is not in our supplier table), and one the traveler has flagged.
--
-- supplier_name_snapshot is NOT NULL and separate from supplier_id on purpose: the name at
-- the time of the charge is what appears on a statement, and a supplier renamed later must
-- not silently rewrite the traveler's history.
INSERT INTO public.card_use_event (
    id, card_authorization_id, payment_card_id, trip_id, agent_user_id,
    supplier_id, supplier_name_snapshot, amount_cents, currency,
    reference_number, justification, client_flag_status, client_flagged_at, created_at
)
SELECT v.id, '01a0b1c2-d300-7000-8000-000000000020',
       '01a0b1c2-d300-7000-8000-000000000010',
       '0195a2c0-1a00-7000-8000-000000000040',
       pu.id, v.supplier_id, v.supplier_name, v.amount, 'USD',
       v.reference, v.justification, v.flag, v.flagged_at, v.created_at
FROM (VALUES
    ('01a0b1c2-d300-7000-8000-000000000030'::uuid,
     '0195a2c0-1a00-7000-8000-000000000030'::uuid, 'Sandals Resorts',
     450000::bigint, 'SDL-88213',
     'Deposit to hold the ocean-view suite for the Nov 15 arrival.',
     'not_flagged', NULL::timestamptz, now() - interval '28 days'),
    ('01a0b1c2-d300-7000-8000-000000000031'::uuid,
     '0195a2c0-1a00-7000-8000-000000000032'::uuid, 'Island Routes Adventures',
     18500::bigint, 'IR-4471',
     'Catamaran sunset cruise for two, booked at the resort rate.',
     'not_flagged', NULL::timestamptz, now() - interval '9 days'),
    -- No supplier_id: a portal booking whose merchant is not in our supplier table. This is
    -- the row that proves the UI reads the snapshot rather than joining for a name.
    ('01a0b1c2-d300-7000-8000-000000000032'::uuid,
     NULL::uuid, 'NEGRIL TRANSFERS LTD',
     31600::bigint, NULL,
     'Airport transfers both ways. Booked through the resort portal.',
     'flagged', now() - interval '2 days', now() - interval '3 days')
) AS v(id, supplier_id, supplier_name, amount, reference, justification,
       flag, flagged_at, created_at)
CROSS JOIN LATERAL (
    SELECT pu.id FROM public.platform_user pu WHERE pu.role = 'agent' LIMIT 1
) pu
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- §3.2 agent worklist fixtures
--
-- Everything above this point was seeded for the CLIENT surface, and §3.2 rendered correct
-- and empty against it: no commission rows at all, no agent_availability, no
-- trip_status_history, nothing departing inside thirty days, and an empty `in_progress`
-- column on the pipeline board. A screen that is right and blank is the failure mode the
-- (client) layout's role gate was added to avoid — it reads as data loss rather than as an
-- empty book.
-- ============================================================

-- ── Three more trips ─────────────────────────────────────────────────────────────
--
-- Assigned to Maya rather than Jordan on purpose: Jordan is the §2.2 fixture and several
-- committed tests assert exact counts over Jordan's trips.
--
-- Between them these fill the two holes in the board — `in_progress` had no trip at all, and
-- the nearest departure was 64 days out, so "Travelers in next 30 days" was empty.

INSERT INTO public.trip (
    id, client_id, agent_id, title, trip_type, status,
    start_date, end_date, destinations, traveler_count,
    total_value_cents, total_paid_cents, total_commission_cents, currency, notes, created_at
) VALUES
    -- Travelling right now. The only row that exercises the in_progress stage.
    ('0195a2c0-1a00-7000-8000-000000000046',
     '0195a2c0-1a00-7000-8000-000000000013',
     '0195a2c0-1a00-7000-8000-000000000001',
     'Saint Lucia · Between Semesters', 'all_inclusive', 'in_progress',
     current_date - 2, current_date + 5, ARRAY['Soufriere, Saint Lucia'], 2,
     748000, 748000, 89760, 'USD',
     'Landed Tuesday. Resort has the anniversary note; nothing else scheduled.',
     now() - interval '40 days'),

    -- Departing inside the thirty-day window the worklist section is built on.
    ('0195a2c0-1a00-7000-8000-000000000047',
     '0195a2c0-1a00-7000-8000-000000000013',
     '0195a2c0-1a00-7000-8000-000000000001',
     'Cabo, Four Nights', 'all_inclusive', 'booked',
     current_date + 12, current_date + 16, ARRAY['Cabo San Lucas, Mexico'], 2,
     512000, 256000, 61440, 'USD',
     'Flights are theirs. Transfers still to confirm with the resort.',
     now() - interval '20 days'),

    -- A second departure, so the section is a list rather than a single row.
    ('0195a2c0-1a00-7000-8000-000000000048',
     '0195a2c0-1a00-7000-8000-000000000013',
     '0195a2c0-1a00-7000-8000-000000000001',
     'Bimini, Long Weekend', 'custom', 'booked',
     current_date + 26, current_date + 29, ARRAY['Bimini, Bahamas'], 4,
     396000, 99000, 47520, 'USD',
     'Four adults, two rooms. They asked about a fishing charter for the Saturday.',
     now() - interval '15 days');

-- The existing booked and completed trips get a plausible age, so the cycle-time KPI has
-- something other than "created and booked in the same instant" to average. Without this
-- every trip's created_at is the moment of the reset and inquiry-to-book is zero days.
UPDATE public.trip SET created_at = now() - interval '60 days'
 WHERE id = '0195a2c0-1a00-7000-8000-000000000040';
UPDATE public.trip SET created_at = now() - interval '700 days'
 WHERE id = '0195a2c0-1a00-7000-8000-000000000044';

-- ── Status history ───────────────────────────────────────────────────────────────
--
-- Data-Model §8.8 is explicit that this table accumulates FORWARD and that no backfill from
-- trip.status_changed_at can produce a cycle time. That is true in production; here the point
-- of a fixture is to let the screen be verified without waiting weeks for real transitions,
-- so this is synthetic on purpose and says so.
--
-- Every changed_at sits between its trip's created_at and now(), which is what keeps the
-- derived cycle time positive. One booking (trip 47) lands inside the current month, so
-- "Booked · month" has exactly one contributing trip and the number is checkable by hand.

INSERT INTO public.trip_status_history (id, trip_id, from_status, to_status, changed_at, changed_by_user_id)
SELECT v.id, v.trip_id, v.from_status, v.to_status, v.changed_at, pu.id
FROM (VALUES
    -- 40 · Negril. Booked 41 days ago, i.e. in a previous month.
    ('01a0b1c2-d300-7000-8000-000000000060'::uuid, '0195a2c0-1a00-7000-8000-000000000040'::uuid,
     'inquiry'::trip_status,  'proposal'::trip_status,    now() - interval '48 days'),
    ('01a0b1c2-d300-7000-8000-000000000061'::uuid, '0195a2c0-1a00-7000-8000-000000000040'::uuid,
     'proposal'::trip_status, 'booked'::trip_status,      now() - interval '41 days'),

    -- 44 · a completed trip from two years ago, so the average is not built from one shape.
    ('01a0b1c2-d300-7000-8000-000000000062'::uuid, '0195a2c0-1a00-7000-8000-000000000044'::uuid,
     'inquiry'::trip_status,  'proposal'::trip_status,    now() - interval '690 days'),
    ('01a0b1c2-d300-7000-8000-000000000063'::uuid, '0195a2c0-1a00-7000-8000-000000000044'::uuid,
     'proposal'::trip_status, 'booked'::trip_status,      now() - interval '685 days'),
    ('01a0b1c2-d300-7000-8000-000000000064'::uuid, '0195a2c0-1a00-7000-8000-000000000044'::uuid,
     'booked'::trip_status,   'in_progress'::trip_status, now() - interval '620 days'),
    ('01a0b1c2-d300-7000-8000-000000000065'::uuid, '0195a2c0-1a00-7000-8000-000000000044'::uuid,
     'in_progress'::trip_status, 'completed'::trip_status, now() - interval '610 days'),

    -- 46 · booked 22 days ago, departed 2 days ago.
    ('01a0b1c2-d300-7000-8000-000000000066'::uuid, '0195a2c0-1a00-7000-8000-000000000046'::uuid,
     'inquiry'::trip_status,  'proposal'::trip_status,    now() - interval '30 days'),
    ('01a0b1c2-d300-7000-8000-000000000067'::uuid, '0195a2c0-1a00-7000-8000-000000000046'::uuid,
     'proposal'::trip_status, 'booked'::trip_status,      now() - interval '22 days'),
    ('01a0b1c2-d300-7000-8000-000000000068'::uuid, '0195a2c0-1a00-7000-8000-000000000046'::uuid,
     'booked'::trip_status,   'in_progress'::trip_status, now() - interval '2 days'),

    -- 47 · THE one booked inside the current month. "Booked · month" should equal its value.
    ('01a0b1c2-d300-7000-8000-000000000069'::uuid, '0195a2c0-1a00-7000-8000-000000000047'::uuid,
     'inquiry'::trip_status,  'proposal'::trip_status,    now() - interval '14 days'),
    ('01a0b1c2-d300-7000-8000-00000000006a'::uuid, '0195a2c0-1a00-7000-8000-000000000047'::uuid,
     'proposal'::trip_status, 'booked'::trip_status,      now() - interval '3 days'),

    -- 45 · the cancelled one, so a terminal branch is represented.
    ('01a0b1c2-d300-7000-8000-00000000006b'::uuid, '0195a2c0-1a00-7000-8000-000000000045'::uuid,
     'proposal'::trip_status, 'cancelled'::trip_status,   now() - interval '200 days')
) AS v(id, trip_id, from_status, to_status, changed_at)
CROSS JOIN LATERAL (
    SELECT pu.id FROM public.platform_user pu WHERE pu.role = 'agent' LIMIT 1
) pu;

-- ── Payment milestones ───────────────────────────────────────────────────────────
--
-- Trip 40 already carries one scheduled milestone eleven days out. What was missing is an
-- OVERDUE one: days_until goes negative and the section's ordering puts it first, and neither
-- behaviour was exercised by any fixture.

INSERT INTO public.payment_milestone (
    id, trip_id, kind, label, amount_cents, currency, due_date, status, order_index
) VALUES
    ('0195a2c0-1a00-7000-8000-0000000000a3', '0195a2c0-1a00-7000-8000-000000000047',
     'final', 'Final balance', 256000, 'USD', current_date - 4, 'overdue', 1),
    ('0195a2c0-1a00-7000-8000-0000000000a4', '0195a2c0-1a00-7000-8000-000000000048',
     'deposit', 'Deposit', 99000, 'USD', current_date + 6, 'scheduled', 0);

-- ── Agent availability ───────────────────────────────────────────────────────────
--
-- Screen 3.2.3's availability layer is deferred because `time_off_blocks` is jsonb with no
-- declared schema — there is nothing to validate a parse against, which is the open item
-- Data-Model §7.4 cites as the reason pipeline_weight is a table instead. The row exists so
-- agent_availability_self() returns something and the deferral is a UI decision rather than
-- an empty read that looks like a bug.
--
-- calendar_sync_refresh_token_encrypted stays NULL. A seeded value is how a projection test
-- starts passing for the wrong reason.

INSERT INTO public.agent_availability (
    agent_id, weekly_schedule, response_time_hours, time_off_blocks, calendar_sync_provider
) VALUES (
    '0195a2c0-1a00-7000-8000-000000000001',
    '{"mon":["09:00","17:00"],"tue":["09:00","17:00"],"wed":["09:00","17:00"],'
    '"thu":["09:00","17:00"],"fri":["09:00","15:00"],"sat":[],"sun":[]}'::jsonb,
    4,
    '[{"starts_on":"2026-11-26","ends_on":"2026-11-29","reason":"Thanksgiving"},'
    '{"starts_on":"2026-12-24","ends_on":"2027-01-02","reason":"Christmas"}]'::jsonb,
    NULL
);


-- ============================================================
-- §3.3 client roster fixtures
--
-- Before this block the seed held THREE clients, and §3.3.1 is a screen with search, six
-- filter chips, a money column and pagination. Three rows exercise none of it: every filter
-- returns everything, the paginator never renders, and an empty state cannot be told from a
-- broken read.
--
-- The nine named clients below are each here for a state the roster has to render, and the
-- filler block after them exists only so the page window is crossed. NONE of them get an
-- `auth.users` row: an unclaimed client is one with no platform_user pointing at it (the
-- same fixture shape Maya Carter uses above), and hand-seeding GoTrue is how `confirmation_token`
-- NULLs turn every login into a 500.
--
-- WHY THE MONEY IS IN TRIPS AND NOT IN client.lifetime_value_cents. Nothing in the repository
-- maintains that column — see 20260926140000_agent_client_read_surface.sql. agent_client_roster()
-- derives lifetime value from committed trips, so seeding the cache would prove nothing and
-- seeding it WRONG is how a fixture starts agreeing with a bug.
-- ============================================================

INSERT INTO public.client (id, agent_id, first_name, last_name, preferred_name, email, phone, tags, status, lifetime_value_cents) VALUES
    -- No trips at all: the roster's "—" in both trip columns, and $0 with a NULL currency.
    ('0195a2c0-1a00-7000-8000-000000000100', '0195a2c0-1a00-7000-8000-000000000001',
     'Eli', 'Park', NULL, 'eli.park@example.com', '+1-555-0190', ARRAY['referral'], 'active', 0),

    -- Inquiry only: counts toward the header's "leads to qualify" and toward nothing else.
    ('0195a2c0-1a00-7000-8000-000000000101', '0195a2c0-1a00-7000-8000-000000000001',
     'Linda', 'Gomez', NULL, 'linda.gomez@example.com', NULL, ARRAY['new'], 'active', 0),

    -- Three committed trips spanning past and future, so this row is the one that drives
    -- BOTH the roster's "Last trip" and "Next trip" columns at once, and the only lifetime
    -- figure that sums more than two trips. (Until 20260930100000 it existed to make
    -- lifetime_currency_count = 2; Story-Tail is USD only, so that case is now impossible.)
    ('0195a2c0-1a00-7000-8000-000000000102', '0195a2c0-1a00-7000-8000-000000000001',
     'Priya', 'Raghunathan', 'Pri', 'priya.r@example.com', '+1-555-0191',
     ARRAY['vip','multi-destination'], 'active', 0),

    -- No email. `client.email` is nullable and the roster must not assume otherwise.
    ('0195a2c0-1a00-7000-8000-000000000103', '0195a2c0-1a00-7000-8000-000000000001',
     'Marcus', 'Webb', NULL, NULL, '+1-555-0192', ARRAY['cruise'], 'active', 0),

    -- Cancelled trip only: excluded from lifetime value AND from both trip columns, so the
    -- row reads exactly like Eli's despite having a trip.
    ('0195a2c0-1a00-7000-8000-000000000104', '0195a2c0-1a00-7000-8000-000000000001',
     'Dana', 'Okonkwo', NULL, 'dana.okonkwo@example.com', '+1-555-0193', ARRAY['family'], 'active', 0),

    -- Many tags, long name: the Tags cell and the Client cell both have to wrap or truncate.
    ('0195a2c0-1a00-7000-8000-000000000105', '0195a2c0-1a00-7000-8000-000000000001',
     'Annabelle', 'Fitzwilliam-Castellanos', 'Belle', 'annabelle.fc@example.com', '+1-555-0194',
     ARRAY['vip','honeymoon','all-inclusive','adults-only','repeat','referral'], 'active', 0),

    -- A second archived client, so the Archived chip returns more than one row.
    ('0195a2c0-1a00-7000-8000-000000000106', '0195a2c0-1a00-7000-8000-000000000001',
     'Curtis', 'Nakamura', NULL, 'curtis.n@example.com', NULL, ARRAY['cold'], 'archived', 0),

    -- A merged tombstone. agent_client_roster() must NEVER return this row, for any filter:
    -- there is no p_status value that can ask for it. rls_agent_clients.sql asserts that.
    ('0195a2c0-1a00-7000-8000-000000000107', '0195a2c0-1a00-7000-8000-000000000001',
     'Jordan', 'Hayes-Old', NULL, 'jordan.old@example.com', NULL, ARRAY[]::text[], 'merged_into', 0),

    -- Completed trip well in the past: drives the "Last trip" column with nothing in "Next".
    ('0195a2c0-1a00-7000-8000-000000000108', '0195a2c0-1a00-7000-8000-000000000001',
     'Tomás', 'Delgado', NULL, 'tomas.delgado@example.com', '+1-555-0195', ARRAY['repeat'], 'active', 0);

UPDATE public.client
   SET merged_into_client_id = (SELECT id FROM public.client WHERE email = 'jordan.hayes@example.com'),
       archived_at = now() - interval '200 days'
 WHERE id = '0195a2c0-1a00-7000-8000-000000000107';

UPDATE public.client
   SET archived_at = now() - interval '45 days'
 WHERE id = '0195a2c0-1a00-7000-8000-000000000106';

-- Trips for the named fixtures above.
INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status, start_date, end_date,
                         destinations, traveler_count, total_value_cents, total_paid_cents,
                         total_commission_cents, currency) VALUES
    ('0195a2c0-1a00-7000-8000-000000000110', '0195a2c0-1a00-7000-8000-000000000101',
     '0195a2c0-1a00-7000-8000-000000000001', 'Somewhere warm, February-ish', 'custom', 'inquiry',
     NULL, NULL, ARRAY[]::text[], 2, 0, 0, 0, 'USD'),

    ('0195a2c0-1a00-7000-8000-000000000111', '0195a2c0-1a00-7000-8000-000000000102',
     '0195a2c0-1a00-7000-8000-000000000001', 'Lisbon & the Douro Valley', 'multi_destination',
     'completed', current_date - 400, current_date - 388,
     ARRAY['Lisbon, Portugal','Porto, Portugal'], 2, 812000, 812000, 97440, 'USD'),

    ('0195a2c0-1a00-7000-8000-000000000112', '0195a2c0-1a00-7000-8000-000000000102',
     '0195a2c0-1a00-7000-8000-000000000001', 'Kyoto in the spring', 'multi_destination', 'booked',
     current_date + 60, current_date + 72, ARRAY['Kyoto, Japan','Tokyo, Japan'], 2,
     1140000, 285000, 136800, 'USD'),

    ('0195a2c0-1a00-7000-8000-000000000113', '0195a2c0-1a00-7000-8000-000000000102',
     '0195a2c0-1a00-7000-8000-000000000001', 'Amalfi Coast, slow', 'multi_destination', 'completed',
     current_date - 700, current_date - 690, ARRAY['Positano, Italy'], 2, 690000, 690000, 82800, 'USD'),

    ('0195a2c0-1a00-7000-8000-000000000114', '0195a2c0-1a00-7000-8000-000000000103',
     '0195a2c0-1a00-7000-8000-000000000001', 'Alaska, the inside passage', 'cruise', 'proposal',
     current_date + 150, current_date + 157, ARRAY['Juneau, AK','Skagway, AK'], 4, 0, 0, 0, 'USD'),

    ('0195a2c0-1a00-7000-8000-000000000115', '0195a2c0-1a00-7000-8000-000000000104',
     '0195a2c0-1a00-7000-8000-000000000001', 'Cabo, cancelled', 'all_inclusive', 'cancelled',
     current_date + 30, current_date + 37, ARRAY['Cabo San Lucas, Mexico'], 4, 540000, 0, 0, 'USD'),

    ('0195a2c0-1a00-7000-8000-000000000116', '0195a2c0-1a00-7000-8000-000000000105',
     '0195a2c0-1a00-7000-8000-000000000001', 'Maldives, overwater', 'all_inclusive', 'booked',
     current_date + 210, current_date + 220, ARRAY['Malé, Maldives'], 2, 2480000, 620000, 297600, 'USD'),

    ('0195a2c0-1a00-7000-8000-000000000117', '0195a2c0-1a00-7000-8000-000000000108',
     '0195a2c0-1a00-7000-8000-000000000001', 'Barcelona, long weekend', 'custom', 'completed',
     current_date - 120, current_date - 116, ARRAY['Barcelona, Spain'], 2, 318000, 318000, 38160, 'USD');

-- Filler, so the roster crosses a page window and the paginator is exercised rather than
-- merely written. Eighteen rows, deterministic ids derived from the index so a reset is
-- reproducible. Half carry one committed trip; the rest have none.
DO $$
DECLARE
    i        integer;
    firsts   text[] := ARRAY['Ava','Noah','Mia','Liam','Zoe','Omar','Ivy','Ruth','Kai',
                             'Nina','Hugo','Elsa','Amir','Cleo','Jonah','Rosa','Theo','Wren'];
    lasts    text[] := ARRAY['Bennett','Castillo','Duval','Ellison','Fontaine','Greaves',
                             'Halloran','Iyer','Jansen','Kowalski','Lindqvist','Moreau',
                             'Novak','Oyelaran','Prescott','Quintero','Rasmussen','Sandoval'];
    -- A FLAT array, wrapped at the call site. Postgres arrays are rectangular rather than
    -- arrays-of-arrays, so a single subscript into a text[][] yields a scalar and the insert
    -- fails with "column tags is of type text[] but expression is of type text".
    tagpool  text[] := ARRAY['cruise','family','vip','honeymoon','repeat','referral'];
    cid      uuid;
    tid      uuid;
BEGIN
    FOR i IN 1..18 LOOP
        cid := ('0195a2c0-1a00-7000-8000-0000000002' || lpad(i::text, 2, '0'))::uuid;
        INSERT INTO public.client (id, agent_id, first_name, last_name, email, phone, tags, status)
        VALUES (cid, '0195a2c0-1a00-7000-8000-000000000001',
                firsts[i], lasts[i],
                lower(firsts[i] || '.' || lasts[i] || '@example.com'),
                '+1-555-' || lpad((200 + i)::text, 4, '0'),
                ARRAY[tagpool[1 + (i % 6)]],
                'active');

        IF i % 2 = 0 THEN
            tid := ('0195a2c0-1a00-7000-8000-0000000003' || lpad(i::text, 2, '0'))::uuid;
            INSERT INTO public.trip (id, client_id, agent_id, title, trip_type, status,
                                     start_date, end_date, destinations, traveler_count,
                                     total_value_cents, total_paid_cents, total_commission_cents,
                                     currency)
            VALUES (tid, cid, '0195a2c0-1a00-7000-8000-000000000001',
                    'Getaway #' || i, 'all_inclusive', 'completed',
                    current_date - (90 + i * 7), current_date - (83 + i * 7),
                    ARRAY['Montego Bay, Jamaica'], 2,
                    (240000 + i * 15000)::bigint, (240000 + i * 15000)::bigint,
                    ((240000 + i * 15000) * 12 / 100)::bigint, 'USD');
        END IF;
    END LOOP;
END $$;



-- ============================================================
-- §3.3.2 – §3.3.8 client detail fixtures
--
-- Four of the six tabs had NOTHING to render before this block: client_note, companion and
-- travel_preference were empty tables, and audit_event held exactly one row. An accessor
-- that returns zero rows looks identical to a correct one, so every assertion about those
-- tabs would have compared a number against itself and passed for nothing. That is the trap
-- rls_agent_trip_detail.sql's header records having shipped once.
--
-- Everything here hangs off ANNABELLE FITZWILLIAM-CASTELLANOS rather than Jordan Hayes,
-- and the reason is a collision worth recording. rls_onboarding.sql gives Jordan the
-- travel_preference and companion rows "the wizard would have written" and then asserts
-- tight counts and exact values on them — `travel_styles = ARRAY['resort']`, one
-- companion named Alex. Seeding those tables for Jordan breaks three of its assertions
-- and, worse, `travel_preference.client_id` is UNIQUE so its INSERT fails outright.
--
-- Loosening that test to accommodate unrelated seed data would weaken a real scoping
-- assertion, so the fixtures moved instead. Annabelle has a booked trip, six tags and no
-- §2.x coupling. Jordan keeps the documents, conversations and trips that make the other
-- tabs real; between the two, every tab has something to render.
-- ============================================================

-- ── Travel preferences (§3.3.3's Preferences card) ───────────────────────────────
--
-- The vocabulary CHECKs from 20260904124903 bind these: values outside the allowed sets are
-- rejected, which is why they are written out rather than invented.
INSERT INTO public.travel_preference (
    id, client_id, preferred_destinations, travel_styles, dietary_restrictions,
    accessibility_needs, loyalty_programs, budget_band, favorite_past_trips, dietary_notes
)
SELECT
    '0195a2c0-1a00-7000-8000-000000000500',
    c.id,
    ARRAY['Caribbean', 'Bahamas', 'Jamaica'],
    -- The closed vocabulary from 20260904124903: resort · cruise · adventure · family ·
    -- romantic · group. "all_inclusive" and "beach" are NOT members and the CHECK rejects
    -- them — which is the constraint doing its job, not a seed to work around.
    ARRAY['resort', 'romantic', 'family'],
    ARRAY['pescatarian'],
    ARRAY[]::text[],
    '[{"program":"AAdvantage","number":"REDACTED","tier":"Platinum"},
      {"program":"Marriott Bonvoy","number":"REDACTED","tier":"Gold"}]'::jsonb,
    'premium',
    'Beaches Turks & Caicos — the quiet end of the resort.',
    'Partner is pescatarian; shellfish is a hard no, not a preference.'
FROM public.client c WHERE c.email = 'annabelle.fc@example.com';

-- ── Household (§3.3.3's companions card) ─────────────────────────────────────────
--
-- passport_number_encrypted stays NULL. agent_client_companions() cannot name that column
-- and an assertion enforces it; a seeded value is how a projection test starts passing for
-- the wrong reason.
INSERT INTO public.companion (
    id, client_id, first_name, last_name, relationship, date_of_birth,
    passport_expiry, passport_country, frequent_flyer_numbers, is_invited_to_platform
)
SELECT
    '0195a2c0-1a00-7000-8000-000000000510', c.id,
    'Dominic', 'Castellanos', 'spouse', '1990-11-03', '2027-02-14', 'US',
    '[{"airline":"AA","number":"REDACTED"}]'::jsonb, true
FROM public.client c WHERE c.email = 'annabelle.fc@example.com';

INSERT INTO public.companion (
    id, client_id, first_name, last_name, relationship, date_of_birth,
    passport_expiry, passport_country, is_invited_to_platform
)
SELECT
    '0195a2c0-1a00-7000-8000-000000000511', c.id,
    'Rosa', 'Castellanos', 'child', '2018-06-09', '2029-08-30', 'US', false
FROM public.client c WHERE c.email = 'annabelle.fc@example.com';

-- An ARCHIVED companion, so the accessor's `archived_at IS NULL` predicate is falsifiable.
-- Without one, dropping that line changes nothing and the test still passes.
INSERT INTO public.companion (
    id, client_id, first_name, last_name, relationship, is_invited_to_platform, archived_at
)
SELECT
    '0195a2c0-1a00-7000-8000-000000000512', c.id,
    'Gone', 'Companion', 'friend', false, now() - interval '60 days'
FROM public.client c WHERE c.email = 'annabelle.fc@example.com';

-- ── Internal notes (§3.3.7) ──────────────────────────────────────────────────────
--
-- The agent's own platform_user is the author: §3.3.7's purpose line is "Internal notes only
-- the agent sees", and author_user_id is what agent_client_notes() compares to decide
-- whether the edit affordance is offered.
INSERT INTO public.client_note (id, client_id, author_user_id, body, created_at, updated_at)
SELECT
    '0195a2c0-1a00-7000-8000-000000000520', c.id, pu.id,
    'Jordan asked about Greece for 2027 — worth pricing against a Sandals repeat. Save for fall outreach.',
    now() - interval '12 days', now() - interval '12 days'
FROM public.client c, public.platform_user pu
WHERE c.email = 'annabelle.fc@example.com' AND pu.role = 'agent';

INSERT INTO public.client_note (id, client_id, author_user_id, body, created_at, updated_at)
SELECT
    '0195a2c0-1a00-7000-8000-000000000521', c.id, pu.id,
    'Her mother is covering the deposit — check refund routing if this one is ever cancelled.',
    now() - interval '40 days', now() - interval '40 days'
FROM public.client c, public.platform_user pu
WHERE c.email = 'annabelle.fc@example.com' AND pu.role = 'agent';

INSERT INTO public.client_note (id, client_id, author_user_id, body, created_at, updated_at)
SELECT
    '0195a2c0-1a00-7000-8000-000000000522', c.id, pu.id,
    'Anniversary is Sep 14. Surprise is fine — Dominic is in on it.',
    now() - interval '95 days', now() - interval '90 days'
FROM public.client c, public.platform_user pu
WHERE c.email = 'annabelle.fc@example.com' AND pu.role = 'agent';

-- An ARCHIVED note, for the same reason as the archived companion.
INSERT INTO public.client_note (id, client_id, author_user_id, body, archived_at)
SELECT
    '0195a2c0-1a00-7000-8000-000000000523', c.id, pu.id,
    'Superseded note that must never reach the Notes tab.', now() - interval '5 days'
FROM public.client c, public.platform_user pu
WHERE c.email = 'annabelle.fc@example.com' AND pu.role = 'agent';

-- ── Activity (§3.3.8) ────────────────────────────────────────────────────────────
--
-- audit_event held ONE row, targeting a trip. The Activity tab unions client-targeted and
-- trip-targeted events, and with only one of each kind present the union is untestable: drop
-- either arm and the count barely moves. These give both arms something to lose.
--
-- ip_address and user_agent are set here ON PURPOSE even though the accessor cannot name
-- them — that is what makes the projection assertion meaningful rather than vacuous.
INSERT INTO public.audit_event (id, actor_user_id, actor_role, event_type, target_entity, target_id, metadata, ip_address, user_agent, created_at)
SELECT '0195a2c0-1a00-7000-8000-000000000530', pu.id, 'agent', 'client.updated', 'client', c.id,
       '{"fields":["phone"]}'::jsonb, '203.0.113.7'::inet, 'seed/1.0', now() - interval '3 days'
FROM public.client c, public.platform_user pu
WHERE c.email = 'annabelle.fc@example.com' AND pu.role = 'agent';

INSERT INTO public.audit_event (id, actor_user_id, actor_role, event_type, target_entity, target_id, metadata, created_at)
SELECT '0195a2c0-1a00-7000-8000-000000000531', pu.id, 'agent', 'client.tag_added', 'client', c.id,
       '{"tag":"all-inclusive"}'::jsonb, now() - interval '30 days'
FROM public.client c, public.platform_user pu
WHERE c.email = 'annabelle.fc@example.com' AND pu.role = 'agent';

INSERT INTO public.audit_event (id, actor_user_id, actor_role, event_type, target_entity, target_id, metadata, created_at)
SELECT '0195a2c0-1a00-7000-8000-000000000532', pu.id, 'agent', 'trip.status_changed', 'trip', t.id,
       '{"from":"proposal","to":"booked"}'::jsonb, now() - interval '20 days'
FROM public.trip t, public.platform_user pu
WHERE t.title = 'Maldives, overwater' AND pu.role = 'agent';

-- An event on ANOTHER client's trip. It must never reach Jordan's timeline, and without it
-- the union's scoping predicate is unfalsifiable.
INSERT INTO public.audit_event (id, actor_user_id, actor_role, event_type, target_entity, target_id, metadata, created_at)
SELECT '0195a2c0-1a00-7000-8000-000000000533', pu.id, 'agent', 'trip.status_changed', 'trip', t.id,
       '{"from":"inquiry","to":"proposal"}'::jsonb, now() - interval '2 days'
FROM public.trip t, public.platform_user pu
WHERE t.title = 'Kyoto in the spring' AND pu.role = 'agent';

-- ── One package component per trip that had none ────────────────────────────
--
-- THE PROBLEM THIS SOLVES, found 2026-09-28 when `trip.total_value_cents` became a computed
-- sum. Twenty-two of the twenty-six seeded trips carried a hand-set total and NOT ONE
-- component — $150,320 of money with nothing behind it. Every downstream fixture (payment
-- milestones, commission rows, the worklist's pipeline KPI) was balanced against those
-- numbers, and the Data-Model has always said the total is the sum of the components.
--
-- That was harmless while nothing could add a component. Screen 3.4.4 can, and the first
-- component added to any of those trips would have recomputed its total from that ONE line —
-- collapsing a $6,920 trip to $500 in front of the advisor who just added a transfer.
--
-- So each gets a single component carrying exactly what the trip already claimed. One row,
-- not an invented itinerary: it preserves every downstream number to the cent, it makes the
-- Data-Model's definition true for every trip rather than one, and it reads honestly —
-- an all-inclusive package really is often booked as a single line. A trip with a real
-- itinerary (0040) is left alone; this only fills in what was empty.
INSERT INTO public.trip_component (
    id, trip_id, kind, display_name, start_date, end_date,
    cost_cents, commission_pct, commission_cents, currency, payload, order_index
)
SELECT
    -- Deterministic, so a reset produces the same ids twice running.
    ('0195a2c0-1a00-7000-8000-0000000f' || lpad(row_number() OVER (ORDER BY t.id)::text, 4, '0'))::uuid,
    t.id,
    CASE t.trip_type
        WHEN 'cruise' THEN 'cruise'::public.component_kind
        WHEN 'all_inclusive' THEN 'hotel'::public.component_kind
        ELSE 'custom'::public.component_kind
    END,
    CASE t.trip_type
        WHEN 'cruise' THEN 'Sailing · package'
        WHEN 'all_inclusive' THEN 'Resort stay · all-inclusive package'
        WHEN 'group' THEN 'Group package'
        WHEN 'multi_destination' THEN 'Multi-stop package'
        ELSE 'Trip package'
    END,
    t.start_date, t.end_date,
    t.total_value_cents,
    CASE WHEN t.total_value_cents > 0
         THEN round((t.total_commission_cents::numeric / t.total_value_cents) * 100, 2)
         ELSE 0 END,
    t.total_commission_cents,
    t.currency,
    '{"notes":"Seed package — one line standing for a trip booked before the component builder existed."}'::jsonb,
    0
FROM public.trip t
WHERE t.total_value_cents > 0
  AND NOT EXISTS (
      SELECT 1 FROM public.trip_component c WHERE c.trip_id = t.id
  );

-- ============================================================
-- Payment milestones for every trip that claims a payment
--
-- THE SAME SHAPE AS THE PACKAGE-COMPONENT BLOCK ABOVE, and here for the same reason.
-- `20260929100000` made `trip.total_paid_cents` the sum of `payment_milestone.paid_cents`
-- and backfilled the rows to prove it — but `supabase db reset` applies migrations to an
-- EMPTY database and runs this file afterwards, so a migration cannot fix seed data. Every
-- trip below hand-sets `total_paid_cents`; without these rows a fresh database recreates
-- the exact inconsistency the migration exists to remove.
--
-- MUST STAY AT THE END, after every trip insert. The package-component block learned this
-- the hard way: placed earlier it covered 5 of 24 trips and looked like it worked.
--
-- Only trips with NO schedule. The three that have one — a part-paid booking, a booked trip
-- whose deposit has not landed, and one with an overdue final balance — are deliberate
-- fixtures for states the UI has to render, and a generated row beside a deliberate one is
-- how a fixture stops meaning anything.
-- ============================================================

INSERT INTO public.payment_milestone (
    id, trip_id, kind, label, amount_cents, currency,
    due_date, paid_at, paid_cents, status, order_index
)
SELECT
    ('0195a2c0-1a00-7000-8000-0000000e' || lpad(row_number() OVER (ORDER BY t.id)::text, 4, '0'))::uuid,
    t.id, 'deposit', 'Payment on file',
    t.total_paid_cents, t.currency,
    coalesce(t.start_date, current_date),
    coalesce(t.start_date::timestamptz, t.created_at),
    t.total_paid_cents, 'paid', 0
FROM public.trip t
WHERE t.total_paid_cents > 0
  AND NOT EXISTS (
      SELECT 1 FROM public.payment_milestone pm WHERE pm.trip_id = t.id
  );

-- Cabo's missing deposit, authored rather than generated. Its schedule holds a $2,560
-- "Final balance" marked overdue on a $5,120 trip, which implies a deposit of the same
-- amount was taken and never recorded — and the trip's own `total_paid_cents` said exactly
-- that. The migration deliberately leaves trips that already have a schedule alone; here we
-- are the author, so the gap is filled properly instead.
INSERT INTO public.payment_milestone (
    id, trip_id, kind, label, amount_cents, currency,
    due_date, paid_at, paid_cents, status, order_index
)
SELECT
    '0195a2c0-1a00-7000-8000-0000000e9001'::uuid,
    t.id, 'deposit', 'Deposit',
    256000, t.currency,
    t.start_date - 45, (t.start_date - 45)::timestamptz, 256000, 'paid', 0
FROM public.trip t
WHERE t.id = '0195a2c0-1a00-7000-8000-000000000047';

-- `total_paid_cents` is now whatever the milestones say, on every trip. Bimini keeps a
-- scheduled-but-unpaid deposit and therefore drops to zero — a booked trip waiting on its
-- deposit is a real state and nothing else in the seed covered it.
UPDATE public.trip t
   SET total_paid_cents = coalesce(sub.paid, 0)
  FROM (SELECT id FROM public.trip) all_trips
  LEFT JOIN (
    SELECT trip_id, sum(paid_cents) AS paid FROM public.payment_milestone GROUP BY trip_id
  ) sub ON sub.trip_id = all_trips.id
 WHERE t.id = all_trips.id
   AND t.total_paid_cents IS DISTINCT FROM coalesce(sub.paid, 0);

-- ── Commission ───────────────────────────────────────────────────────────────────
--
-- MUST STAY AT THE END, after every trip and component insert, for the reason the package
-- component block above records: placed earlier it covers whatever existed at the time and
-- looks like it worked.
--
-- WHAT THIS TABLE IS, SINCE 20260930140000. The reconciliation ledger, not the forecast.
-- The forecast derives from trip.total_commission_cents, which the 20260928100000 trigger
-- maintains as the sum of each trip's component commission. A row HERE means "invoiced to
-- or reconciled against Inteletravel".
--
-- SO 16 OF 22 REVENUE TRIPS HAVE NO ROW, DELIBERATELY. A booked trip that has not been
-- invoiced yet should have none, and the forecast sees its margin anyway through
-- total_commission_cents. Do NOT finish the pattern the package-component and
-- payment-milestone blocks above use. Those generate a row per trip because a TRIGGER made
-- the parent column a computed sum and the seed had to stop contradicting it. Nothing makes
-- commission a computed sum, and a generated row here would be inventing an invoice that
-- was never sent.
--
-- These six exercise §3.7: every status the forecast accepts, a fee that explains a
-- shortfall, and one that does not.

INSERT INTO public.commission (
    id, trip_id, agent_id, supplier_id, gross_booking_cents, commission_pct,
    expected_commission_cents, processing_fee_cents, received_commission_cents, currency,
    payment_terms, status, received_at, inteletravel_reference
) VALUES
    -- Trip 40, Sandals' line ALONE — 1,010,300 at 12%, which is exactly what the component
    -- records. It used to claim the whole trip value (1,284,500) at a flat 12%, which made
    -- the ledger say $1,541.40 where screen 3.4.2 said $1,318.36: the two flights on that
    -- trip are correctly 0% and a flat rate over the total cannot know that. The rest of
    -- trip 40's commission (transfer 1,400, catamaran 3,200, insurance 6,000) has no row
    -- here because it has not been invoiced.
    ('01a0b1c2-d300-7000-8000-000000000070', '0195a2c0-1a00-7000-8000-000000000040',
     '0195a2c0-1a00-7000-8000-000000000001', '0195a2c0-1a00-7000-8000-000000000030',
     1010300, 12.00, 121236, 0, 0, 'USD', '60 days after travel', 'expected', NULL, NULL),

    -- Two proposals, so `expected` appears on more than one pipeline stage.
    ('01a0b1c2-d300-7000-8000-000000000071', '0195a2c0-1a00-7000-8000-000000000041',
     '0195a2c0-1a00-7000-8000-000000000001', '0195a2c0-1a00-7000-8000-000000000030',
     964000, 12.00, 115680, 0, 0, 'USD', '60 days after travel', 'expected', NULL, NULL),
    ('01a0b1c2-d300-7000-8000-000000000072', '0195a2c0-1a00-7000-8000-000000000042',
     '0195a2c0-1a00-7000-8000-000000000001', '0195a2c0-1a00-7000-8000-000000000030',
     1912000, 12.00, 229440, 0, 0, 'USD', '60 days after travel', 'expected', NULL, NULL),

    -- `invoiced` rather than `expected`, so both pre-payment statuses are represented.
    ('01a0b1c2-d300-7000-8000-000000000073', '0195a2c0-1a00-7000-8000-000000000046',
     '0195a2c0-1a00-7000-8000-000000000001', '0195a2c0-1a00-7000-8000-000000000030',
     748000, 12.00, 89760, 0, 0, 'USD', '60 days after travel', 'invoiced', NULL,
     'ITV-2026-0912'),

    -- Trip 47 is an all-inclusive resort week. This row named supplier ...031 — AMERICAN
    -- AIRLINES, whose default_commission_pct is 0.00 — while storing a 12% rate: a resort
    -- booking filed against an airline that pays nothing. Both halves were wrong and
    -- neither was checkable, because commission_pct has no relationship to
    -- supplier.default_commission_pct in any constraint. constraints_commission.sql now
    -- asserts no row claims commission from a supplier that pays none.
    ('01a0b1c2-d300-7000-8000-000000000074', '0195a2c0-1a00-7000-8000-000000000047',
     '0195a2c0-1a00-7000-8000-000000000001', '0195a2c0-1a00-7000-8000-000000000030',
     512000, 12.00, 61440, 0, 0, 'USD', '60 days after travel', 'expected', NULL, NULL),

    -- RECONCILED, WITH A FEE. Expected 83,040, Inteletravel kept 1,246, 81,794 arrived:
    -- 83,040 - 1,246 - 81,794 = 0, so screen 3.7.6 shows this settled rather than short.
    -- Outside the forecast on both counts (completed trip, `received` status), and it is
    -- here so that a change which accidentally sweeps it in shows up as a number moving.
    ('01a0b1c2-d300-7000-8000-000000000075', '0195a2c0-1a00-7000-8000-000000000044',
     '0195a2c0-1a00-7000-8000-000000000001', '0195a2c0-1a00-7000-8000-000000000030',
     692000, 12.00, 83040, 1246, 81794, 'USD', '60 days after travel', 'received',
     current_date - 540, 'ITV-2025-0331'),

    -- NOT RECONCILED, AND THE FEE DOES NOT EXPLAIN IT. Expected 82,800, fee 1,242, only
    -- 79,000 arrived: 2,558 unaccounted for. This is the row screen 3.7.6 exists for and
    -- the row 3.7.1's "At risk · 1 disputed" KPI counts — the seed had neither a `disputed`
    -- nor a `lost` row before, so both that screen and that tile had nothing to render.
    ('01a0b1c2-d300-7000-8000-000000000076', '0195a2c0-1a00-7000-8000-000000000113',
     '0195a2c0-1a00-7000-8000-000000000001', '0195a2c0-1a00-7000-8000-000000000030',
     690000, 12.00, 82800, 1242, 79000, 'USD', '60 days after travel', 'disputed',
     current_date - 300, 'ITV-2025-0480');

COMMIT;
