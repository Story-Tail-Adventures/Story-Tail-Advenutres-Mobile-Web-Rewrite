-- Assertions for the §2.2 client read policies: trip_component, itinerary, itinerary_day,
-- itinerary_activity, proposal, conversation, message, message_attachment, document,
-- payment_milestone and testimonial.
--
-- Companion to rls_auth_bridge.sql and rls_onboarding.sql, and it exists for the same
-- reason: a policy that passes the happy path and leaks to another user looks identical to
-- a working one until you execute it as that other user. Three of the eleven policies here
-- are not the obvious predicate, and each has a poison row in seed.sql aimed squarely at it.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_trip_graph.sql
--
-- Any failed assertion raises and, with ON_ERROR_STOP=1, exits non-zero.

\set ON_ERROR_STOP on

BEGIN;

-- Seeded ids, from supabase/seed.sql.
\set gyasi_acct  '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan_acct '''0195a2c0-1a00-7000-8000-000000000011'''
\set sam_acct    '''0195a2c0-1a00-7000-8000-000000000012'''

\set trip_negril   '''0195a2c0-1a00-7000-8000-000000000040'''
\set trip_proposal '''0195a2c0-1a00-7000-8000-000000000042'''
\set itin_published '''0195a2c0-1a00-7000-8000-000000000080'''

CREATE OR REPLACE FUNCTION pg_temp.assert(condition boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition THEN
        RAISE NOTICE '  ok    %', description;
    ELSE
        RAISE EXCEPTION 'FAILED: %', description;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.become(account uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', account::text, 'role', 'authenticated')::text,
        true
    );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.become_anon()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$;

-- Selecting a column the role has no privilege on raises 42501, same class as an INSERT
-- with no policy. That is the mechanism the column grants rely on, so it is what we assert.
CREATE OR REPLACE FUNCTION pg_temp.expect_denied(stmt text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected a privilege error', description;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE '  ok    %', description;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.count_of(stmt text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
    EXECUTE stmt INTO n;
    RETURN n;
END;
$$;

\echo ''
\echo '── As Jordan (a client with five trips) ──────────────────────────────────'

SELECT pg_temp.become(:jordan_acct);

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.trip') = 5,
    'trip — sees own five trips (booked, proposal, inquiry, completed, cancelled)');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.trip WHERE id = ''0195a2c0-1a00-7000-8000-000000000041''') = 0,
    'trip — cannot see another client''s trip');

-- ── trip_component ──────────────────────────────────────────────────────────
SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.trip_component') = 5,
    'trip_component — sees the five components of their own trip');

SELECT pg_temp.expect_denied(
    'SELECT cost_cents FROM public.trip_component LIMIT 1',
    'trip_component.cost_cents — withheld (agency cost, reveals margin)');

SELECT pg_temp.expect_denied(
    'SELECT commission_cents FROM public.trip_component LIMIT 1',
    'trip_component.commission_cents — withheld');

-- The payload decision: withheld precisely because the hotel shape carries
-- rate_cents_per_night, which would undo the cost_cents withholding.
SELECT pg_temp.expect_denied(
    'SELECT payload FROM public.trip_component LIMIT 1',
    'trip_component.payload — withheld (carries rate_cents_per_night)');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM (SELECT kind FROM public.trip_component) q') = 5,
    'trip_component.kind — granted, against its Internal marker (icons and empty states)');

-- The insurance component is what §2.2.4's Important info panel reads its policy number
-- from, so its presence is part of the fixture rather than incidental.
SELECT pg_temp.assert(
    pg_temp.count_of(
      'SELECT count(*) FROM public.trip_component WHERE kind = ''insurance''') = 1,
    'trip_component — the insurance component is readable (Important info reads it)');

-- ── itinerary: THE DRAFT GATE ───────────────────────────────────────────────
SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.itinerary') = 1,
    'itinerary — sees exactly one, the published itinerary');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.itinerary WHERE id = ''0195a2c0-1a00-7000-8000-000000000085''') = 0,
    'itinerary — the UNPUBLISHED draft on their own trip is invisible (published_at gate)');

SELECT pg_temp.assert(
    pg_temp.count_of(
      'SELECT count(*) FROM public.itinerary WHERE intro_note LIKE ''DRAFT%''') = 0,
    'itinerary.intro_note — no draft copy in Gyasi''s voice leaks');

SELECT pg_temp.expect_denied(
    'SELECT version FROM public.itinerary LIMIT 1',
    'itinerary.version — withheld (concurrency bookkeeping)');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.itinerary_day') = 4,
    'itinerary_day — sees the four days of the published itinerary only');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.itinerary_day WHERE id = ''0195a2c0-1a00-7000-8000-000000000086''') = 0,
    'itinerary_day — the draft itinerary''s day is invisible (gate inherited)');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.itinerary_activity') = 4,
    'itinerary_activity — sees the four activities');

SELECT pg_temp.assert(
    pg_temp.count_of(
      'SELECT count(*) FROM public.itinerary_activity WHERE gyasis_tip IS NOT NULL') = 3,
    'itinerary_activity.gyasis_tip — granted; it is the point of §2.2.4');

SELECT pg_temp.assert(
    pg_temp.count_of(
      'SELECT count(*) FROM public.itinerary_day WHERE weather_forecast IS NOT NULL') = 3,
    'itinerary_day.weather_forecast — granted; no live weather API is needed at MVP');

-- ── proposal ────────────────────────────────────────────────────────────────
SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.proposal') = 1,
    'proposal — sees only the one actually sent');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.proposal WHERE id = ''0195a2c0-1a00-7000-8000-0000000000e0''') = 0,
    'proposal — the unsent draft is invisible (sent_at gate)');

SELECT pg_temp.expect_denied(
    'SELECT snapshot FROM public.proposal LIMIT 1',
    'proposal.snapshot — withheld; it embeds per-component cost and commission');

SELECT pg_temp.expect_denied(
    'SELECT viewed_at FROM public.proposal LIMIT 1',
    'proposal.viewed_at — withheld (agent intelligence, not the client''s business)');

-- ── conversation and message: THE INTERNAL-NOTE FILTER ──────────────────────
SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.conversation') = 1,
    'conversation — sees their own thread');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM (SELECT client_unread_count FROM public.conversation) q') = 1,
    'conversation.client_unread_count — granted; §2.2.3 renders "2 unread"');

SELECT pg_temp.expect_denied(
    'SELECT agent_unread_count FROM public.conversation LIMIT 1',
    'conversation.agent_unread_count — withheld (how behind the agent is, is not client data)');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.message') = 4,
    'message — sees four of the five messages in their own thread');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.message WHERE id = ''0195a2c0-1a00-7000-8000-0000000000b4''') = 0,
    'message — the agent''s INTERNAL note is invisible (row filter, not column grant)');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.message WHERE body LIKE ''INTERNAL:%''') = 0,
    'message — no internal-note body leaks under any projection');

SELECT pg_temp.expect_denied(
    'SELECT is_internal_note FROM public.message LIMIT 1',
    'message.is_internal_note — withheld as well as filtered');

SELECT pg_temp.expect_denied(
    'SELECT read_by_other_at FROM public.message LIMIT 1',
    'message.read_by_other_at — withheld (read receipts are undecided)');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.message_attachment') = 1,
    'message_attachment — sees the attachment on a readable message');

-- ── document: THE BLOB-TABLE ALLOWLIST ──────────────────────────────────────
SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.document') = 4,
    'document — sees four client-facing documents');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.document WHERE id = ''0195a2c0-1a00-7000-8000-0000000000c4''') = 0,
    'document — a supplier-charge RECEIPT on their own trip is invisible (kind allowlist)');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.document WHERE id = ''0195a2c0-1a00-7000-8000-0000000000c2''') = 1,
    'document — their own passport IS visible even though is_sensitive is true');

SELECT pg_temp.expect_denied(
    'SELECT storage_key FROM public.document LIMIT 1',
    'document.storage_key — withheld; a client can never name a storage object');

SELECT pg_temp.expect_denied(
    'SELECT storage_bucket FROM public.document LIMIT 1',
    'document.storage_bucket — withheld');

SELECT pg_temp.expect_denied(
    'SELECT is_sensitive FROM public.document LIMIT 1',
    'document.is_sensitive — withheld (internal logging flag)');

-- ── payment_milestone and testimonial ───────────────────────────────────────
SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.payment_milestone') = 3,
    'payment_milestone — sees the full schedule for their own trip');

SELECT pg_temp.assert(
    pg_temp.count_of(
      'SELECT coalesce(sum(paid_cents),0) FROM public.payment_milestone WHERE status = ''paid''') = 500000,
    'payment_milestone — paid milestones sum to trip.total_paid_cents');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.testimonial') = 1,
    'testimonial — sees their own reflection');

SELECT pg_temp.expect_denied(
    'SELECT approved_by_user_id FROM public.testimonial LIMIT 1',
    'testimonial.approved_by_user_id — withheld (which agent approved is agency workflow)');

-- ── the two columns trip_self_select already withheld, as a regression ──────
SELECT pg_temp.expect_denied(
    'SELECT notes FROM public.trip LIMIT 1',
    'trip.notes — still withheld (regression on trip_self_select)');

SELECT pg_temp.expect_denied(
    'SELECT total_commission_cents FROM public.trip LIMIT 1',
    'trip.total_commission_cents — still withheld (regression)');

\echo ''
\echo '── As Sam, a DIFFERENT client of the same agent ──────────────────────────'

SELECT pg_temp.become(:sam_acct);

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.trip') = 0,
    'trip — Sam has no trips of their own and sees none of Jordan''s');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.trip_component') = 0,
    'trip_component — nothing across the tenant boundary');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.itinerary') = 0,
    'itinerary — nothing across the tenant boundary');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.itinerary_day') = 0,
    'itinerary_day — nothing across the tenant boundary');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.itinerary_activity') = 0,
    'itinerary_activity — nothing across the tenant boundary');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.conversation') = 0,
    'conversation — nothing across the tenant boundary');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.message') = 0,
    'message — nothing across the tenant boundary');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.message_attachment') = 0,
    'message_attachment — nothing across the tenant boundary');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.document') = 0,
    'document — nothing across the tenant boundary');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.payment_milestone') = 0,
    'payment_milestone — nothing across the tenant boundary');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.testimonial') = 0,
    'testimonial — nothing across the tenant boundary');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.proposal') = 0,
    'proposal — nothing across the tenant boundary');

\echo ''
\echo '── As Gyasi (an AGENT) ───────────────────────────────────────────────────'
\echo '   An agent is also the role `authenticated`, and platform_user.client_id is NULL'
\echo '   for them, so every predicate here evaluates NULL and returns nothing. Agents'
\echo '   read this graph through the service role until §3.x lands its own policies.'

SELECT pg_temp.become(:gyasi_acct);

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.trip') = 0,
    'trip — the agent sees nothing through the client policy');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.itinerary') = 0,
    'itinerary — the agent sees nothing through the client policy');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.message') = 0,
    'message — the agent sees nothing through the client policy, not even their own notes');

SELECT pg_temp.assert(
    pg_temp.count_of('SELECT count(*) FROM public.document') = 0,
    'document — the agent sees nothing through the client policy');

\echo ''
\echo '── As anon ───────────────────────────────────────────────────────────────'

SELECT pg_temp.become_anon();

SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.itinerary',
    'itinerary — anon has no privilege at all');

SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.message',
    'message — anon has no privilege at all');

SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.document',
    'document — anon has no privilege at all');

SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.payment_milestone',
    'payment_milestone — anon has no privilege at all');

SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.testimonial',
    'testimonial — anon has no privilege at all; there is no public-surface policy yet');

SELECT pg_temp.expect_denied(
    'SELECT count(*) FROM public.message_attachment',
    'message_attachment — anon has no privilege at all');

RESET role;

\echo ''
\echo '── storage ───────────────────────────────────────────────────────────────'

SELECT pg_temp.assert(
    (SELECT NOT public FROM storage.buckets WHERE id = 'trip-documents'),
    'storage — the trip-documents bucket exists and is private');

-- The deliberate absence: no authenticated/anon policy on storage.objects. A client is never
-- granted document.storage_key, so it could never form a request that reached one anyway —
-- reads go through the audited signer Edge Function instead.
SELECT pg_temp.assert(
    (SELECT count(*) FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND ('authenticated' = ANY(roles) OR 'anon' = ANY(roles))) = 0,
    'storage.objects — no authenticated or anon policy, by design');

\echo ''
\echo '── write privileges ─────────────────────────────────────────────────────'
\echo '   RLS default-denies INSERT/UPDATE/DELETE with no policy, but TRUNCATE is NOT'
\echo '   subject to row level security — it is a plain table privilege. auto_expose_new'
\echo '   _tables had granted the whole write set on every table the initial migration'
\echo '   made, so 35 of 38 tables let anon TRUNCATE them until revoke_write_grants.'

-- NOTE: this deliberately joins pg_class/pg_namespace and passes `c.oid` rather than
-- filtering pg_tables and building 'public.'||tablename. The planner may evaluate a
-- SELECT-list or FILTER function before the WHERE predicate, so the string form asks
-- has_table_privilege about `public.instances` — a row that is really auth.instances — and
-- dies with "relation does not exist". The oid form does no name resolution at all.
SELECT pg_temp.assert(
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND (has_table_privilege('authenticated', c.oid, 'TRUNCATE')
         OR has_table_privilege('anon', c.oid, 'TRUNCATE'))) = 0,
    'no table in public grants TRUNCATE to anon or authenticated');

SELECT pg_temp.assert(
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND (has_table_privilege('authenticated', c.oid, 'INSERT')
         OR has_table_privilege('authenticated', c.oid, 'UPDATE')
         OR has_table_privilege('authenticated', c.oid, 'DELETE'))) = 0,
    'no table in public grants INSERT, UPDATE or DELETE to authenticated');

-- And the other half of that migration: revoking the write verbs must not have taken the
-- column-level SELECT grants with it. These counts are the grant lists, table by table.
SELECT pg_temp.assert(
    (SELECT count(*) FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'trip'
       AND grantee = 'authenticated' AND privilege_type = 'SELECT') = 22,
    'trip still has its 22 column-level SELECT grants (notes and commission excluded)');

SELECT pg_temp.assert(
    (SELECT count(*) FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'document'
       AND grantee = 'authenticated' AND privilege_type = 'SELECT') = 10,
    'document still has its 10 column-level SELECT grants');

ROLLBACK;
