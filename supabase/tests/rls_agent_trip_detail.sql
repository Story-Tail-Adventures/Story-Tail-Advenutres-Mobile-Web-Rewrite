-- §3.4.2's read surface: that one trip's detail reaches its own advisor in full, reaches
-- nobody else at all, and that the three places this screen deliberately DIVERGES from the
-- traveler's rules are the divergences we meant.
--
-- WHY A SEPARATE FILE FROM rls_agent_reads.sql. That one asserts a property about a BOOK —
-- every trip the agent owns, and no more. These eight accessors take a trip id, so the
-- interesting failure is the opposite shape: a predicate that lets one specific foreign trip
-- through. Eight functions each carry their own `t.agent_id = current_agent_id()`, and each
-- one is a separate chance to omit it, so each gets its own cross-tenant assertion — the
-- lesson `agent_payments_due` taught the sibling file, where a missing predicate served every
-- advisor's payments to every other one with the whole suite green.
--
-- THREE FIXTURES BELOW EXIST TO MAKE ASSERTIONS FALSIFIABLE, and they are the point of the
-- setup section. The seed has no `csv_import` document, a published itinerary, and five
-- components that are all manual — so the exclusion, the draft gate and the manual/API split
-- would each be comparing a number against itself and passing for nothing. That is the trap
-- rls_agent_reads.sql's own header records having shipped once with `agent_unread_count`.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_trip_detail.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi  '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan '''0195a2c0-1a00-7000-8000-000000000011'''
\set trip   '''0195a2c0-1a00-7000-8000-000000000040'''

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

-- ── Fixtures that give each assertion something to be wrong about ────────────────

-- A `csv_import` document on this trip. `commission_import.document_id` points into the same
-- `document` table for a commission CSV that has no trip of its own, so one can land on a
-- trip incidentally — which is the whole reason agent_trip_documents excludes the kind. With
-- no such row in the seed, `count(*) WHERE kind = 'csv_import'` is 0 whether the predicate
-- exists or not, and deleting the predicate leaves the suite green.
INSERT INTO public.document (
    id, owner_user_id, client_id, trip_id, kind, filename, mime_type, size_bytes,
    storage_bucket, storage_key, checksum_sha256, is_sensitive)
SELECT '01a0b1c2-d300-7000-8000-0000000000d1',
       pu.id, t.client_id, t.id, 'csv_import',
       'inteletravel-commissions-2026-09.csv', 'text/csv', 40960,
       'trip-documents', 'imports/inteletravel-2026-09.csv',
       decode(repeat('00', 32), 'hex'), false
  FROM public.trip t
  JOIN public.platform_user pu ON pu.agent_id = t.agent_id
 WHERE t.id = :trip::uuid;

-- UNPUBLISH THE ITINERARY. The client policy gates itinerary reads on
-- `published_at IS NOT NULL`; the agent accessor deliberately does not, because an advisor
-- edits a draft before anyone sees it. The seed's itinerary is published, so with it left
-- alone an accessor that copied the client's gate verbatim would still return every day and
-- this file would certify a divergence it never exercised.
UPDATE public.itinerary
   SET published_at = NULL, last_published_at = NULL
 WHERE trip_id = :trip::uuid;

-- One component sourced from an API. All five are manual in the seed, so `manual = 5,
-- api = 0` is also what a broken split that counts every row as manual returns. 4/1 has no
-- constant that produces both.
UPDATE public.trip_component
   SET api_source = 'Amadeus'
 WHERE trip_id = :trip::uuid
   AND kind = 'flight';

-- AN ARCHIVED CONVERSATION, carrying a message and a last_message_at far in the future.
-- Nothing in the seed is archived, so both `cv.archived_at IS NULL` predicates — in
-- agent_trip_messages and in agent_trip_overview's activity CTE — could be deleted with
-- every assertion in this file still passing. The future date is what makes the second one
-- fail loudly: if the predicate goes, `last_activity_at` jumps to 2099 and the at-a-glance
-- grid reports activity on a trip nobody has touched.
INSERT INTO public.conversation (
    id, client_id, agent_id, trip_id, subject,
    last_message_at, last_message_preview, client_unread_count, agent_unread_count,
    archived_at)
SELECT '01a0b1c2-d300-7000-8000-0000000000e1',
       t.client_id, t.agent_id, t.id, 'Archived thread',
       timestamptz '2099-01-01 00:00:00+00', 'Filed away.', 0, 0, now()
  FROM public.trip t WHERE t.id = :trip::uuid;

INSERT INTO public.message (
    id, conversation_id, sender_user_id, sender_role, body, is_internal_note, created_at)
SELECT '01a0b1c2-d300-7000-8000-0000000000e2',
       '01a0b1c2-d300-7000-8000-0000000000e1',
       pu.id, 'agent', 'This thread was archived and must not appear.', false,
       timestamptz '2099-01-01 00:00:00+00'
  FROM public.platform_user pu
 WHERE pu.agent_id = '0195a2c0-1a00-7000-8000-000000000001';

-- ── Expectations, captured as the owner before dropping into the agent's role ────
--
-- Derived from the tables rather than restated as literals, so a seed edit moves both sides
-- together — and derived WITHOUT reusing the accessor's own expressions, which is how a
-- fixture ends up agreeing with the implementation by construction.
CREATE TEMP TABLE expected AS
SELECT (SELECT count(*) FROM public.trip_component
         WHERE trip_id = :trip::uuid AND archived_at IS NULL)                     AS components,
       (SELECT count(*) FROM public.trip_component
         WHERE trip_id = :trip::uuid AND archived_at IS NULL AND api_source IS NULL)
                                                                                   AS manual,
       (SELECT count(*) FROM public.payment_milestone WHERE trip_id = :trip::uuid) AS milestones,
       (SELECT count(*) FROM public.document
         WHERE trip_id = :trip::uuid AND archived_at IS NULL)                      AS documents,
       -- `c.archived_at IS NULL` here as well as in the function: the fixture above adds an
       -- archived thread, so an expectation that counted it would agree with a broken
       -- implementation and disagree with the correct one.
       (SELECT count(*) FROM public.message m JOIN public.conversation c
                                                ON c.id = m.conversation_id
         WHERE c.trip_id = :trip::uuid AND m.archived_at IS NULL
           AND c.archived_at IS NULL)                                              AS messages,
       (SELECT count(*) FROM public.trip_status_history WHERE trip_id = :trip::uuid)
                                                                                   AS history,
       (SELECT count(*) FROM public.itinerary_activity a
          JOIN public.itinerary_day d ON d.id = a.itinerary_day_id
          JOIN public.itinerary i ON i.id = d.itinerary_id
         WHERE i.trip_id = :trip::uuid)                                            AS activities,
       (SELECT min(due_date) FROM public.payment_milestone
         WHERE trip_id = :trip::uuid AND status IN ('scheduled', 'overdue')
           AND due_date IS NOT NULL)                                               AS next_unpaid,
       (SELECT (now() AT TIME ZONE a.time_zone)::date FROM public.agent a
         WHERE a.id = '0195a2c0-1a00-7000-8000-000000000001')                      AS today;

GRANT SELECT ON expected TO authenticated;

-- ── As the trip's own advisor ────────────────────────────────────────────────────

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_overview(:trip::uuid)) = 1,
    'agent_trip_overview() returns exactly one row for the advisor''s own trip');

-- THE PAIR THE WHOLE PATTERN RESTS ON, restated for this screen's own columns. Refused
-- directly one statement earlier, delivered through the accessor.
SELECT pg_temp.expect_denied(
    'SELECT notes FROM public.trip',
    'agent is refused trip.notes directly — the client column grant binds them too');
SELECT pg_temp.expect_denied(
    'SELECT cost_cents FROM public.trip_component',
    'agent is refused trip_component.cost_cents directly');

SELECT pg_temp.assert(
    (SELECT notes IS NOT NULL AND total_commission_cents <> '0'
       FROM public.agent_trip_overview(:trip::uuid)),
    'agent_trip_overview() DOES return notes and total_commission_cents');
SELECT pg_temp.assert(
    (SELECT bool_and(cost_cents ~ '^-?\d+$') FROM public.agent_trip_components(:trip::uuid)),
    'agent_trip_components() DOES return cost_cents, as a digit-string');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_components(:trip::uuid))
        = (SELECT components FROM expected)
      AND (SELECT components FROM expected) > 0,
    'agent_trip_components() returns every live component on the trip');

SELECT pg_temp.assert(
    (SELECT manual_component_count = (SELECT manual FROM expected)
        AND api_component_count = (SELECT components - manual FROM expected)
        AND component_count = (SELECT components FROM expected)
       FROM public.agent_trip_overview(:trip::uuid)),
    'the manual/API split counts each source separately — 4 and 1, not 5 and 0');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_payments(:trip::uuid))
        = (SELECT milestones FROM expected)
      AND (SELECT milestones FROM expected) > 0,
    'agent_trip_payments() returns every milestone, paid ones included');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_activity(:trip::uuid))
        = (SELECT history FROM expected)
      AND (SELECT history FROM expected) > 0,
    'agent_trip_activity() returns the trip''s status history');
SELECT pg_temp.assert(
    (SELECT bool_and(changed_by_name IS NOT NULL)
       FROM public.agent_trip_activity(:trip::uuid)),
    'and resolves changed_by_user_id to a display name rather than a bare uuid');

-- THE DRAFT GATE, INVERTED. This is the divergence from the client policy, and the fixture
-- above removed `published_at` precisely so this can fail.
SELECT pg_temp.assert(
    (SELECT published_at IS NULL FROM public.agent_trip_itinerary_meta(:trip::uuid)),
    'the itinerary under test is unpublished — the fixture took effect');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_itinerary_meta(:trip::uuid)) = 1,
    'agent_trip_itinerary_meta() returns an UNPUBLISHED itinerary — an advisor edits the '
    'draft, so copying the client''s published_at gate here would blank the tab');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_itinerary_days(:trip::uuid))
        >= (SELECT activities FROM expected)
      AND (SELECT activities FROM expected) > 0,
    'and its days and activities come back too');

-- THE INTERNAL NOTE, ALSO INVERTED. The client-side policy hides it from the traveler; this
-- one must show it to the advisor who wrote it.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_messages(:trip::uuid))
        = (SELECT messages FROM expected),
    'agent_trip_messages() returns every message on the trip''s threads');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_messages(:trip::uuid) WHERE is_internal_note) > 0,
    'INCLUDING the internal note — withheld from the traveler, never from the advisor');

-- ARCHIVED THREADS ARE NOT INCLUDED, matching agent_inbox and the client policy. Archiving
-- is the advisor's only way to put a thread down; a tab that keeps listing it makes the
-- gesture do nothing.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_messages(:trip::uuid)
      WHERE body = 'This thread was archived and must not appear.') = 0,
    'and NOT the archived thread''s message');
SELECT pg_temp.assert(
    (SELECT last_activity_at < timestamptz '2090-01-01 00:00:00+00'
       FROM public.agent_trip_overview(:trip::uuid)),
    'last_activity_at ignores the archived thread — its 2099 timestamp must not surface as '
    'activity on a trip nobody has touched');

-- THE DOCUMENT ALLOWLIST. The `receipt` is the agency''s own filing and must arrive; the
-- `csv_import` fixture must not.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_documents(:trip::uuid) WHERE kind = 'receipt') > 0,
    'agent_trip_documents() returns a receipt — a kind the client allowlist withholds');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_documents(:trip::uuid)
      WHERE kind = 'csv_import') = 0,
    'and NEVER a csv_import — commission_import.document_id points at this same table, so '
    'admitting the kind puts cross-client agency financials on one traveler''s tab');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_documents(:trip::uuid))
        = (SELECT documents - 1 FROM expected),
    'the csv_import row is the only one excluded — the predicate is not over-broad');

-- The two dates the status chip is derived from. `as_of_date` is computed in the AGENT's
-- zone, not the server's: a chip that flips a day early at each month edge is the bug.
SELECT pg_temp.assert(
    (SELECT as_of_date = (SELECT today FROM expected)
       FROM public.agent_trip_overview(:trip::uuid)),
    'as_of_date is today in the agent''s own time zone');
SELECT pg_temp.assert(
    (SELECT next_unpaid_due_date = (SELECT next_unpaid FROM expected)
       FROM public.agent_trip_overview(:trip::uuid)),
    'next_unpaid_due_date is the earliest scheduled or overdue milestone, skipping paid ones');

-- Money crosses as a digit-string everywhere, not as a JSON number.
SELECT pg_temp.assert(
    (SELECT total_value_cents ~ '^-?\d+$' AND total_paid_cents ~ '^-?\d+$'
        AND total_commission_cents ~ '^-?\d+$'
       FROM public.agent_trip_overview(:trip::uuid)),
    'agent_trip_overview() renders money as digit-strings');
SELECT pg_temp.assert(
    (SELECT bool_and(amount_cents ~ '^-?\d+$' AND paid_cents ~ '^-?\d+$')
       FROM public.agent_trip_payments(:trip::uuid)),
    'agent_trip_payments() renders money as digit-strings');

-- A trip id that does not exist is zero rows, not an error — the same answer "not yours"
-- gets, so neither can be told from the other by probing.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_overview(
        '01a0b1c2-d300-7000-8000-00000000dead'::uuid)) = 0,
    'an unknown trip id returns zero rows rather than raising');

RESET ROLE;

-- ── As the traveler whose trip it is ─────────────────────────────────────────────
--
-- The strongest version of the client test: not a stranger, but the very client the trip
-- belongs to and who can read much of it through their own policies. `current_agent_id()` is
-- NULL for them, so every accessor must still answer nothing.

SELECT pg_temp.become(:jordan::uuid);

SELECT pg_temp.assert(public.current_agent_id() IS NULL,
    'the trip''s own traveler has no agent id');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_overview(:trip::uuid)) = 0
      AND (SELECT count(*) FROM public.agent_trip_components(:trip::uuid)) = 0
      AND (SELECT count(*) FROM public.agent_trip_itinerary_meta(:trip::uuid)) = 0
      AND (SELECT count(*) FROM public.agent_trip_itinerary_days(:trip::uuid)) = 0
      AND (SELECT count(*) FROM public.agent_trip_payments(:trip::uuid)) = 0
      AND (SELECT count(*) FROM public.agent_trip_documents(:trip::uuid)) = 0
      AND (SELECT count(*) FROM public.agent_trip_messages(:trip::uuid)) = 0
      AND (SELECT count(*) FROM public.agent_trip_activity(:trip::uuid)) = 0,
    'all eight accessors return nothing to the traveler who owns the trip — including the '
    'internal note and the cost columns their own policies withhold');

RESET ROLE;

-- ── As a second advisor ──────────────────────────────────────────────────────────
--
-- One advisor exists in the seed, so tenancy is untested by it and a missing predicate fails
-- in the direction that looks healthy: MORE rows. Each accessor carries its own, so each
-- needs its own assertion.

INSERT INTO public.agent (id, display_name, email, status)
VALUES ('0195a2c0-1a00-7000-8000-0000000000f1', 'Detail Advisor',
        'detail.advisor@example.com', 'active');

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES ('0195a2c0-1a00-7000-8000-0000000000f2',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'detail.advisor.login@example.com', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ('{"first_name":"Detail","last_name":"Advisor",'
         || '"agent_id":"0195a2c0-1a00-7000-8000-000000000001"}')::jsonb,
        now(), now(), '', '', '', '');

-- Promote exactly as seed.sql does, then drop the stand-in client the trigger attached to
-- Gyasi's book — the cleanup rls_agent_reads.sql records having once only promised.
DO $$
DECLARE v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id
      FROM public.platform_user
     WHERE account_id = '0195a2c0-1a00-7000-8000-0000000000f2';

    UPDATE public.platform_user
       SET role = 'agent', agent_id = '0195a2c0-1a00-7000-8000-0000000000f1', client_id = NULL
     WHERE account_id = '0195a2c0-1a00-7000-8000-0000000000f2';

    DELETE FROM public.client WHERE id = v_client_id;
END $$;

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-0000000000f2'::uuid);

SELECT pg_temp.assert(
    public.current_agent_id() = '0195a2c0-1a00-7000-8000-0000000000f1'::uuid,
    'the second advisor resolves to their own agent id');

-- Spelled out one accessor per assertion rather than folded into a conjunction: a single
-- combined test names no function when it fails, and the failure that matters is exactly
-- "which one lost its predicate".
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_overview(:trip::uuid)) = 0,
    'agent_trip_overview() gives the second advisor nothing of Gyasi''s trip');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_components(:trip::uuid)) = 0,
    'agent_trip_components() gives them no components — including cost_cents, the margin');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_itinerary_meta(:trip::uuid)) = 0,
    'agent_trip_itinerary_meta() gives them no itinerary');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_itinerary_days(:trip::uuid)) = 0,
    'agent_trip_itinerary_days() gives them no days');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_payments(:trip::uuid)) = 0,
    'agent_trip_payments() gives them no milestones');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_documents(:trip::uuid)) = 0,
    'agent_trip_documents() gives them no documents — a passport is on this trip');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_messages(:trip::uuid)) = 0,
    'agent_trip_messages() gives them no messages — the internal note is on this trip');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_activity(:trip::uuid)) = 0,
    'agent_trip_activity() gives them no history');

RESET ROLE;

-- ── As an anonymous visitor ──────────────────────────────────────────────────────

SET LOCAL ROLE anon;

SELECT pg_temp.expect_denied('SELECT * FROM public.agent_trip_overview(NULL)',
    'anon cannot execute agent_trip_overview()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_trip_components(NULL)',
    'anon cannot execute agent_trip_components()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_trip_itinerary_meta(NULL)',
    'anon cannot execute agent_trip_itinerary_meta()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_trip_itinerary_days(NULL)',
    'anon cannot execute agent_trip_itinerary_days()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_trip_payments(NULL)',
    'anon cannot execute agent_trip_payments()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_trip_documents(NULL)',
    'anon cannot execute agent_trip_documents()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_trip_messages(NULL)',
    'anon cannot execute agent_trip_messages()');
SELECT pg_temp.expect_denied('SELECT * FROM public.agent_trip_activity(NULL)',
    'anon cannot execute agent_trip_activity()');

RESET ROLE;

-- ── The write, and the grant that is the only thing making it safe ───────────────
--
-- `agent_set_trip_notes` takes p_agent_id as TRUSTED input. Granting it to a client role
-- turns that parameter into an act-as-any-agent primitive reachable from a browser, with no
-- audit_event — the Edge Function being the only door is what the grant enforces.

SELECT pg_temp.assert(
    NOT has_function_privilege('authenticated',
        'public.agent_set_trip_notes(uuid, uuid, text, integer)', 'EXECUTE')
      AND NOT has_function_privilege('anon',
        'public.agent_set_trip_notes(uuid, uuid, text, integer)', 'EXECUTE'),
    'agent_set_trip_notes is service_role only — p_agent_id is trusted input');

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.expect_denied(
    'SELECT * FROM public.agent_set_trip_notes(NULL, NULL, NULL, NULL)',
    'not even the agent themselves can call the notes write directly');
RESET ROLE;

-- ── The projections, asserted from the catalog ───────────────────────────────────
--
-- The property an Edge Function's hand-written column list cannot have: a withheld column is
-- unnameable, not merely unselected, so no later edit can add it back by touching only a
-- SELECT list.

SELECT pg_temp.assert(
    pg_get_function_result('public.agent_trip_components'::regproc) NOT LIKE '%payload%',
    'agent_trip_components() cannot name trip_component.payload');
SELECT pg_temp.assert(
    pg_get_function_result('public.agent_trip_documents'::regproc) NOT LIKE '%storage_%'
      AND pg_get_function_result('public.agent_trip_documents'::regproc) NOT LIKE '%checksum%',
    'agent_trip_documents() cannot name a server-only storage column');
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM unnest(ARRAY[
            'agent_trip_overview', 'agent_trip_components', 'agent_trip_itinerary_meta',
            'agent_trip_itinerary_days', 'agent_trip_payments', 'agent_trip_documents',
            'agent_trip_messages', 'agent_trip_activity'
        ]) AS fn
         WHERE pg_get_function_result(('public.' || fn)::regproc) LIKE '%stripe%'
    ),
    'no §3.4.2 accessor names a Stripe token — the card line is brand, last4 and the cap');

-- The pin, on every one of them. The §3.2 migration's guard cannot cover these: a DO block
-- runs once, inside its own migration's transaction, against the catalog as it stood then.
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname LIKE 'agent\_trip\_%'
           AND p.prosecdef
           AND NOT EXISTS (
                SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
                 WHERE cfg LIKE 'search\_path=%'
                   AND btrim((string_to_array(substr(cfg, length('search_path=') + 1), ','))[
                           cardinality(string_to_array(substr(cfg, length('search_path=') + 1), ','))],
                       ' "') = 'pg_temp')
    ),
    'every §3.4.2 accessor ends its search_path with pg_temp');

ROLLBACK;
