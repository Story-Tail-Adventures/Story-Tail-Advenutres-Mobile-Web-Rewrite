-- Behaviour of public.cruise_sailing_search (Data-Model §24.10, Screen 2.0.4 Cruises mode).
--
-- WHY THIS FILE EXISTS. The search used to be a PostgREST `or=(...)` string built in
-- `_shared/cruise/public.ts`, and every way it failed returned a well-formed, quiet answer:
-- zero results for a port or a cruise line, three of four for a lowercase destination, and a
-- 500 for a `"` that the page rendered as "the sailing list didn't come back". No Deno test
-- could see any of it, because the mappers are pure and the filter only means something to
-- Postgres. So the matching rules are asserted here, against real Postgres.
--
-- The fixture words are nonsense ("zzalpha", "zzgamma") so the seeded catalog can never
-- match them, and this file means the same thing with or without seed.sql.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/search_cruise_sailings.sql

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

-- The fixture sailing ids a needle finds, sorted, so an assertion can compare to a literal.
CREATE OR REPLACE FUNCTION pg_temp.hits(needle text, depart_from date DEFAULT NULL)
RETURNS text[] LANGUAGE sql AS $$
    SELECT coalesce(array_agg(right(id::text, 4) ORDER BY id), '{}')
    FROM public.cruise_sailing_search(needle, depart_from, max_rows => 100)
    WHERE id::text LIKE '01a08500-%';
$$;

INSERT INTO public.cruise_line (id, slug, name)
VALUES ('01a08500-0000-7000-8000-00000000a001', 'zz-fixture-voyages', 'Zzomega Voyages');

INSERT INTO public.cruise_ship (id, cruise_line_id, name)
VALUES ('01a08500-0000-7000-8000-00000000b001', '01a08500-0000-7000-8000-00000000a001', 'Zzkappa of the Seas');

-- 0001: the sailing every word-placement assertion points at.
-- 0002: same line, nothing else in common — the control that proves a match is not "everything".
-- 0003: archived. 0004: already departed.
INSERT INTO public.cruise_sailing
    (id, cruise_line_id, ship_id, provider, provider_key, provider_locale, title,
     departure_date, duration_nights, destinations)
VALUES
    ('01a08500-0000-7000-8000-000000000001', '01a08500-0000-7000-8000-00000000a001',
     '01a08500-0000-7000-8000-00000000b001', 'seed', 'zz:1', 'en', '5 Night Zzalpha Escape',
     current_date + 30, 5, ARRAY['Zzbeta Isles']),
    ('01a08500-0000-7000-8000-000000000002', '01a08500-0000-7000-8000-00000000a001',
     NULL, 'seed', 'zz:2', 'en', '3 Night Zzsigma Getaway',
     current_date + 40, 3, ARRAY['Zztau']),
    ('01a08500-0000-7000-8000-000000000003', '01a08500-0000-7000-8000-00000000a001',
     '01a08500-0000-7000-8000-00000000b001', 'seed', 'zz:3', 'en', '5 Night Zzalpha Escape',
     current_date + 50, 5, ARRAY['Zzbeta Isles']),
    ('01a08500-0000-7000-8000-000000000004', '01a08500-0000-7000-8000-00000000a001',
     '01a08500-0000-7000-8000-00000000b001', 'seed', 'zz:4', 'en', '5 Night Zzalpha Escape',
     current_date - 3, 5, ARRAY['Zzbeta Isles']);

UPDATE public.cruise_sailing SET archived_at = now()
WHERE id = '01a08500-0000-7000-8000-000000000003';

INSERT INTO public.cruise_port_call (id, sailing_id, port_name, sequence, day)
VALUES
    ('01a08500-0000-7000-8000-00000000c001', '01a08500-0000-7000-8000-000000000001', 'Zzgamma, Zzdelta', 1, 1),
    ('01a08500-0000-7000-8000-00000000c002', '01a08500-0000-7000-8000-000000000001', 'Zzepsilon Harbour', 2, 3);

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== every place a destination can live is searched =='
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(pg_temp.hits('Zzalpha') = '{0001}', 'a word in the title matches');
SELECT pg_temp.assert(pg_temp.hits('Zzbeta') = '{0001}', 'a word in a destination matches');
SELECT pg_temp.assert(pg_temp.hits('Zzgamma') = '{0001}', 'a port of call matches — the old filter never looked at ports');
SELECT pg_temp.assert(pg_temp.hits('Zzkappa') = '{0001}', 'the ship name matches');
SELECT pg_temp.assert(pg_temp.hits('Zzomega Voyages') = '{0001,0002}', 'the line name matches every sailing on the line');

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== case and punctuation do not matter =='
-- ─────────────────────────────────────────────────────────────────────────────

-- The old `destinations.cs.{...}` was an exact element match, so lowercase missed.
SELECT pg_temp.assert(pg_temp.hits('zzbeta isles') = '{0001}', 'a lowercase destination matches');
SELECT pg_temp.assert(pg_temp.hits('ZZEPSILON') = '{0001}', 'an uppercase port matches');
SELECT pg_temp.assert(pg_temp.hits('Zzgamma, Zzdelta') = '{0001}', 'the port as written, comma and all');
SELECT pg_temp.assert(pg_temp.hits('Zzgamma (Zzdelta)') = '{0001}', 'parentheses are just separators');

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== every word must match somewhere, filler words aside =='
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(pg_temp.hits('Zzgamma Zzbeta') = '{0001}', 'two words found in two different places');
SELECT pg_temp.assert(pg_temp.hits('Zzalpha Zznowhere') = '{}', 'one unmatched word excludes the sailing');
SELECT pg_temp.assert(pg_temp.hits('Zzbeta cruise') = '{0001}', '"cruise" is filler, not a word the sailing must contain');
SELECT pg_temp.assert(pg_temp.hits('a cruise to the Zzbeta') = '{0001}', 'articles and prepositions are filler too');

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== visitor text is data, never syntax =='
-- ─────────────────────────────────────────────────────────────────────────────

-- Each of these broke, or could have broken, the PostgREST filter string. Here they must
-- simply be separators: the remaining word still matches, and nothing raises.
SELECT pg_temp.assert(pg_temp.hits('Zzalpha"') = '{0001}', 'a double quote');
SELECT pg_temp.assert(pg_temp.hits(E'Zzalpha\\') = '{0001}', 'a backslash');
SELECT pg_temp.assert(pg_temp.hits('{Zzalpha}') = '{0001}', 'array braces');
SELECT pg_temp.assert(pg_temp.hits('Zzalpha,title.eq.x') = '{}', 'filter syntax is just more words to match');
-- `%`, `_` and `\` are LIKE metacharacters, and they are separators here, so none of them
-- can reach a pattern. A needle made of nothing else has no words and constrains nothing.
SELECT pg_temp.assert(pg_temp.hits(E'%_\\%') = '{0001,0002}', 'LIKE metacharacters alone are no words at all');
SELECT pg_temp.assert(pg_temp.hits('Zzsigma_Zztau') = '{0002}', 'an underscore splits words rather than matching one character');

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== what is never offered =='
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(NOT ('0003' = ANY (pg_temp.hits('Zzalpha'))), 'an archived sailing');
SELECT pg_temp.assert(
    NOT ('0004' = ANY (pg_temp.hits('Zzalpha', current_date - 30))),
    'a departed sailing, even when depart_from asks for the past'
);
SELECT pg_temp.assert(pg_temp.hits(NULL) = '{0001,0002}', 'no needle means "what is sailing?" — everything upcoming');
SELECT pg_temp.assert(pg_temp.hits('  ') = '{0001,0002}', 'a blank needle is no needle');

-- ─────────────────────────────────────────────────────────────────────────────
\echo '== the window and the cap =='
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.cruise_sailing_search('Zzomega', depart_to => current_date + 35)
      WHERE id::text LIKE '01a08500-%') = 1,
    'depart_to bounds the window'
);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.cruise_sailing_search('Zzomega', min_nights => 4)
      WHERE id::text LIKE '01a08500-%') = 1,
    'min_nights bounds the duration'
);
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.cruise_sailing_search('Zzomega', max_rows => 1)) = 1,
    'max_rows caps the page'
);

\echo '== all cruise search assertions passed =='

ROLLBACK;
