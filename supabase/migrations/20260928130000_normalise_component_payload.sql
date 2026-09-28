-- `trip_component.payload` onto the shape §3.4.12's edit sheet reads and writes.
--
-- ── WHY THIS EXISTS, AND WHAT IT IS NOT ─────────────────────────────────────────────────
--
-- This is NOT a rename for tidiness. The component sheets are the first thing that ever
-- READS `payload` back in order to edit it, and the upsert replaces the blob whole. So a
-- key the form does not know about is not merely ignored — it is rendered as an empty
-- field and then written away on the next save. Every row below would have lost data the
-- first time an advisor corrected a typo in it.
--
-- ── SIX KEYS ARE DROPPED BECAUSE A COLUMN ALREADY HOLDS THE FACT ────────────────────────
--
-- Data-Model §23 (settled 2026-09-27): anything a QUERY needs is a column, and `payload` is
-- detail a screen renders and nothing aggregates. These predate that line being written
-- down and none of them survives it. Nothing is dropped without somewhere to go:
--
--   origin / destination   → folded into `location` as "MIA → MBJ" when `location` is
--                            empty; kept in `notes` otherwise, because an airport NAME and
--                            an IATA pair are not the same string and neither is noise.
--   meeting_point          → `location` when empty, else appended to `notes`. It was the
--                            same place at finer grain ("Negril Marina" / "…, pier 2").
--   policy_number          → `confirmation_number`. The seed stored the identical string
--                            in both, which is how this one was found.
--   airline / provider     → `display_name` already carries the itinerary line and
--                            `supplier_id` carries the company. Moved to `notes` only when
--                            `display_name` does not already contain them.
--   nights                 → `start_date` to `end_date`.
--   rate_cents_per_night   → CLAUDE.md rule 5: money is a bigint column, not a jsonb key.
--                            AND IT HAD ALREADY DRIFTED — 144328 × 7 is 1,010,296 against a
--                            `cost_cents` of 1,010,300. Four cents, no constraint, nothing
--                            anywhere to notice. Exactly `total_value_cents`'s shape at a
--                            smaller scale, which is why it goes rather than moving.
--
-- ── AND FOUR ARE RENAMED ────────────────────────────────────────────────────────────────
--
--   seats → seat, duration_hours / duration_minutes → duration, synthesized → notes.
--
-- The triggers from 20260928100000 do not fire on a payload-only update (they watch
-- cost_cents, commission_cents, archived_at and trip_id), so no total moves here. That is
-- correct: this migration changes how a fact is spelled, never what it is.

BEGIN;

-- A note is appended rather than replaced: several rows carry two things to preserve.
CREATE OR REPLACE FUNCTION pg_temp.add_note(existing jsonb, addition text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN addition IS NULL OR btrim(addition) = '' THEN existing
        WHEN coalesce(existing->>'notes', '') = '' THEN jsonb_set(existing, '{notes}', to_jsonb(addition))
        ELSE jsonb_set(existing, '{notes}', to_jsonb((existing->>'notes') || ' · ' || addition))
    END;
$$;

-- ── 1. A policy number is a confirmation number ─────────────────────────────────────────
UPDATE public.trip_component
   SET confirmation_number = coalesce(confirmation_number, payload->>'policy_number')
 WHERE payload ? 'policy_number';

-- ── 2. A route, a meeting point and an airport are all `location` ───────────────────────
UPDATE public.trip_component
   SET location = coalesce(
           nullif(btrim(location), ''),
           nullif(btrim(concat_ws(' → ', payload->>'origin', payload->>'destination')), ''))
 WHERE payload ?| ARRAY['origin', 'destination'];

UPDATE public.trip_component
   SET location = coalesce(nullif(btrim(location), ''), payload->>'meeting_point')
 WHERE payload ? 'meeting_point';

-- ── 3. Everything with nowhere else to go becomes part of the note ──────────────────────
UPDATE public.trip_component c
   SET payload = pg_temp.add_note(
           c.payload,
           nullif(btrim(concat_ws(
               ' · ',
               -- Only when `location` did NOT take them above; otherwise this would write
               -- the same string into two places, which is the thing being fixed.
               CASE WHEN c.payload ? 'origin'
                     AND c.location IS DISTINCT FROM concat_ws(' → ', c.payload->>'origin', c.payload->>'destination')
                    THEN concat_ws(' → ', c.payload->>'origin', c.payload->>'destination') END,
               CASE WHEN c.payload ? 'meeting_point' AND c.location IS DISTINCT FROM c.payload->>'meeting_point'
                    THEN c.payload->>'meeting_point' END,
               CASE WHEN c.payload ? 'airline' AND position(c.payload->>'airline' IN c.display_name) = 0
                    THEN c.payload->>'airline' END,
               CASE WHEN c.payload ? 'provider' AND position(c.payload->>'provider' IN c.display_name) = 0
                    THEN c.payload->>'provider' END,
               CASE WHEN c.payload ? 'includes'
                    THEN 'Includes ' || array_to_string(
                             ARRAY(SELECT jsonb_array_elements_text(c.payload->'includes')), ', ') END,
               c.payload->>'synthesized'
           )), '')
       )
 WHERE c.payload ?| ARRAY['origin', 'meeting_point', 'airline', 'provider', 'includes', 'synthesized'];

-- ── 4. Renames ──────────────────────────────────────────────────────────────────────────
UPDATE public.trip_component
   SET payload = (payload - 'seats') || jsonb_build_object('seat', payload->>'seats')
 WHERE payload ? 'seats' AND NOT payload ? 'seat';

UPDATE public.trip_component
   SET payload = (payload - 'duration_hours' - 'duration_minutes')
               || jsonb_build_object('duration',
                    CASE WHEN payload ? 'duration_hours'
                         THEN (payload->>'duration_hours') || ' hours'
                         ELSE (payload->>'duration_minutes') || ' minutes' END)
 WHERE payload ?| ARRAY['duration_hours', 'duration_minutes'];

-- ── 5. Drop what has been moved ─────────────────────────────────────────────────────────
UPDATE public.trip_component
   SET payload = payload - 'origin' - 'destination' - 'meeting_point' - 'policy_number'
                         - 'airline' - 'provider' - 'nights' - 'rate_cents_per_night'
                         - 'includes' - 'synthesized' - 'seats'
                         - 'duration_hours' - 'duration_minutes'
 WHERE payload ?| ARRAY['origin', 'destination', 'meeting_point', 'policy_number',
                        'airline', 'provider', 'nights', 'rate_cents_per_night',
                        'includes', 'synthesized', 'seats',
                        'duration_hours', 'duration_minutes'];

-- ── Assertions ──────────────────────────────────────────────────────────────────────────
--
-- Restated here, as every migration in §3.4 now does. A DO block is a statement and sees
-- only the catalog and the rows as they stand today; these two are about THIS migration's
-- own work and nothing else can make them true.

DO $$
DECLARE stragglers text;
BEGIN
    SELECT string_agg(DISTINCT k, ', ') INTO stragglers
      FROM public.trip_component c, jsonb_object_keys(c.payload) AS k
     WHERE k IN ('origin', 'destination', 'meeting_point', 'policy_number', 'airline',
                 'provider', 'nights', 'rate_cents_per_night', 'includes', 'synthesized',
                 'seats', 'duration_hours', 'duration_minutes');
    IF stragglers IS NOT NULL THEN
        RAISE EXCEPTION 'payload keys survived normalisation: %', stragglers;
    END IF;
END $$;

DO $$
DECLARE unknown text;
BEGIN
    -- EVERY REMAINING KEY IS ONE THE FORM KNOWS. This is the assertion that makes the
    -- registry real: a key here that `_shared/component.ts` does not list is a field the
    -- edit sheet cannot show and will silently drop on the next save.
    SELECT string_agg(DISTINCT k, ', ') INTO unknown
      FROM public.trip_component c, jsonb_object_keys(c.payload) AS k
     WHERE k NOT IN (
        'notes',
        'flight_number', 'cabin', 'seat',
        'room_type', 'board_basis',
        'ship', 'itinerary_name', 'dining_seating', 'gratuities_included',
        'dropoff', 'vehicle',
        'duration',
        'plan', 'coverage'
     );
    IF unknown IS NOT NULL THEN
        RAISE EXCEPTION
            'payload holds keys no component sheet can render, so an edit would drop them: %',
            unknown;
    END IF;
END $$;

COMMIT;
