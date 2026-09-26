-- §3.3.2 – §3.3.8's read surface: that one client's detail reaches their own advisor in
-- full, reaches nobody else at all, and that the columns each tab deliberately withholds
-- are unreachable rather than merely unselected.
--
-- WHY A SEPARATE FILE FROM rls_agent_clients.sql. That one asserts a property about a BOOK —
-- every client the agent owns, and no more. These seven accessors take a client id, so the
-- interesting failure is the opposite shape: a predicate that lets one specific foreign
-- client through. Each function carries its own `c.agent_id = current_agent_id()`, and each
-- one is a separate chance to omit it, so each gets its own cross-tenant assertion. That is
-- the lesson `agent_payments_due` taught rls_agent_reads.sql, where a missing predicate
-- served every advisor's payments to every other one with the whole suite green.
--
-- THE FIXTURES ARE THE POINT. Before §3.3's seed block, `client_note`, `companion` and
-- `travel_preference` were EMPTY and `audit_event` held one row. Every assertion about those
-- four tabs would have compared a number against itself. The seed now carries an archived
-- companion, an archived note, and an audit_event on ANOTHER client's trip, precisely so the
-- exclusions below can fail.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/rls_agent_client_detail.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi  '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan '''0195a2c0-1a00-7000-8000-000000000011'''

CREATE OR REPLACE FUNCTION pg_temp.assert(condition boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition THEN RAISE NOTICE '  ok    %', description;
    ELSE RAISE EXCEPTION 'FAILED: %', description;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_denied(stmt text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected a privilege error', description;
EXCEPTION
    WHEN insufficient_privilege THEN RAISE NOTICE '  ok    %', description;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.become(account uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', account::text, 'role', 'authenticated')::text, true);
END;
$$;

-- Ids and expectations captured as the TABLE OWNER, before dropping into the agent's role.
-- Several of these read columns the agent cannot select directly, which is the whole reason
-- the accessors exist — computing them after `become` would fail with 42501.
CREATE TEMP TABLE fix AS
SELECT
    (SELECT id FROM public.client WHERE email = 'annabelle.fc@example.com')  AS belle,
    (SELECT id FROM public.client WHERE email = 'jordan.hayes@example.com')  AS jordan,
    (SELECT id FROM public.client WHERE email = 'priya.r@example.com')       AS priya,
    (SELECT id FROM public.client WHERE status = 'merged_into' LIMIT 1)      AS tombstone,
    (SELECT count(*)::integer FROM public.client_note n
      JOIN public.client c ON c.id = n.client_id
     WHERE c.email = 'annabelle.fc@example.com' AND n.archived_at IS NULL)   AS belle_notes,
    (SELECT count(*)::integer FROM public.companion cp
      JOIN public.client c ON c.id = cp.client_id
     WHERE c.email = 'annabelle.fc@example.com' AND cp.archived_at IS NULL)  AS belle_companions,
    (SELECT count(*)::integer FROM public.trip t
      JOIN public.client c ON c.id = t.client_id
     WHERE c.email = 'jordan.hayes@example.com' AND t.archived_at IS NULL)   AS jordan_trips;

GRANT SELECT ON fix TO authenticated;

SELECT pg_temp.become(:gyasi::uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The claim the design rests on, again — per tab this time
-- ─────────────────────────────────────────────────────────────────────────────

-- client_note has ZERO grants to any client role (agent_domain_lockdown REVOKEs ALL), and
-- audit_event has RLS on with no policy and no grant. The accessors are the only reads.
SELECT pg_temp.expect_denied(
    'SELECT body FROM public.client_note',
    'agent cannot select client_note directly — the Notes tab has no other door');
SELECT pg_temp.expect_denied(
    'SELECT event_type FROM public.audit_event',
    'agent cannot select audit_event directly — the Activity tab has no other door');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_notes((SELECT belle FROM fix)))
        = (SELECT belle_notes FROM fix)
    AND (SELECT belle_notes FROM fix) > 0,
    'the Notes tab returns the agent''s own notes through the accessor');

SELECT pg_temp.assert(
    (SELECT bool_and(body IS NOT NULL AND author_name IS NOT NULL)
       FROM public.agent_client_notes((SELECT belle FROM fix))),
    'note bodies and author names arrive NON-NULL, not as a shape full of nulls');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Archived rows are excluded, and the seed can prove it
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_notes((SELECT belle FROM fix))) = 3,
    'the archived note is excluded — the seed carries one so this can fail');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_companions((SELECT belle FROM fix)))
        = (SELECT belle_companions FROM fix)
    AND (SELECT belle_companions FROM fix) = 2,
    'the archived companion is excluded, and two real ones remain');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Overview: derived money, counts, and the preferences that ride along
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_overview((SELECT belle FROM fix))) = 1,
    'the overview is exactly one row');

SELECT pg_temp.assert(
    (SELECT status IS NOT NULL AND tags IS NOT NULL AND lifetime_value_cents IS NOT NULL
       FROM public.agent_client_overview((SELECT belle FROM fix))),
    'the three withheld client columns arrive NON-NULL through the overview too');

SELECT pg_temp.assert(
    (SELECT note_count FROM public.agent_client_overview((SELECT belle FROM fix)))
        = (SELECT belle_notes FROM fix),
    'the overview''s note_count agrees with the Notes tab rather than being computed twice');

-- The preferences ride the overview row because travel_preference.client_id is UNIQUE. The
-- dietary NOTE is the half the closed vocabulary cannot carry, and the advisor booking the
-- restaurant is exactly who needs it.
SELECT pg_temp.assert(
    (SELECT dietary_restrictions = ARRAY['pescatarian'] AND dietary_notes IS NOT NULL
       FROM public.agent_client_overview((SELECT belle FROM fix))),
    'preferences and the dietary note both reach the Overview tab');

-- Priya's two currencies, asserted with the figure read off the seed BY HAND rather than
-- recomputed with the accessor's own expression — see rls_agent_clients.sql for why.
SELECT pg_temp.assert(
    (SELECT lifetime_currency = 'USD' AND lifetime_currency_count = 2
        AND lifetime_value_cents = '1830000'
       FROM public.agent_client_overview((SELECT priya FROM fix))),
    'the overview scopes money to one currency per client, exactly as the roster does');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The tabs that hang off trips
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_trips((SELECT jordan FROM fix)))
        = (SELECT jordan_trips FROM fix)
    AND (SELECT jordan_trips FROM fix) > 1,
    'the Trips tab returns every non-archived trip, cancelled ones included');

SELECT pg_temp.assert(
    (SELECT bool_and(total_commission_cents IS NOT NULL)
       FROM public.agent_client_trips((SELECT jordan FROM fix))),
    'total_commission_cents — Internal, outside the client grant — arrives NON-NULL');

-- §3.3.6's own words are "across trips". document.client_id and document.trip_id are
-- independently nullable, so a tab reading one predicate shows half the folder.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_documents((SELECT jordan FROM fix))) > 0,
    'the Documents tab finds documents hanging off the client''s TRIPS, not just the client');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_conversations((SELECT jordan FROM fix))) > 0,
    'the Messages tab returns the client''s threads');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Activity unions two arms, and the seed can break either
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FILTER (WHERE target_entity = 'client') > 0
        AND count(*) FILTER (WHERE target_entity = 'trip') > 0
       FROM public.agent_client_activity((SELECT belle FROM fix), 50)),
    'the Activity tab unions client-targeted AND trip-targeted events — both arms return rows');

-- The seed carries an event on ANOTHER client's trip precisely so this can fail.
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.agent_client_activity((SELECT belle FROM fix), 200) a
         WHERE a.target_id IN (
            SELECT t.trip_id FROM public.agent_client_trips((SELECT priya FROM fix)) t)),
    'another client''s trip events never reach this client''s timeline');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_activity((SELECT belle FROM fix), 1)) = 1,
    'p_limit bounds the timeline');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. A tombstone has no detail page
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT tombstone FROM fix) IS NOT NULL,
    'the seed carries a merged_into client, so the next assertion can fail');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_overview((SELECT tombstone FROM fix))) = 0
    AND (SELECT count(*) FROM public.agent_client_trips((SELECT tombstone FROM fix))) = 0
    AND (SELECT count(*) FROM public.agent_client_notes((SELECT tombstone FROM fix))) = 0,
    'a merged tombstone resolves to nothing on every tab — §3.9 reads those rows directly');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. A missing id and a foreign id are INDISTINGUISHABLE
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_overview(
        '00000000-0000-0000-0000-0000000000ff'::uuid)) = 0,
    'an id that does not exist returns zero rows rather than raising');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Nobody else gets the detail
-- ─────────────────────────────────────────────────────────────────────────────

-- A traveler holds EXECUTE on every one of these by the same grant the agent does. The only
-- thing between them and another client's file is current_agent_id() resolving to NULL.
SELECT pg_temp.become(:jordan::uuid);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_overview((SELECT jordan FROM fix))) = 0,
    'a traveler cannot read their OWN client detail through the agent accessor');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_notes((SELECT jordan FROM fix))) = 0,
    'a traveler cannot read the agent''s private notes about them');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_activity((SELECT jordan FROM fix), 50)) = 0,
    'a traveler cannot read the audit trail about themselves here');

RESET ROLE;

-- ── A second advisor, and a foreign client id ────────────────────────────────────
--
-- Seven functions, seven independent chances to omit the ownership predicate. Each one is
-- handed a real client id belonging to someone else.

INSERT INTO public.agent (id, display_name, email, status)
VALUES ('0195a2c0-1a00-7000-8000-000000000600', 'Detail Rival',
        'detail.rival@example.com', 'active');

INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES ('0195a2c0-1a00-7000-8000-000000000601',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'detail.rival.login@example.com', 'x', now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ('{"first_name":"Detail","last_name":"Rival",'
         || '"agent_id":"0195a2c0-1a00-7000-8000-000000000001"}')::jsonb,
        now(), now(), '', '', '', '');

DO $$
DECLARE v_client_id uuid;
BEGIN
    SELECT client_id INTO v_client_id
      FROM public.platform_user WHERE account_id = '0195a2c0-1a00-7000-8000-000000000601';
    UPDATE public.platform_user
       SET role = 'agent', agent_id = '0195a2c0-1a00-7000-8000-000000000600', client_id = NULL
     WHERE account_id = '0195a2c0-1a00-7000-8000-000000000601';
    DELETE FROM public.client WHERE id = v_client_id;
END $$;

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-000000000601'::uuid);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_overview((SELECT belle FROM fix))) = 0,
    'agent_client_overview refuses another advisor''s client');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_companions((SELECT belle FROM fix))) = 0,
    'agent_client_companions refuses another advisor''s client');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_trips((SELECT jordan FROM fix))) = 0,
    'agent_client_trips refuses another advisor''s client');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_conversations((SELECT jordan FROM fix))) = 0,
    'agent_client_conversations refuses another advisor''s client');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_documents((SELECT jordan FROM fix))) = 0,
    'agent_client_documents refuses another advisor''s client');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_notes((SELECT belle FROM fix))) = 0,
    'agent_client_notes refuses another advisor''s client');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_client_activity((SELECT belle FROM fix), 50)) = 0,
    'agent_client_activity refuses another advisor''s client');

RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. anon holds nothing, and the withheld columns are UNNAMEABLE
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    names text[] := ARRAY[
        'agent_client_overview', 'agent_client_companions', 'agent_client_trips',
        'agent_client_conversations', 'agent_client_documents', 'agent_client_notes',
        'agent_client_activity'];
    leaked text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (names)
       AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'anon can execute §3.3 detail reads: %', leaked;
    END IF;
    RAISE NOTICE '  ok    anon cannot execute any of the seven detail accessors';
END $$;

-- "Unnameable", not "unselected": a later edit that adds one of these to a RETURNS TABLE
-- must fail rather than ship. The migration asserts the same three at apply time; this
-- asserts them against the database as it now stands.
SELECT pg_temp.assert(
    pg_get_function_result('public.agent_client_documents(uuid)'::regprocedure)
        NOT LIKE '%storage_%'
    AND pg_get_function_result('public.agent_client_documents(uuid)'::regprocedure)
        NOT LIKE '%checksum%',
    'agent_client_documents cannot name a server-only storage column');

SELECT pg_temp.assert(
    pg_get_function_result('public.agent_client_companions(uuid)'::regprocedure)
        NOT LIKE '%passport_number%',
    'agent_client_companions cannot name passport_number_encrypted');

SELECT pg_temp.assert(
    pg_get_function_result('public.agent_client_activity(uuid, integer)'::regprocedure)
        NOT LIKE '%ip_address%'
    AND pg_get_function_result('public.agent_client_activity(uuid, integer)'::regprocedure)
        NOT LIKE '%user_agent%',
    'agent_client_activity cannot name a forensic column — those are §3.9.6''s');

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. §3.3.7's write — agent_write_client_note
--
-- Exercised as the OWNER, because the function is service_role only and the Edge Function
-- is its only door. What is asserted as a client role is the thing that matters from out
-- there: that neither `authenticated` nor `anon` can reach it at all.
-- ─────────────────────────────────────────────────────────────────────────────

-- Section 9 left the session as the OWNER, who can execute anything. The question here is
-- what an AGENT can reach, so drop back into that role before asking.
SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.expect_denied(
    $$SELECT public.agent_write_client_note(
        '00000000-0000-0000-0000-000000000001'::uuid,
        '00000000-0000-0000-0000-000000000001'::uuid,
        '00000000-0000-0000-0000-000000000001'::uuid,
        '00000000-0000-0000-0000-000000000001'::uuid, 'x', 'create')$$,
    'even an AGENT cannot execute agent_write_client_note — service_role only');

RESET ROLE;

CREATE TEMP TABLE w AS
SELECT
    (SELECT belle FROM fix)                                                  AS client_id,
    '0195a2c0-1a00-7000-8000-000000000001'::uuid                             AS agent_id,
    (SELECT id FROM public.platform_user WHERE role = 'agent' LIMIT 1)       AS actor,
    '0195a2c0-1a00-7000-8000-000000000700'::uuid                             AS new_note,
    (SELECT jordan FROM fix)                                                 AS other_client;

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_write_client_note(
        (SELECT client_id FROM w), (SELECT agent_id FROM w), (SELECT actor FROM w),
        (SELECT new_note FROM w), '  A note with surrounding space.  ', 'create')) = 'created',
    'create writes a note');

SELECT pg_temp.assert(
    (SELECT body FROM public.client_note WHERE id = (SELECT new_note FROM w))
        = 'A note with surrounding space.',
    'the body is trimmed on the way in, so a stray newline is not content');

-- A re-save of identical text must NOT bump updated_at: the tab shows "edited" off that
-- column, and a timestamp that moved with nothing behind it is a claim the note changed.
SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_write_client_note(
        (SELECT client_id FROM w), (SELECT agent_id FROM w), (SELECT actor FROM w),
        (SELECT new_note FROM w), 'A note with surrounding space.', 'update')) = 'noop',
    're-saving identical text is a noop, not a silent updated_at bump');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_write_client_note(
        (SELECT client_id FROM w), (SELECT agent_id FROM w), (SELECT actor FROM w),
        (SELECT new_note FROM w), 'Rewritten.', 'update')) = 'changed',
    'update rewrites the body');

-- An empty body is NOT a way to delete. Collapsing the two would make a mistyped save
-- silently destructive.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_write_client_note(
        (SELECT client_id FROM w), (SELECT agent_id FROM w), (SELECT actor FROM w),
        (SELECT new_note FROM w), '   ', 'update')),
    'a whitespace-only body is refused rather than treated as a delete');

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_write_client_note(
        (SELECT client_id FROM w), (SELECT agent_id FROM w), (SELECT actor FROM w),
        (SELECT new_note FROM w), 'x', 'obliterate')),
    'an unrecognised op writes nothing rather than falling through to a real one');

-- A note id that belongs to a DIFFERENT client must not be reachable by naming this one.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_write_client_note(
        (SELECT other_client FROM w), (SELECT agent_id FROM w), (SELECT actor FROM w),
        (SELECT new_note FROM w), 'x', 'update')),
    'a note cannot be edited through another client''s id');

-- Not this agent's client: the second advisor from section 8 owns nothing here.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_write_client_note(
        (SELECT client_id FROM w), '0195a2c0-1a00-7000-8000-000000000600'::uuid,
        (SELECT actor FROM w), (SELECT new_note FROM w), 'x', 'update')),
    'another advisor cannot write a note on this advisor''s client');

-- Only the AUTHOR may edit. One advisor exists until P3, so this predicate is always
-- satisfied in practice — which is exactly when it is most likely to have been skipped.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_write_client_note(
        (SELECT client_id FROM w), (SELECT agent_id FROM w),
        '00000000-0000-0000-0000-0000000000ee'::uuid,
        (SELECT new_note FROM w), 'x', 'update')),
    'a note may only be edited by its author');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_write_client_note(
        (SELECT client_id FROM w), (SELECT agent_id FROM w), (SELECT actor FROM w),
        (SELECT new_note FROM w), NULL, 'archive')) = 'archived',
    'archive soft-deletes the note');

SELECT pg_temp.become(:gyasi::uuid);
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.agent_client_notes((SELECT belle FROM fix)) n
         WHERE n.note_id = '0195a2c0-1a00-7000-8000-000000000700'::uuid),
    'an archived note leaves the Notes tab but not the record');
RESET ROLE;

SELECT pg_temp.assert(
    (SELECT archived_at IS NOT NULL FROM public.client_note
      WHERE id = '0195a2c0-1a00-7000-8000-000000000700'::uuid),
    '... and the row is still there, which is what soft delete means');

ROLLBACK;
