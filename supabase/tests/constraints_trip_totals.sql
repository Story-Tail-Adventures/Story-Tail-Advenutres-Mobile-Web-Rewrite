-- `trip.total_value_cents` and `total_commission_cents` are a computed sum, not a hand-set
-- number.
--
-- WHY THIS FILE EXISTS. docs/Data-Model.md described both as sums of the trip's components
-- and nothing computed either — no trigger, no function, only hand-set seed rows. The
-- discrepancy was real and already present: trip 0040 claimed $12,845 while its components
-- summed to $11,645, because it had an outbound flight and no return. Nothing noticed,
-- because nothing checked. These assertions are the check.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/constraints_trip_totals.sql

\set ON_ERROR_STOP on

BEGIN;

\set trip '''0195a2c0-1a00-7000-8000-000000000040'''

CREATE OR REPLACE FUNCTION pg_temp.assert(condition boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition THEN RAISE NOTICE '  ok    %', description;
    ELSE RAISE EXCEPTION 'FAILED: %', description;
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The seed agrees with itself
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.trip t
          JOIN (SELECT trip_id, sum(cost_cents) v, sum(commission_cents) k
                  FROM public.trip_component WHERE archived_at IS NULL GROUP BY trip_id) s
            ON s.trip_id = t.id
         WHERE (t.total_value_cents, t.total_commission_cents) IS DISTINCT FROM (s.v, s.k)),
    'every seeded trip with components has totals equal to their sum');

-- The one that was wrong, pinned by name so a future seed edit cannot quietly reintroduce
-- the gap. 1284500 is what the payment milestones bill; before the return leg was added the
-- components summed to 1164500 and nothing reconciled the two.
SELECT pg_temp.assert(
    (SELECT total_value_cents FROM public.trip WHERE id = :trip::uuid) = 1284500,
    'trip 0040 totals 1284500, and its components actually add up to it');

SELECT pg_temp.assert(
    (SELECT sum(amount_cents) FROM public.payment_milestone WHERE trip_id = :trip::uuid)
    = (SELECT total_value_cents FROM public.trip WHERE id = :trip::uuid),
    '... and its payment milestones bill exactly that, no more');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The trigger, fired for real
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A plpgsql body is compiled on FIRST EXECUTION, not at CREATE — so a trigger function can
-- be installed by a migration that applies cleanly and still be broken. These insert,
-- update, archive and delete for that reason, not for completeness.

CREATE TEMP TABLE before_probe AS
SELECT total_value_cents v, total_commission_cents k FROM public.trip WHERE id = :trip::uuid;

INSERT INTO public.trip_component
    (id, trip_id, kind, display_name, cost_cents, commission_cents, currency)
VALUES ('0195a2c0-1a00-7000-8000-0000000000fe', :trip::uuid, 'custom', 'Totals probe',
        10000, 1500, 'USD');

SELECT pg_temp.assert(
    (SELECT total_value_cents FROM public.trip WHERE id = :trip::uuid)
    = (SELECT v FROM before_probe) + 10000
    AND (SELECT total_commission_cents FROM public.trip WHERE id = :trip::uuid)
    = (SELECT k FROM before_probe) + 1500,
    'INSERT moves both totals by exactly the component''s own figures');

UPDATE public.trip_component SET cost_cents = 25000, commission_cents = 4000
 WHERE id = '0195a2c0-1a00-7000-8000-0000000000fe';

SELECT pg_temp.assert(
    (SELECT total_value_cents FROM public.trip WHERE id = :trip::uuid)
    = (SELECT v FROM before_probe) + 25000,
    'UPDATE of cost_cents re-sums rather than adding the difference twice');

-- ARCHIVING IS HOW §3.4.12 REMOVES A COMPONENT (Data-Model §20.1 soft delete). A removal
-- that left the total standing would be the same bug in the other direction.
UPDATE public.trip_component SET archived_at = now()
 WHERE id = '0195a2c0-1a00-7000-8000-0000000000fe';

SELECT pg_temp.assert(
    (SELECT total_value_cents FROM public.trip WHERE id = :trip::uuid) = (SELECT v FROM before_probe)
    AND (SELECT total_commission_cents FROM public.trip WHERE id = :trip::uuid) = (SELECT k FROM before_probe),
    'archiving a component takes its money back out');

UPDATE public.trip_component SET archived_at = NULL
 WHERE id = '0195a2c0-1a00-7000-8000-0000000000fe';

SELECT pg_temp.assert(
    (SELECT total_value_cents FROM public.trip WHERE id = :trip::uuid)
    = (SELECT v FROM before_probe) + 25000,
    'un-archiving puts it back');

DELETE FROM public.trip_component WHERE id = '0195a2c0-1a00-7000-8000-0000000000fe';

SELECT pg_temp.assert(
    (SELECT total_value_cents FROM public.trip WHERE id = :trip::uuid) = (SELECT v FROM before_probe),
    'a hard DELETE is handled too — the row is in OLD, not NEW');

-- ── Moving a component BETWEEN trips touches both ─────────────────────────

-- The naive trigger recomputes the destination and leaves the source overstated forever,
-- which is why the function collects trip ids from OLD *and* NEW rather than one of them.
CREATE TEMP TABLE two_trips AS
SELECT t.id, t.total_value_cents v
  FROM public.trip t
 WHERE t.id IN (:trip::uuid, '0195a2c0-1a00-7000-8000-000000000044');

INSERT INTO public.trip_component
    (id, trip_id, kind, display_name, cost_cents, commission_cents, currency)
VALUES ('0195a2c0-1a00-7000-8000-0000000000fd', :trip::uuid, 'custom', 'Mover', 50000, 0, 'USD');

UPDATE public.trip_component SET trip_id = '0195a2c0-1a00-7000-8000-000000000044'
 WHERE id = '0195a2c0-1a00-7000-8000-0000000000fd';

SELECT pg_temp.assert(
    (SELECT total_value_cents FROM public.trip WHERE id = :trip::uuid)
    = (SELECT v FROM two_trips WHERE id = :trip::uuid),
    'moving a component out returns the SOURCE trip to its old total');

SELECT pg_temp.assert(
    (SELECT total_value_cents FROM public.trip WHERE id = '0195a2c0-1a00-7000-8000-000000000044')
    = (SELECT v FROM two_trips WHERE id = '0195a2c0-1a00-7000-8000-000000000044') + 50000,
    '... and the DESTINATION gains it');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. One trip, one currency
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Story-Tail quotes in USD (Gyasi, 2026-09-27), so a mixed-currency trip is not a case this
-- business has. The guard exists anyway because summing across currencies needs an FX rate
-- that is nowhere in this schema, and silently dropping the odd one out would make the
-- headline total omit a cost the advisor entered.
DO $cur$
BEGIN
    INSERT INTO public.trip_component
        (id, trip_id, kind, display_name, cost_cents, currency)
    VALUES (gen_random_uuid(), '0195a2c0-1a00-7000-8000-000000000040', 'custom',
            'Euro probe', 100, 'EUR');
    RAISE EXCEPTION 'FAILED: a EUR component on a USD trip should have been refused';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
        RAISE NOTICE '  ok    a component in another currency than its trip is refused';
END $cur$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. What the trigger must NOT touch
-- ─────────────────────────────────────────────────────────────────────────────

-- `total_paid_cents` is money that actually moved, tracked against supplier payments and
-- card use. A trip can be fully built and entirely unpaid, so it is not a function of the
-- component list and the trigger leaves it alone.
CREATE TEMP TABLE paid_before AS
SELECT total_paid_cents p FROM public.trip WHERE id = :trip::uuid;

INSERT INTO public.trip_component
    (id, trip_id, kind, display_name, cost_cents, commission_cents, currency)
VALUES ('0195a2c0-1a00-7000-8000-0000000000fc', :trip::uuid, 'custom', 'Paid probe',
        99999, 0, 'USD');

SELECT pg_temp.assert(
    (SELECT total_paid_cents FROM public.trip WHERE id = :trip::uuid) = (SELECT p FROM paid_before),
    'total_paid_cents is untouched — components are what a trip costs, not what was paid');

ROLLBACK;
