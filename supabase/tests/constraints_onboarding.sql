-- Assertions for the constraints Screens 2.1.11 and 2.1.12 added.
--
-- Separate from rls_onboarding.sql because these are not about who can see what — they are
-- about what the database refuses to hold at all, whoever is asking. Every one of them is
-- also enforced in an Edge Function, which is what turns a violation into a sentence
-- somebody can read; these are what make the rule true when the function is bypassed, and
-- what will fail loudly if a later migration relaxes one by accident.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/constraints_onboarding.sql

\set ON_ERROR_STOP on

BEGIN;

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

/**
 * Whether `statement` is refused by a check constraint.
 *
 * Catching only `check_violation` on purpose: a statement that fails for some unrelated
 * reason — a typo'd column, a missing FK — would otherwise pass as "refused" and the
 * assertion would prove nothing.
 */
CREATE OR REPLACE FUNCTION pg_temp.refused(statement text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE statement;
    RETURN false;
EXCEPTION
    WHEN check_violation THEN RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.accepted(statement text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE statement;
    RETURN true;
EXCEPTION
    WHEN others THEN RETURN false;
END;
$$;

-- Maya's pre-created client row, from supabase/seed.sql. Deliberately hers rather than
-- Jordan's: Jordan's client id is minted by `handle_new_user()` on every reset and so is
-- not a constant, while Maya's is written out by the seed as the unclaimed row the
-- email-confirmation trigger adopts.
\set client '''0195a2c0-1a00-7000-8000-000000000013'''

DELETE FROM public.travel_preference WHERE client_id = :client;

-- ── travel_preference: the closed vocabularies (20260904124903) ───────────────
SELECT pg_temp.assert(
    pg_temp.refused(format(
        'INSERT INTO public.travel_preference (id, client_id, travel_styles)
         VALUES (gen_random_uuid(), %L, ARRAY[''Honeymoon''])', :client)),
    'travel_styles refuses the prototype label "Honeymoon" — the value is `romantic`');

SELECT pg_temp.assert(
    pg_temp.refused(format(
        'INSERT INTO public.travel_preference (id, client_id, budget_band)
         VALUES (gen_random_uuid(), %L, ''lavish'')', :client)),
    'budget_band refuses a band outside the documented four');

SELECT pg_temp.assert(
    pg_temp.refused(format(
        'INSERT INTO public.travel_preference (id, client_id, dietary_restrictions)
         VALUES (gen_random_uuid(), %L, ARRAY[''none'', ''halal''])', :client)),
    'dietary_restrictions refuses "none" beside a real restriction');

SELECT pg_temp.assert(
    pg_temp.refused(format(
        'INSERT INTO public.travel_preference (id, client_id, dietary_restrictions, dietary_notes)
         VALUES (gen_random_uuid(), %L, ARRAY[''none''], ''severe shellfish allergy'')',
        :client)),
    'dietary_restrictions refuses "none" beside a NOTE — an allergy has no slug');

SELECT pg_temp.assert(
    pg_temp.refused(format(
        'INSERT INTO public.travel_preference (id, client_id, accessibility_needs, accessibility_notes)
         VALUES (gen_random_uuid(), %L, ARRAY[''none''], ''CPAP by the bed'')', :client)),
    'accessibility_needs refuses "none" beside a note, the same way');

SELECT pg_temp.assert(
    pg_temp.accepted(format(
        'INSERT INTO public.travel_preference (id, client_id, dietary_restrictions, accessibility_needs)
         VALUES (gen_random_uuid(), %L, ARRAY[]::text[], ARRAY[]::text[])', :client)),
    'empty arrays are legal — "never asked" is a real state, distinct from "none"');

DELETE FROM public.travel_preference WHERE client_id = :client;

SELECT pg_temp.assert(
    pg_temp.accepted(format(
        'INSERT INTO public.travel_preference (id, client_id, dietary_restrictions, dietary_notes)
         VALUES (gen_random_uuid(), %L, ARRAY[''none''], NULL)', :client)),
    '"none" on its own with no note is exactly what the sentinel is for');

-- ── companion: the household cap (20260904132811) ─────────────────────────────
DELETE FROM public.companion WHERE client_id = :client;

DO $$
DECLARE i integer;
BEGIN
    FOR i IN 1..12 LOOP
        INSERT INTO public.companion (id, client_id, first_name, last_name)
        VALUES (gen_random_uuid(), '0195a2c0-1a00-7000-8000-000000000013', 'Cap', 'Test' || i);
    END LOOP;
END $$;

SELECT pg_temp.assert(
    pg_temp.refused(format(
        'INSERT INTO public.companion (id, client_id, first_name, last_name)
         VALUES (gen_random_uuid(), %L, ''One'', ''TooMany'')', :client)),
    'a thirteenth companion is refused by the cap trigger');

UPDATE public.companion SET archived_at = now()
 WHERE client_id = :client AND last_name = 'Test1';

SELECT pg_temp.assert(
    pg_temp.accepted(format(
        'INSERT INTO public.companion (id, client_id, first_name, last_name)
         VALUES (gen_random_uuid(), %L, ''Now'', ''Fits'')', :client)),
    'archiving one makes room — the cap counts unarchived rows');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.companion
      WHERE client_id = :client AND archived_at IS NULL) = 12,
    'exactly twelve remain active');

ROLLBACK;
