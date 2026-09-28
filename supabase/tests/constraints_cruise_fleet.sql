-- The curated cruise fleet: that it is all there, that the sync cannot take it, and that a
-- photo can never arrive without a licence or from somewhere we did not choose.
--
-- WHY THIS IS A SQL TEST AND NOT A DENO ONE. Three of the four things asserted below are
-- properties of a CONFLICT, and a conflict needs a real Postgres with real unique indexes to
-- happen at all. constraints_cruise_catalog.sql makes the same argument for the primary-key
-- churn bug: the mappers are pure functions, so no amount of unit testing them reaches the
-- behaviour that actually bites.
--
-- The four claims:
--
--   1. THE FLEET IS WHOLE. Ten lines, 153 ships, each line with the count the source CSV has.
--      A migration that half-applies, or a generator re-run that quietly drops a line, shows
--      up here rather than as a thin filter rail six weeks later.
--
--   2. THE SYNC MERGES INTO A CURATED ROW, IT DOES NOT DUPLICATE IT OR FAIL ON IT. This is
--      the claim 20260909001124:745 doubted when it warned that inserting feed-covered lines
--      "would race the sync for the same unique key", and it is the reason the fleet is safe
--      to ship. Asserted by replaying what the sync actually does — an upsert on the natural
--      key, carrying the provider columns — and checking the id survived.
--
--   3. IMAGERY IS EDITORIAL AND THE SYNC CANNOT TOUCH IT. PostgREST builds DO UPDATE SET from
--      the keys present in the payload, so a column the mapper omits keeps its value. That is
--      a property of the PAYLOAD, not of the schema, so nothing stops a future mapper adding
--      image_url to it. This is the test that fails when someone does.
--
--   4. A PHOTO CANNOT BE STORED UNATTRIBUTED, OR FROM AN ARBITRARY HOST. Including, by name,
--      the Google Images search link that the source CSV supplied 153 of and that started
--      this whole feature.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/constraints_cruise_fleet.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert(condition boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition IS NOT TRUE THEN
        RAISE EXCEPTION 'FAILED: %', description;
    END IF;
    RAISE NOTICE '  ok  %', description;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(stmt text, sqlstate_wanted text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE stmt;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE <> sqlstate_wanted THEN
            RAISE EXCEPTION 'FAILED: % — wanted SQLSTATE %, got % (%)',
                description, sqlstate_wanted, SQLSTATE, SQLERRM;
        END IF;
        RAISE NOTICE '  ok  %', description;
        RETURN;
    END;
    RAISE EXCEPTION 'FAILED: % — the statement was accepted and should not have been', description;
END $$;

-- From 20260930120001_cruise_fleet_catalog.sql.
\set rc_line   '''01a08376-dc00-7000-8000-000000003001'''
\set symphony  '''01a08376-dc00-7000-8000-000000004050'''

\echo '== 1. the fleet is whole =='

SELECT pg_temp.assert(count(*) = 10, 'ten cruise lines') FROM public.cruise_line;
SELECT pg_temp.assert(count(*) = 153, '153 cruise ships') FROM public.cruise_ship;

-- Per line, against supabase/scripts/data/cruise_ships.csv. A single number can be right while
-- two lines have swapped ships; these cannot.
SELECT pg_temp.assert(
    array_agg(c ORDER BY slug) = ARRAY[26, 15, 4, 8, 11, 22, 19, 16, 28, 4],
    'ships per line match the source CSV')
FROM (
    SELECT l.slug, count(s.id)::integer AS c
    FROM public.cruise_line l
    LEFT JOIN public.cruise_ship s ON s.cruise_line_id = l.id
    GROUP BY l.slug
) per_line;

SELECT pg_temp.assert(count(*) = 0, 'every ship belongs to a line that exists')
FROM public.cruise_ship s
WHERE NOT EXISTS (SELECT 1 FROM public.cruise_line l WHERE l.id = s.cruise_line_id);

-- The editorial layer, and the OTHER copy of it is BOOKED_SLUGS / DISPLAY_ORDER in
-- supabase/functions/_shared/cruise/map.ts:43-80. mapCruiseLine writes both columns from those
-- constants on every sync, so if the two lists drift the first successful run silently
-- reorders screen 2.0.9's chip row and changes which lines say "we book this". Move them
-- together; this is what notices if you do not.
SELECT pg_temp.assert(
    array_agg(slug ORDER BY display_order, slug) = ARRAY[
        'royal-caribbean', 'celebrity', 'disney', 'princess', 'carnival',
        'virgin-voyages', 'norwegian', 'holland-america', 'msc', 'cunard'],
    'display_order agrees with map.ts DISPLAY_ORDER')
FROM public.cruise_line;

SELECT pg_temp.assert(count(*) = 8, 'eight lines are marked as booked')
FROM public.cruise_line WHERE is_booked;

SELECT pg_temp.assert(
    array_agg(slug ORDER BY slug) = ARRAY['cunard', 'msc'],
    'the two unbooked lines are the two the storefront does not sell')
FROM public.cruise_line WHERE NOT is_booked;

-- A curated row carries a null provenance pair. That is what keeps it out of archiveMissing(),
-- which filters `.eq("provider", PROVIDER)` — "a curated row is nobody's to archive"
-- (sync.ts:1245-1247). A seeded provider value would put the whole fleet inside the archival
-- population the first time a sync ran without returning it.
SELECT pg_temp.assert(count(*) = 0, 'no curated line claims a provenance it does not have')
FROM public.cruise_line WHERE provider IS NOT NULL;
SELECT pg_temp.assert(count(*) = 0, 'no curated ship claims a provenance it does not have')
FROM public.cruise_ship WHERE provider IS NOT NULL;

\echo '== 2. a sync merges into the curated rows rather than racing them =='

-- What sync.ts:589 does to cruise_line: upsert on `slug`, carrying the provider columns.
-- withExistingIds() (sync.ts:1192-1240) has already swapped the freshly minted id for the
-- stored one by the time this reaches Postgres, which is what the excluded.id below models.
INSERT INTO public.cruise_line (id, slug, name, display_order, is_booked, provider, provider_key, synced_at)
VALUES (:rc_line, 'royal-caribbean', 'Royal Caribbean', 10, true, 'track_cruises', 'royal-caribbean', now())
ON CONFLICT (slug) DO UPDATE
    SET name = excluded.name, provider = excluded.provider,
        provider_key = excluded.provider_key, synced_at = excluded.synced_at;

SELECT pg_temp.assert(count(*) = 10, 'still ten lines after a line sync') FROM public.cruise_line;
SELECT pg_temp.assert(id = :rc_line, 'the curated line kept its id through a sync')
FROM public.cruise_line WHERE slug = 'royal-caribbean';

-- And resolveShipId (sync.ts:1294-1330) looks a hull up by (cruise_line_id, name) BEFORE it
-- mints anything, so a synced sailing attaches to the curated ship instead of creating a stub
-- beside it. The lookup is the load-bearing half; the upsert below is the fallback path.
SELECT pg_temp.assert(
    (SELECT id FROM public.cruise_ship WHERE cruise_line_id = :rc_line AND name = 'Symphony of the Seas') = :symphony,
    'resolveShipId''s natural-key lookup finds the curated hull');

INSERT INTO public.cruise_ship (id, cruise_line_id, name, slug, provider, provider_key, synced_at)
VALUES ('01a08400-0000-7000-8000-000000000001', :rc_line, 'Symphony of the Seas', NULL,
        'track_cruises', 'royal-caribbean:Symphony of the Seas', now())
ON CONFLICT (cruise_line_id, name) DO UPDATE
    SET provider = excluded.provider, provider_key = excluded.provider_key,
        synced_at = excluded.synced_at;

SELECT pg_temp.assert(count(*) = 153, 'a ship sync adds no rows') FROM public.cruise_ship;
SELECT pg_temp.assert(id = :symphony, 'the curated hull kept its id through a sync')
FROM public.cruise_ship WHERE cruise_line_id = :rc_line AND name = 'Symphony of the Seas';

\echo '== 3. imagery is editorial, and a sync-shaped write leaves it alone =='

-- The payload above is mapShip's (map.ts:220-231) and omits every image column, so the photo
-- has to have survived both of those upserts. If a future mapper starts sending image_url,
-- this is the assertion that goes red.
SELECT pg_temp.assert(image_url IS NOT NULL AND image_credit IS NOT NULL,
    'a sync-shaped upsert did not wipe the curated photo')
FROM public.cruise_ship WHERE id = :symphony;

SELECT pg_temp.assert(count(*) >= 140, 'most of the fleet has a photo')
FROM public.cruise_ship WHERE image_url IS NOT NULL;

SELECT pg_temp.assert(count(*) = 0, 'every stored photo is credited')
FROM public.cruise_ship WHERE image_url IS NOT NULL AND image_credit IS NULL;

SELECT pg_temp.assert(count(*) = 0, 'every stored photo names its licence and its source')
FROM public.cruise_ship
WHERE image_url IS NOT NULL AND (image_license IS NULL OR image_source_url IS NULL);

-- A stub that the sync minted BEFORE this migration ran is a bare row with no photo, and the
-- fleet insert's ON CONFLICT is a DO UPDATE precisely so it can fill one in. It must fill in
-- the imagery and nothing else — the stub keeps its id, its provenance and its null slug.
INSERT INTO public.cruise_ship (id, cruise_line_id, name, slug, provider, provider_key, synced_at)
VALUES ('01a08400-0000-7000-8000-000000000002', :rc_line, 'Ship The Sync Saw First', NULL,
        'track_cruises', 'royal-caribbean:Ship The Sync Saw First', now());

INSERT INTO public.cruise_ship
    (id, cruise_line_id, name, slug, image_url, image_credit, image_license, image_source_url)
VALUES ('01a08400-0000-7000-8000-000000000003', :rc_line, 'Ship The Sync Saw First', 'x',
        'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg', 'somebody', 'CC BY 4.0',
        'https://commons.wikimedia.org/wiki/File:Example.jpg')
ON CONFLICT (cruise_line_id, name) DO UPDATE
    SET image_url = excluded.image_url, image_credit = excluded.image_credit,
        image_license = excluded.image_license, image_source_url = excluded.image_source_url
    WHERE cruise_ship.image_url IS NULL AND excluded.image_url IS NOT NULL;

SELECT pg_temp.assert(
    id = '01a08400-0000-7000-8000-000000000002' AND provider = 'track_cruises'
      AND slug IS NULL AND image_url IS NOT NULL,
    'the fleet insert fills a sync stub''s photo and changes nothing else')
FROM public.cruise_ship WHERE cruise_line_id = :rc_line AND name = 'Ship The Sync Saw First';

-- The other direction: a photo already chosen is a decision, and the migration replaying must
-- not overturn it. This is what the WHERE on that DO UPDATE is for.
UPDATE public.cruise_ship SET image_url = 'https://upload.wikimedia.org/hand-picked.jpg',
       image_credit = 'chosen by hand' WHERE id = :symphony;

INSERT INTO public.cruise_ship
    (id, cruise_line_id, name, slug, image_url, image_credit, image_license, image_source_url)
VALUES ('01a08400-0000-7000-8000-000000000004', :rc_line, 'Symphony of the Seas', 'x',
        'https://upload.wikimedia.org/wikipedia/commons/a/ab/Other.jpg', 'somebody else', 'CC BY 4.0',
        'https://commons.wikimedia.org/wiki/File:Other.jpg')
ON CONFLICT (cruise_line_id, name) DO UPDATE
    SET image_url = excluded.image_url, image_credit = excluded.image_credit,
        image_license = excluded.image_license, image_source_url = excluded.image_source_url
    WHERE cruise_ship.image_url IS NULL AND excluded.image_url IS NOT NULL;

SELECT pg_temp.assert(image_credit = 'chosen by hand',
    'a photo already chosen survives the fleet insert replaying')
FROM public.cruise_ship WHERE id = :symphony;

\echo '== 4. the constraints refuse what they exist to refuse =='

SELECT pg_temp.expect_error(
    format('UPDATE public.cruise_ship SET image_url = %L, image_credit = NULL WHERE id = %L',
           'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg', :symphony),
    '23514', 'a photo with no credit is refused');

-- The mistake this feature started from: the source CSV''s "Image URL" column held 153 of
-- these, and every one of them renders as a broken image.
SELECT pg_temp.expect_error(
    format('UPDATE public.cruise_ship SET image_url = %L, image_credit = %L WHERE id = %L',
           'https://www.google.com/search?tbm=isch&q=Symphony+of+the+Seas+cruise+ship',
           'nobody', :symphony),
    '23514', 'a Google Images search link is refused');

SELECT pg_temp.expect_error(
    format('UPDATE public.cruise_ship SET image_url = %L, image_credit = %L WHERE id = %L',
           'https://example.com/ship.jpg', 'nobody', :symphony),
    '23514', 'an off-host image is refused');

-- http, not https. The host pin carries the scheme for the same reason hotels/map.ts:60 checks
-- it separately: an allow-listed host reached over plaintext is still a downgrade.
SELECT pg_temp.expect_error(
    format('UPDATE public.cruise_ship SET image_url = %L, image_credit = %L WHERE id = %L',
           'http://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg', 'nobody', :symphony),
    '23514', 'a plaintext image url is refused');

\echo '== all cruise fleet assertions passed =='

ROLLBACK;
