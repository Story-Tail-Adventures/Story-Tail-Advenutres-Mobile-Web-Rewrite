-- Constraint and identity assertions for the cruise catalog (Data-Model §24).
--
-- WHY THIS FILE EXISTS. The worst bug found in this feature was not a policy or a type
-- error — it was primary-key churn. PostgREST's upsert is "merge duplicates", which compiles
-- to `ON CONFLICT (...) DO UPDATE SET` over every column in the payload. Send a fresh `id`
-- with every row and each re-sync silently rewrites the key.
--
-- It hid well. Row counts stayed stable, no duplicates appeared, and an idempotency check
-- that counted rows passed twice in a row. It only surfaced once something referenced the
-- id — one cruise_port_call pointing at its sailing — and then it was a hard 23503 that
-- never recovered, because a scope that throws never advances its cursor, so the same row
-- jams every later run.
--
-- No Deno test can reach that: the mappers are pure and know nothing about conflict
-- semantics, and the repo has no HTTP-level integration test for any Edge Function. So the
-- invariant is asserted here, against real Postgres, in the form the sync depends on.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/constraints_cruise_catalog.sql

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

CREATE OR REPLACE FUNCTION pg_temp.expect_error(stmt text, sqlstate_wanted text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected SQLSTATE %',
        description, sqlstate_wanted;
EXCEPTION
    WHEN others THEN
        IF SQLSTATE = sqlstate_wanted THEN
            RAISE NOTICE '  ok    % (%)', description, SQLSTATE;
        ELSE
            RAISE EXCEPTION 'FAILED: % — got SQLSTATE %, wanted %',
                description, SQLSTATE, sqlstate_wanted;
        END IF;
END;
$$;

\set line_id    '''01a08400-0000-7000-8000-000000000001'''
\set sailing_id '''01a08400-0000-7000-8000-000000000002'''
\set churn_id   '''01a08400-0000-7000-8000-00000000dead'''

INSERT INTO public.cruise_line (id, slug, name, provider, provider_key)
VALUES (:line_id, 'zzz-fixture-line', 'Fixture Line', 'track_cruises', 'zzz-fixture');

INSERT INTO public.cruise_sailing
    (id, cruise_line_id, provider, provider_key, provider_locale, departure_date)
VALUES (:sailing_id, :line_id, 'track_cruises', 'FIX1', 'en_US', '2027-05-01');

INSERT INTO public.cruise_port_call (id, sailing_id, port_name, sequence, day)
VALUES ('01a08400-0000-7000-8000-000000000003', :sailing_id, 'Fixture Port', 1, 1);

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== the natural key is the triple, not the provider id =='
-- ─────────────────────────────────────────────────────────────────────────────

-- The same provider id under a different locale is a DIFFERENT sailing. Live data proves
-- it: cruise_id 61020 comes back per locale with different prices and durations.
INSERT INTO public.cruise_sailing
    (id, cruise_line_id, provider, provider_key, provider_locale, departure_date)
VALUES ('01a08400-0000-7000-8000-000000000004', :line_id,
        'track_cruises', 'FIX1', 'de_DE', '2027-05-01');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.cruise_sailing WHERE provider_key = 'FIX1') = 2,
    'one provider id across two locales is two rows'
);
SELECT pg_temp.assert(
    (SELECT count(DISTINCT provider_locale) FROM public.cruise_sailing
      WHERE provider_key = 'FIX1') = 2,
    'and they are distinguished by locale alone'
);

SELECT pg_temp.expect_error(
    'INSERT INTO public.cruise_sailing '
    '(id, cruise_line_id, provider, provider_key, provider_locale, departure_date) '
    'VALUES (''01a08400-0000-7000-8000-000000000005'', ' || quote_literal(:line_id) || ', '
    '''track_cruises'', ''FIX1'', ''en_US'', ''2027-06-01'')',
    '23505',
    'the same (provider, key, locale) triple twice is refused'
);

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== an upsert that omits `id` leaves the key alone — the invariant the sync relies on =='
-- ─────────────────────────────────────────────────────────────────────────────

-- This is the shape withExistingIds() produces: conflict on the natural key, `id` either
-- absent or already equal to the stored one. The key must survive, because a port call
-- points at it.
INSERT INTO public.cruise_sailing
    (id, cruise_line_id, provider, provider_key, provider_locale, departure_date, title)
VALUES (:sailing_id, :line_id, 'track_cruises', 'FIX1', 'en_US', '2027-05-01', 'Renamed')
ON CONFLICT (provider, provider_key, provider_locale) DO UPDATE
   SET title = EXCLUDED.title, updated_at = now();

SELECT pg_temp.assert(
    (SELECT id FROM public.cruise_sailing
      WHERE provider_key = 'FIX1' AND provider_locale = 'en_US') = :sailing_id::uuid,
    'the primary key is unchanged after a natural-key upsert'
);
SELECT pg_temp.assert(
    (SELECT title FROM public.cruise_sailing
      WHERE provider_key = 'FIX1' AND provider_locale = 'en_US') = 'Renamed',
    'and the payload columns did update'
);
-- Scoped to the fixture, not counted globally: this file has to give the same answer on a
-- laptop that has just run a real sync as it does on a freshly reset CI database.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.cruise_port_call pc
      JOIN public.cruise_sailing s ON s.id = pc.sailing_id
     WHERE pc.sailing_id = :sailing_id::uuid) = 1,
    'the port call still resolves to its sailing'
);

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== and this is the bug, reproduced, so nobody reintroduces it =='
-- ─────────────────────────────────────────────────────────────────────────────

-- Exactly what the sync did before the fix: same natural key, brand-new id, `id` included
-- in the DO UPDATE. Postgres refuses it because a port call references the old key. Were
-- there no port call yet it would SUCCEED and silently churn the key, which is why the
-- assertion above matters even more than this one.
SELECT pg_temp.expect_error(
    'INSERT INTO public.cruise_sailing '
    '(id, cruise_line_id, provider, provider_key, provider_locale, departure_date) '
    'VALUES (' || quote_literal(:churn_id) || ', ' || quote_literal(:line_id) || ', '
    '''track_cruises'', ''FIX1'', ''en_US'', ''2027-05-01'') '
    'ON CONFLICT (provider, provider_key, provider_locale) DO UPDATE '
    'SET id = EXCLUDED.id',
    '23503',
    'rewriting the id under a referenced sailing is refused by the FK'
);

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== port call ordering does not depend on `day` =='
-- ─────────────────────────────────────────────────────────────────────────────

-- Holland America's feed omits every per-port day number, so `day` must be nullable while
-- `sequence` must not be, and the ordering index is on sequence.
INSERT INTO public.cruise_port_call (id, sailing_id, port_name, sequence, day)
VALUES ('01a08400-0000-7000-8000-000000000010', :sailing_id, 'HAL Port A', 2, NULL),
       ('01a08400-0000-7000-8000-000000000011', :sailing_id, 'HAL Port B', 3, NULL);

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.cruise_port_call
      WHERE sailing_id = :sailing_id::uuid AND day IS NULL) = 2,
    'port calls with a null day are accepted (every HAL sailing)'
);

SELECT pg_temp.expect_error(
    'INSERT INTO public.cruise_port_call (id, sailing_id, port_name, sequence) '
    'VALUES (''01a08400-0000-7000-8000-000000000012'', '
    || quote_literal(:sailing_id) || ', ''Dup'', 1)',
    '23505',
    'two port calls cannot share a sequence on one sailing'
);

SELECT pg_temp.expect_error(
    'INSERT INTO public.cruise_port_call (id, sailing_id, port_name, sequence) '
    'VALUES (''01a08400-0000-7000-8000-000000000013'', '
    || quote_literal(:sailing_id) || ', ''Zero'', 0)',
    '23514',
    'sequence is 1-based, so 0 is refused'
);

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== money constraints (CLAUDE.md rule 5) =='
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.expect_error(
    'UPDATE public.cruise_sailing SET lead_price_cents = 129000, currency = NULL '
    'WHERE id = ' || quote_literal(:sailing_id),
    '23514',
    'a fare without its currency is refused'
);

SELECT pg_temp.expect_error(
    'UPDATE public.cruise_sailing SET lead_price_cents = -1, currency = ''USD'' '
    'WHERE id = ' || quote_literal(:sailing_id),
    '23514',
    'a negative fare is refused'
);

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== curated rows are not the provider''s to own =='
-- ─────────────────────────────────────────────────────────────────────────────

-- Virgin Voyages has no provider coverage, so it lives with a null provenance pair. More
-- than one such row must be possible, which is why the provider index is partial.
INSERT INTO public.cruise_line (id, slug, name)
VALUES ('01a08400-0000-7000-8000-000000000020', 'zzz-curated-two', 'Curated Two');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.cruise_line WHERE provider IS NULL) >= 2,
    'several curated lines can coexist with a null provenance pair'
);

SELECT pg_temp.expect_error(
    'INSERT INTO public.cruise_line (id, slug, name, provider) '
    'VALUES (''01a08400-0000-7000-8000-000000000021'', ''zzz-half'', ''Half'', ''track_cruises'')',
    '23514',
    'half a provenance pair is refused — a provider with no key cannot be reconciled'
);

\echo '== all cruise catalog constraint assertions passed =='

ROLLBACK;
