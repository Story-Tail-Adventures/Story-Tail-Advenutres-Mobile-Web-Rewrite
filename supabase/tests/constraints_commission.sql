-- The commission forecast is DERIVED; the commission ledger is STORED; they are two numbers.
--
-- WHY THIS FILE EXISTS. `public.commission` has six money and status columns and no
-- producer — its only writer in the repository is seed.sql. Three of `agent_kpis()`'s
-- fifteen columns read it, on three live routes, and against the seed the figure was wrong
-- in two directions at once: trip 40 disagreed with itself by $223.04 (a flat 12% over a
-- trip total that includes two 0% flights), and $4,819.20 of committed margin on three
-- BOOKED trips was invisible because 16 of 22 revenue trips have no ledger row at all.
--
-- 20260930140000 pointed the forecast at trip.total_commission_cents, which has a real
-- producer. 20260930150000 constrained the ledger without inventing one, because §3.7's
-- reconciliation screen needs a STORED claim that can disagree with reality — a derived
-- value can only ever agree with its own children.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/constraints_commission.sql

\set ON_ERROR_STOP on

BEGIN;

\set trip40 '''0195a2c0-1a00-7000-8000-000000000040'''
\set gyasi  '''0195a2c0-1a00-7000-8000-000000000001'''
\set sandals '''0195a2c0-1a00-7000-8000-000000000030'''

CREATE OR REPLACE FUNCTION pg_temp.assert(condition boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition THEN RAISE NOTICE '  ok    %', description;
    ELSE RAISE EXCEPTION 'FAILED: %', description;
    END IF;
END;
$$;

-- Neither existing constraints file has one of these, and section 4 needs it: a CHECK added
-- by a migration ran against an EMPTY table (db reset applies migrations first and seeds
-- afterwards), so nothing has yet proved any of them rejects anything.
CREATE OR REPLACE FUNCTION pg_temp.expect_rejected(stmt text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — the statement SUCCEEDED, expected a constraint violation',
                    description;
EXCEPTION
    WHEN check_violation OR unique_violation THEN
        RAISE NOTICE '  ok    %', description;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. The fixtures exist, so nothing below passes vacuously
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The failure this section prevents is the one that makes a whole test file worthless: an
-- assertion of the form "no row is wrong" is trivially true over zero rows.

SELECT pg_temp.assert(
    (SELECT count(DISTINCT status) FROM public.commission) >= 4,
    'the seed exercises at least four commission statuses');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.commission WHERE status = 'disputed') = 1,
    'exactly one disputed row exists — 3.7.1''s "At risk" tile and 3.7.6''s reconciliation '
    'view both need one, and the seed had neither a disputed nor a lost row before');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.trip_component
      WHERE trip_id = :trip40 AND archived_at IS NULL) > 1,
    'trip 40 still has more than one component, so a per-line assertion means something');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.pipeline_weight WHERE agent_id = :gyasi) = 6,
    'all six pipeline weights exist for the agent, so the weighted forecast is real');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.trip
      WHERE agent_id = :gyasi AND archived_at IS NULL
        AND status IN ('inquiry','proposal','booked','in_progress')
        AND total_commission_cents > 0) >= 3,
    'the agent has open trips carrying commission, so the forecast is not summing nothing');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The seed agrees with itself
-- ─────────────────────────────────────────────────────────────────────────────

-- THE ROW THAT WAS WRONG. Row ...074 covered an all-inclusive resort week but named
-- supplier ...031, American Airlines, whose default_commission_pct is 0.00 — while storing
-- a 12% rate. Neither half was checkable, because commission_pct has no relationship to
-- supplier.default_commission_pct in any constraint. It still has none; this is the check.
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.commission c
          JOIN public.supplier s ON s.id = c.supplier_id
         WHERE s.default_commission_pct = 0 AND c.commission_pct > 0),
    'no ledger row claims commission from a supplier that pays none');

-- The structural version. Guarded by an inner EXISTS so the 22 package components that
-- carry no supplier_id at all do not make this fire on every trip that has one.
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.commission c
         WHERE EXISTS (SELECT 1 FROM public.trip_component tc
                        WHERE tc.trip_id = c.trip_id AND tc.supplier_id IS NOT NULL)
           AND NOT EXISTS (SELECT 1 FROM public.trip_component tc
                            WHERE tc.trip_id = c.trip_id AND tc.supplier_id = c.supplier_id)),
    'a ledger row names a supplier the trip actually booked');

-- The CLAUDE.md rule-5 violation, made loud. commission had no currency column until
-- 20260930150000 and inherited its trip's through a join agent_kpis() no longer makes.
SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.commission c JOIN public.trip t ON t.id = c.trip_id
         WHERE c.currency IS DISTINCT FROM t.currency),
    'every commission row is denominated in its trip''s currency');

-- Trip 40's $223.04. The ledger row now covers the SANDALS LINE alone (1,010,300 at 12%),
-- which is exactly what that component records, rather than a flat 12% over a trip total
-- that includes two flights correctly recorded at 0%. Read off the seed BY HAND: a fixture
-- recomputed with the implementation's own expression agrees with it whatever either does.
SELECT pg_temp.assert(
    (SELECT expected_commission_cents FROM public.commission WHERE trip_id = :trip40)
        = 121236,
    'trip 40''s ledger row is the Sandals line at 12%, not a flat rate over the whole trip');

SELECT pg_temp.assert(
    (SELECT c.expected_commission_cents FROM public.commission c WHERE c.trip_id = :trip40)
    = (SELECT tc.commission_cents FROM public.trip_component tc
        WHERE tc.trip_id = :trip40 AND tc.supplier_id = :sandals),
    '... and it agrees with the component it describes, to the cent');

-- The fee is what separates a settled row from one to chase. Both shapes are in the seed
-- on purpose, and this is the expression screen 3.7.6 renders.
SELECT pg_temp.assert(
    (SELECT expected_commission_cents - processing_fee_cents - received_commission_cents
       FROM public.commission WHERE status = 'received') = 0,
    'the received row reconciles exactly once its processing fee is allowed for');

SELECT pg_temp.assert(
    (SELECT expected_commission_cents - processing_fee_cents - received_commission_cents
       FROM public.commission WHERE status = 'disputed') > 0,
    'the disputed row has a gap the fee does NOT explain — that is what makes it disputed');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The forecast, fired for real
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE forecast_expected AS
SELECT
    coalesce(sum(t.total_commission_cents), 0)::bigint AS raw,
    coalesce(sum(t.total_commission_cents * pw.weight_pct / 100.0), 0)::bigint AS weighted
  FROM public.trip t
  JOIN public.pipeline_weight pw
    ON pw.agent_id = t.agent_id AND pw.status = t.status
 WHERE t.agent_id = :gyasi
   AND t.archived_at IS NULL
   AND t.status IN ('inquiry', 'proposal', 'booked', 'in_progress');
GRANT SELECT ON forecast_expected TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.become(account uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', account::text, 'role', 'authenticated')::text, true);
END;
$$;

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-000000000010'::uuid);

SELECT pg_temp.assert(
    (SELECT commission_expected_cents::bigint FROM public.agent_kpis())
        = (SELECT raw FROM forecast_expected),
    'the forecast equals the independently computed sum over open trips');

SELECT pg_temp.assert(
    (SELECT commission_weighted_cents::bigint FROM public.agent_kpis())
        = (SELECT weighted FROM forecast_expected),
    '... and the weighted figure equals its pipeline_weight-weighted twin');

-- THE ASSERTION THAT WOULD HAVE CAUGHT THE $4,819.20. Named by trip, because the general
-- form above would also pass against a forecast that read the ledger if the ledger happened
-- to be complete. These three are BOOKED, carry commission, and have no ledger row.
SELECT pg_temp.assert(
    (SELECT commission_expected_cents::bigint FROM public.agent_kpis())
        >= 297600 + 136800 + 47520,
    'Maldives, Kyoto and Bimini reach the forecast — booked trips with no invoice yet, '
    'which the ledger-sourced version could not see at all');

-- NULL, not 0%, when there is nothing to be confident about.
SELECT pg_temp.assert(
    (SELECT commission_confidence_pct FROM public.agent_kpis())
        = (SELECT round(weighted * 100.0 / nullif(raw, 0))::smallint FROM forecast_expected),
    'confidence is the weighted total over the raw one, rounded');

RESET ROLE;

-- FIRE THE TRIGGER FOR REAL, which is what makes "derived" mean anything. A plpgsql body
-- compiles on FIRST EXECUTION, so an installed trigger can still be broken, and a forecast
-- that merely happens to match a snapshot proves nothing about whether it MOVES.
CREATE TEMP TABLE before_probe AS
SELECT (SELECT total_commission_cents FROM public.trip WHERE id = :trip40) AS trip_total;

INSERT INTO public.trip_component
    (id, trip_id, kind, display_name, cost_cents, commission_pct, commission_cents, currency)
VALUES ('01a0b1c2-d300-7000-8000-00000000ff01', :trip40, 'excursion',
        'Forecast probe', 50000, 20.00, 10000, 'USD');

SELECT pg_temp.assert(
    (SELECT total_commission_cents FROM public.trip WHERE id = :trip40)
        = (SELECT trip_total FROM before_probe) + 10000,
    'adding a component moves the trip''s commission by exactly that component''s own');

CREATE TEMP TABLE probe_weight AS
SELECT pw.weight_pct FROM public.pipeline_weight pw
  JOIN public.trip t ON t.agent_id = pw.agent_id AND t.status = pw.status
 WHERE t.id = :trip40;
GRANT SELECT ON probe_weight TO authenticated;
GRANT SELECT ON before_probe TO authenticated;

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-000000000010'::uuid);
SELECT pg_temp.assert(
    (SELECT commission_expected_cents::bigint FROM public.agent_kpis())
        = (SELECT raw FROM forecast_expected) + 10000,
    '... and the FORECAST moves with it, by the same amount');
SELECT pg_temp.assert(
    (SELECT commission_weighted_cents::bigint FROM public.agent_kpis())
        = (SELECT weighted FROM forecast_expected)
          + (SELECT (10000 * weight_pct / 100.0)::bigint FROM probe_weight),
    '... and the weighted figure moves by that component weighted by its trip''s stage');
RESET ROLE;

UPDATE public.trip_component SET archived_at = now()
 WHERE id = '01a0b1c2-d300-7000-8000-00000000ff01';

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-000000000010'::uuid);
SELECT pg_temp.assert(
    (SELECT commission_expected_cents::bigint FROM public.agent_kpis())
        = (SELECT raw FROM forecast_expected),
    'archiving it takes the money back out — the figure is recomputed, never a delta');
RESET ROLE;

DELETE FROM public.trip_component WHERE id = '01a0b1c2-d300-7000-8000-00000000ff01';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The ledger does not reach the forecast
-- ─────────────────────────────────────────────────────────────────────────────
--
-- THE BEST ASSERTION IN THIS FILE. It encodes the design decision itself: these are two
-- numbers, and §3.7.6 exists precisely because they are allowed to disagree. seed.sql used
-- to express this as a hope — "so that a future change that accidentally sweeps it into the
-- forecast shows up as a number moving" — and this is that hope turned into a check.

INSERT INTO public.commission (
    id, trip_id, agent_id, supplier_id, gross_booking_cents, commission_pct,
    expected_commission_cents, processing_fee_cents, received_commission_cents, currency,
    payment_terms, status, received_at, inteletravel_reference
) VALUES ('01a0b1c2-d300-7000-8000-00000000ff02', :trip40, :gyasi, :sandals,
          99999900, 50.00, 49999950, 0, 0, 'USD', 'absurd', 'expected', NULL, NULL);

SELECT pg_temp.become('0195a2c0-1a00-7000-8000-000000000010'::uuid);
SELECT pg_temp.assert(
    (SELECT commission_expected_cents::bigint FROM public.agent_kpis())
        = (SELECT raw FROM forecast_expected),
    'a half-million-dollar ledger row on an OPEN trip does not move the forecast by a cent');
RESET ROLE;

DELETE FROM public.commission WHERE id = '01a0b1c2-d300-7000-8000-00000000ff02';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The constraints reject what they should
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every one was added by a migration against an EMPTY table, so until here none of them has
-- been shown to refuse anything.

SELECT pg_temp.expect_rejected(
    $q$UPDATE public.commission SET commission_pct = 150 WHERE id = '01a0b1c2-d300-7000-8000-000000000071'$q$,
    'a commission rate above 100% is refused');

SELECT pg_temp.expect_rejected(
    $q$UPDATE public.commission SET expected_commission_cents = expected_commission_cents + 1
        WHERE id = '01a0b1c2-d300-7000-8000-000000000071'$q$,
    'expected_commission_cents out of step with gross x rate is refused — the Data Model '
    'said "Computed" and now that word is enforced');

SELECT pg_temp.expect_rejected(
    $q$UPDATE public.commission SET processing_fee_cents = -1
        WHERE id = '01a0b1c2-d300-7000-8000-000000000071'$q$,
    'a negative processing fee is refused');

SELECT pg_temp.expect_rejected(
    $q$UPDATE public.commission SET status = 'received'
        WHERE id = '01a0b1c2-d300-7000-8000-000000000071'$q$,
    'a row that says the money arrived must say when');

SELECT pg_temp.expect_rejected(
    $q$UPDATE public.commission SET received_at = current_date
        WHERE id = '01a0b1c2-d300-7000-8000-000000000071'$q$,
    'a received_at on an `expected` row is refused — a date means money moved');

SELECT pg_temp.expect_rejected(
    $q$UPDATE public.commission SET inteletravel_reference = 'ITV-2026-0912'
        WHERE id = '01a0b1c2-d300-7000-8000-000000000071'$q$,
    'two rows cannot share one Inteletravel reference for the same agent — §3.7.5''s import '
    'reconciles on it');

-- And the partial index really is partial: the many rows with no reference at all must not
-- collide with each other.
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.commission WHERE inteletravel_reference IS NULL) > 1,
    'several rows carry no Inteletravel reference and coexist — the unique index is partial');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The dated promises, swept for real
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.payment_milestone
    (id, trip_id, kind, label, amount_cents, currency, due_date, paid_cents, status, order_index)
VALUES
    ('01a0b1c2-d300-7000-8000-00000000fa01', :trip40, 'final', 'Past due, scheduled',
     10000, 'USD', current_date - 3, 0, 'scheduled', 90),
    ('01a0b1c2-d300-7000-8000-00000000fa02', :trip40, 'final', 'Past due, WAIVED',
     10000, 'USD', current_date - 3, 0, 'waived', 91),
    ('01a0b1c2-d300-7000-8000-00000000fa03', :trip40, 'final', 'Due today, not late',
     10000, 'USD', current_date, 0, 'scheduled', 92),
    ('01a0b1c2-d300-7000-8000-00000000fa04', :trip40, 'final', 'Deadline extended',
     10000, 'USD', current_date + 14, 0, 'scheduled', 93);

SELECT public.sweep_dated_promises();

SELECT pg_temp.assert(
    (SELECT status FROM public.payment_milestone
      WHERE id = '01a0b1c2-d300-7000-8000-00000000fa01') = 'overdue',
    'a scheduled milestone past its due date is promoted to overdue — the sweep Data-Model '
    '§9.5 built an index for and nobody ever wrote');

SELECT pg_temp.assert(
    (SELECT status FROM public.payment_milestone
      WHERE id = '01a0b1c2-d300-7000-8000-00000000fa02') = 'waived',
    'a WAIVED milestone past its due date is left alone — waived is a decision, overdue is '
    'an observation');

SELECT pg_temp.assert(
    (SELECT status FROM public.payment_milestone
      WHERE id = '01a0b1c2-d300-7000-8000-00000000fa03') = 'scheduled',
    'a milestone due TODAY is not late');

-- SUPPRESSION, which is the reason §9.5 stores this status rather than deriving it. The
-- advisor expresses "the supplier extended the deadline" by moving the date, and the sweep
-- must not argue with them the next morning.
SELECT pg_temp.assert(
    (SELECT status FROM public.payment_milestone
      WHERE id = '01a0b1c2-d300-7000-8000-00000000fa04') = 'scheduled',
    'a milestone whose date was moved forward is not promoted — moving the date IS how an '
    'advisor suppresses the red row');

-- Idempotent, and it never demotes.
UPDATE public.payment_milestone SET due_date = current_date + 30
 WHERE id = '01a0b1c2-d300-7000-8000-00000000fa01';
SELECT public.sweep_dated_promises();
SELECT pg_temp.assert(
    (SELECT status FROM public.payment_milestone
      WHERE id = '01a0b1c2-d300-7000-8000-00000000fa01') = 'overdue',
    'the sweep only ever promotes: re-dating an already-overdue row does not un-flag it, '
    'because that is an advisor''s call and not a job''s');

DELETE FROM public.payment_milestone WHERE id::text LIKE '01a0b1c2-d300-7000-8000-00000000fa0%';

-- The other dated promise. Data-Model §9.2 says authorizations expire automatically and
-- nothing anywhere wrote 'expired'. This one is on a payment surface and it BLOCKS: the
-- card_auth_active_per_trip unique index is partial on status='active', so a stale row that
-- never expires stops a new authorization for the same card and trip being created at all.
CREATE TEMP TABLE auth_probe AS
SELECT id, payment_card_id, trip_id FROM public.card_authorization LIMIT 1;

SELECT pg_temp.assert(
    (SELECT count(*) FROM auth_probe) = 1,
    'the seed has a card_authorization to bite on');

UPDATE public.card_authorization
   SET status = 'active', expires_at = now() - interval '2 days'
 WHERE id = (SELECT id FROM auth_probe);

SELECT public.sweep_dated_promises();

SELECT pg_temp.assert(
    (SELECT status FROM public.card_authorization WHERE id = (SELECT id FROM auth_probe))
        = 'expired',
    'an authorization past expires_at is expired — and until now nothing in the repository '
    'ever wrote that value');

-- `revoked` is somebody's decision and a sweep must not overwrite it with a weaker word.
UPDATE public.card_authorization
   SET status = 'revoked', expires_at = now() - interval '2 days'
 WHERE id = (SELECT id FROM auth_probe);
SELECT public.sweep_dated_promises();
SELECT pg_temp.assert(
    (SELECT status FROM public.card_authorization WHERE id = (SELECT id FROM auth_probe))
        = 'revoked',
    'a REVOKED authorization past its expiry stays revoked');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. One forward guard, LABELLED as vacuous today
-- ─────────────────────────────────────────────────────────────────────────────
--
-- commission_import has zero rows and no producer; §3.7.5's CSV importer is the first
-- writer. This assertion therefore checks NOTHING right now, and saying so is the point —
-- an unlabelled vacuous assertion is worse than no assertion, because it reads as coverage.
-- It starts working the day 3.7.5 lands, which is when the counters it guards first exist.

SELECT pg_temp.assert(
    NOT EXISTS (
        SELECT 1 FROM public.commission_import
         WHERE total_rows <> matched_rows + unmatched_rows),
    'every commission import''s rows add up (VACUOUS TODAY: the table is empty until §3.7.5)');

ROLLBACK;
