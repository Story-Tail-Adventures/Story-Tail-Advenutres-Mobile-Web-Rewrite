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

COMMIT;
