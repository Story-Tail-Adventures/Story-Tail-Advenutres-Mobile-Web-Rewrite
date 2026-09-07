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
--   * Email addresses use example.com — RFC 2606 reserved. The prototype's
--     "jordan.hayes@gmail.com" is a real deliverable address and must never land here.
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

-- ── More trips for Jordan, one per renderable status ─────────────────────────
-- 0040 (booked, +67d, part-paid) already exists above and is the dashboard hero.

INSERT INTO public.trip (
    id, client_id, agent_id, title, trip_type, status, status_changed_at,
    start_date, end_date, destinations, traveler_count,
    total_value_cents, total_paid_cents, total_commission_cents, currency,
    cancellation_reason, refund_status, notes
)
SELECT v.id, c.id, '0195a2c0-1a00-7000-8000-000000000001',
       v.title, v.trip_type::public.trip_type, v.status::public.trip_status, v.changed_at,
       v.start_date, v.end_date, v.destinations, v.traveler_count,
       v.total_value_cents, v.total_paid_cents, v.total_commission_cents, 'USD',
       v.cancellation_reason, v.refund_status, v.notes
FROM public.client c
CROSS JOIN (VALUES
    -- Proposal ready: what 2.2.9's status-change sheet lands on.
    ('0195a2c0-1a00-7000-8000-000000000042'::uuid, 'Family Week in Turks', 'all_inclusive', 'proposal',
     now() - interval '2 days', (current_date + 150)::date, (current_date + 157)::date,
     ARRAY['Providenciales, Turks & Caicos'], 4, 1912000::bigint, 0::bigint, 229440::bigint,
     NULL::text, NULL::text, 'Two room-type options; they are deciding.'),
    -- Inquiry: no dates yet. Proves the UI survives null start_date.
    ('0195a2c0-1a00-7000-8000-000000000043'::uuid, 'Somewhere Quiet in December', 'custom', 'inquiry',
     now() - interval '9 days', NULL::date, NULL::date,
     ARRAY[]::text[], 2, 0::bigint, 0::bigint, 0::bigint,
     NULL::text, NULL::text, 'Open-ended. Wants "not a resort".'),
    -- Completed: the 2.2.11 memory view.
    ('0195a2c0-1a00-7000-8000-000000000044'::uuid, 'Beaches Turks & Caicos', 'all_inclusive', 'completed',
     now() - interval '600 days', (current_date - 610)::date, (current_date - 603)::date,
     ARRAY['Providenciales, Turks & Caicos'], 4, 692000::bigint, 692000::bigint, 83040::bigint,
     NULL::text, NULL::text, 'Sesame Street breakfast was the hit. Bight Reef snorkel.'),
    -- Cancelled: 2.2.10. cancellation_reason and refund_status are client-visible per §21.
    ('0195a2c0-1a00-7000-8000-000000000045'::uuid, 'Carnival Mardi Gras · Spring Break', 'cruise', 'cancelled',
     now() - interval '210 days', (current_date - 175)::date, (current_date - 168)::date,
     ARRAY['Port Canaveral, Florida'], 4, 318000::bigint, 176000::bigint, 0::bigint,
     'Family schedule conflict', 'Refunded $1,640 on Feb 12; $240 future-trip credit through Dec 2027',
     'They asked to rebook in the autumn.')
) AS v(id, title, trip_type, status, changed_at, start_date, end_date, destinations,
       traveler_count, total_value_cents, total_paid_cents, total_commission_cents,
       cancellation_reason, refund_status, notes)
WHERE c.email = 'jordan.hayes@example.com';

-- ── Trip components for the Negril trip ─────────────────────────────────────
-- cost_cents and commission_cents are populated on purpose: they are what the client column
-- grant withholds, so a leak has something to leak.

INSERT INTO public.trip_component (
    id, trip_id, kind, supplier_id, display_name, start_date, end_date, start_time, end_time,
    location, confirmation_number, cost_cents, commission_pct, commission_cents, payload, order_index
) VALUES
    ('0195a2c0-1a00-7000-8000-000000000070', '0195a2c0-1a00-7000-8000-000000000040',
     'flight', '0195a2c0-1a00-7000-8000-000000000031', 'AA 1413 · MIA → MBJ',
     current_date + 67, current_date + 67, '06:40', '09:30',
     'Miami International Airport', 'TLR8QV', 84200, 0.00, 0,
     '{"airline":"American Airlines","flight_number":"AA 1413","origin":"MIA","destination":"MBJ","cabin":"main","seat":"14A, 14B"}'::jsonb, 0),
    ('0195a2c0-1a00-7000-8000-000000000071', '0195a2c0-1a00-7000-8000-000000000040',
     'transfer', '0195a2c0-1a00-7000-8000-000000000032', 'Private transfer · Mercedes Vito',
     current_date + 67, current_date + 67, '10:20', '11:45',
     'Montego Bay', NULL, 14000, 10.00, 1400,
     '{"vehicle":"Mercedes Vito","duration_minutes":85}'::jsonb, 1),
    ('0195a2c0-1a00-7000-8000-000000000072', '0195a2c0-1a00-7000-8000-000000000040',
     'hotel', '0195a2c0-1a00-7000-8000-000000000030', 'Ocean-view suite · 7 nights',
     current_date + 67, current_date + 74, '15:00', '11:00',
     'Negril, Jamaica', 'SRB-220119', 1010300, 12.00, 121236,
     '{"room_type":"Ocean-view suite","board_basis":"all-inclusive","nights":7,"rate_cents_per_night":144328}'::jsonb, 2),
    ('0195a2c0-1a00-7000-8000-000000000073', '0195a2c0-1a00-7000-8000-000000000040',
     'excursion', '0195a2c0-1a00-7000-8000-000000000032', 'Catamaran to Booby Cay',
     current_date + 69, current_date + 69, '09:00', '15:00',
     'Negril Marina', 'IR-88214', 32000, 10.00, 3200,
     '{"duration_hours":6,"meeting_point":"Negril Marina, pier 2","includes":["snorkel gear","lunch"]}'::jsonb, 3);

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

-- ── Payment milestones (trip 0040) ──────────────────────────────────────────
-- Sums to total_value_cents 1284500; paid sums to total_paid_cents 500000.

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
     'trips/0040/negril-confirmation.pdf', false),
    ('0195a2c0-1a00-7000-8000-0000000000c1'::uuid, '0195a2c0-1a00-7000-8000-000000000010'::uuid,
     '0195a2c0-1a00-7000-8000-000000000040'::uuid, 'insurance_cert',
     'allianz-policy-987124.pdf', 'application/pdf', 634880::bigint,
     'trips/0040/allianz-policy-987124.pdf', false),
    -- is_sensitive on a passport, and the client must STILL be able to see it: the flag
    -- governs access logging, not visibility. This row is why document_self_select does not
    -- filter on it.
    ('0195a2c0-1a00-7000-8000-0000000000c2'::uuid, '0195a2c0-1a00-7000-8000-000000000011'::uuid,
     '0195a2c0-1a00-7000-8000-000000000040'::uuid, 'passport',
     'passport-jordan.jpg', 'image/jpeg', 1153434::bigint,
     'trips/0040/passport-jordan.jpg', true),
    ('0195a2c0-1a00-7000-8000-0000000000c3'::uuid, '0195a2c0-1a00-7000-8000-000000000011'::uuid,
     '0195a2c0-1a00-7000-8000-000000000044'::uuid, 'photo',
     'bight-reef.jpg', 'image/jpeg', 2411724::bigint,
     'trips/0044/bight-reef.jpg', false),
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


COMMIT;
