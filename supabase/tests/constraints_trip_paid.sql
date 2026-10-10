-- `trip.total_paid_cents` is the sum of its milestones, not a hand-set number.
--
-- WHY THIS FILE EXISTS. Data-Model §9.5 said PaymentMilestone "is what finally gives
-- `trip.total_paid_cents` a producer", and it never got one — five accessors read the
-- column and nothing wrote it. The discrepancy was real and already present: 20 trips
-- claimed $81,390 of payments with no schedule behind them, and of the three trips that
-- DID have a schedule, two contradicted it — one showing a final balance marked `overdue`
-- while the trip claimed that exact amount as paid.
--
-- It also reaches further than the other two totals. `wallet/authorize/[tripId]` computes
-- `balanceDueCents = totalValueCents - totalPaidCents`, so this column sizes the
-- outstanding balance a traveler is shown when they authorize a card.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/constraints_trip_paid.sql

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

CREATE OR REPLACE FUNCTION pg_temp.paid(t uuid) RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT total_paid_cents FROM public.trip WHERE id = t;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The seed agrees with itself
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.trip t
          LEFT JOIN (SELECT trip_id, sum(paid_cents) p
                       FROM public.payment_milestone GROUP BY trip_id) s
            ON s.trip_id = t.id
         WHERE t.total_paid_cents IS DISTINCT FROM coalesce(s.p, 0)),
    'every trip''s total_paid_cents equals the sum of its milestones');

-- The assertion above is vacuous on a database with no paid milestones, and a seed change
-- could empty it without anyone noticing. This is what stops that.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.trip WHERE total_paid_cents > 0) > 5,
    '... and there is real paid money for it to have checked');

-- THE THREE DELIBERATE FIXTURES, each a state the UI has to render and none of them
-- reachable before this migration. A generated "Payment on file" row on any of them would
-- mean the fixture had stopped saying what it was written to say.
SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.trip t JOIN public.payment_milestone m ON m.trip_id = t.id
             WHERE t.total_paid_cents = 0 AND m.status = 'scheduled'),
    'a booked trip whose deposit has not landed reads zero paid, not the deposit amount');

SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.payment_milestone WHERE status = 'overdue' AND paid_cents = 0),
    'an overdue milestone is unpaid — the state that used to contradict the trip beside it');

SELECT pg_temp.assert(
    EXISTS (SELECT 1 FROM public.trip t
             WHERE t.total_paid_cents > 0
               AND (SELECT count(*) FROM public.payment_milestone m
                     WHERE m.trip_id = t.id AND m.status = 'paid') > 1),
    'a part-paid trip sums more than one paid milestone');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The trigger tracks every verb
-- ─────────────────────────────────────────────────────────────────────────────

\set before 0
SELECT set_config('pg_temp.before', pg_temp.paid(:trip::uuid)::text, false);

-- INSERT
INSERT INTO public.payment_milestone (id, trip_id, kind, label, amount_cents, currency,
                                      due_date, paid_at, paid_cents, status, order_index)
VALUES ('01a0b1c2-d300-7000-8000-00000000e001', :trip::uuid, 'interim', 'Test payment',
        50000, 'USD', current_date, now(), 50000, 'paid', 9);

SELECT pg_temp.assert(
    pg_temp.paid(:trip::uuid) = current_setting('pg_temp.before')::bigint + 50000,
    'inserting a paid milestone raises the trip total by its paid amount');

-- UPDATE of paid_cents
UPDATE public.payment_milestone SET paid_cents = 30000
 WHERE id = '01a0b1c2-d300-7000-8000-00000000e001';

SELECT pg_temp.assert(
    pg_temp.paid(:trip::uuid) = current_setting('pg_temp.before')::bigint + 30000,
    'lowering a milestone''s paid amount lowers the trip total');

-- AN UPDATE THAT TOUCHES NEITHER COLUMN MUST NOT MOVE ANYTHING. The schedule editor saves
-- on every field; a label change re-running the sum would be harmless but a label change
-- bumping `trip.updated_at` is not, because "last touched" readings derive from it.
UPDATE public.payment_milestone SET label = 'Renamed'
 WHERE id = '01a0b1c2-d300-7000-8000-00000000e001';

SELECT pg_temp.assert(
    pg_temp.paid(:trip::uuid) = current_setting('pg_temp.before')::bigint + 30000,
    'renaming a milestone changes no total');

-- A SCHEDULED MILESTONE CONTRIBUTES NOTHING. `amount_cents` is what the supplier expects;
-- only `paid_cents` is money that moved, and conflating them is the error that made an
-- overdue balance read as paid.
UPDATE public.payment_milestone SET amount_cents = 999999
 WHERE id = '01a0b1c2-d300-7000-8000-00000000e001';

SELECT pg_temp.assert(
    pg_temp.paid(:trip::uuid) = current_setting('pg_temp.before')::bigint + 30000,
    'raising what a milestone EXPECTS does not raise what the trip has PAID');

-- Cross-trip move: both sides settle.
UPDATE public.payment_milestone
   SET trip_id = '0195a2c0-1a00-7000-8000-000000000044'
 WHERE id = '01a0b1c2-d300-7000-8000-00000000e001';

SELECT pg_temp.assert(
    pg_temp.paid(:trip::uuid) = current_setting('pg_temp.before')::bigint,
    'moving a milestone to another trip settles the trip it left');

SELECT pg_temp.assert(
    pg_temp.paid('0195a2c0-1a00-7000-8000-000000000044'::uuid)
        = (SELECT coalesce(sum(paid_cents), 0) FROM public.payment_milestone
            WHERE trip_id = '0195a2c0-1a00-7000-8000-000000000044'),
    '... and the trip it joined');

-- DELETE. `payment_milestone` is NOT on Data-Model §20.1's soft-delete list and nothing
-- references it, so removal is a hard delete and the trigger must see it.
DELETE FROM public.payment_milestone WHERE id = '01a0b1c2-d300-7000-8000-00000000e001';

SELECT pg_temp.assert(
    pg_temp.paid('0195a2c0-1a00-7000-8000-000000000044'::uuid)
        = (SELECT coalesce(sum(paid_cents), 0) FROM public.payment_milestone
            WHERE trip_id = '0195a2c0-1a00-7000-8000-000000000044'),
    'deleting a milestone lowers the trip total');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. One trip, one currency
-- ─────────────────────────────────────────────────────────────────────────────

DO $cur$
BEGIN
    INSERT INTO public.payment_milestone (id, trip_id, kind, label, amount_cents, currency,
                                          due_date, paid_cents, status, order_index)
    VALUES ('01a0b1c2-d300-7000-8000-00000000e002',
            '0195a2c0-1a00-7000-8000-000000000040', 'interim', 'Euro payment',
            10000, 'EUR', current_date, 0, 'scheduled', 9);
    RAISE EXCEPTION 'FAILED: a milestone in another currency should have been refused';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
        RAISE NOTICE '  ok    a milestone whose currency differs from its trip is refused';
END $cur$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The two totals are independent
-- ─────────────────────────────────────────────────────────────────────────────

-- 20260928100000's trigger watches `trip_component`; this one watches `payment_milestone`.
-- Neither may touch the other's column, or a trip that is fully paid would read as having
-- cost nothing.
SELECT set_config('pg_temp.value', (SELECT total_value_cents FROM public.trip WHERE id = :trip::uuid)::text, false);

INSERT INTO public.payment_milestone (id, trip_id, kind, label, amount_cents, currency,
                                      due_date, paid_at, paid_cents, status, order_index)
VALUES ('01a0b1c2-d300-7000-8000-00000000e003', :trip::uuid, 'interim', 'Another',
        25000, 'USD', current_date, now(), 25000, 'paid', 9);

SELECT pg_temp.assert(
    (SELECT total_value_cents FROM public.trip WHERE id = :trip::uuid)
        = current_setting('pg_temp.value')::bigint,
    'paying a milestone does not change what the trip COST');

ROLLBACK;
