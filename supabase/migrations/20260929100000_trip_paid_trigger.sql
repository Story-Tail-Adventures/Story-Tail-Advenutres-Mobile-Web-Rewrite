-- `trip.total_paid_cents` becomes the sum Data-Model §9.5 already says it is.
--
-- ── THE THIRD COLUMN IN THIS SHAPE, AND THE ONE THAT REACHES FURTHEST ───────────────────
--
-- §9.5's purpose line, written when `payment_milestone` was added: *"it is what finally
-- gives `trip.total_paid_cents` a producer."* It never got one. Five accessors read the
-- column — the trip roster, trip detail, client detail, the agent read surface and
-- `trip_self_select` — and nothing in the schema or in any Edge Function has ever written
-- it. Same shape as `client.lifetime_value_cents` and `trip.total_value_cents` before it,
-- found the same way: read what the doc claims, then look for the code that makes it so.
--
-- WHAT MAKES THIS ONE DIFFERENT. The other two were display figures. This one is an input:
-- `web/app/(client)/wallet/authorize/[tripId]/page.tsx` computes
--
--     balanceDueCents = totalValueCents - totalPaidCents
--
-- which is the outstanding balance a traveler is shown when they authorize a card. Since
-- 20260928100000 the left side is a real sum of components; the right side was hand-set.
--
-- ── WHAT WAS ACTUALLY WRONG, BEFORE THE FIX ─────────────────────────────────────────────
--
--   * 20 trips claimed a payment with NO schedule behind it at all — $81,390 of
--     client-visible "already paid".
--   * Of the three trips that DID have a schedule, two contradicted it. One showed a final
--     balance marked `overdue` while the trip claimed that exact amount as paid, so §2.2.3
--     rendered "overdue" and "you have paid $2,560" on the same screen.
--
-- ── AND WHY THE BACKFILL ADDS PAYMENTS RATHER THAN REMOVING THEM ────────────────────────
--
-- The opposite call from 20260928100000, and the seed is the reason. Every `booked`,
-- `in_progress` and `completed` trip claims a payment; no `inquiry` or `proposal` trip
-- does. That is coherent — a trip does not complete unpaid — so the PAYMENTS are real and
-- the SCHEDULE is what is missing. Letting the column collapse to zero would have deleted
-- a true fact and raised twenty travelers' balance due.
--
-- The backfill therefore only touches trips with NO milestones at all. A trip whose
-- schedule already exists is left to it: somebody expressed an intent there, and a
-- generated row beside a deliberate one is how a fixture stops meaning anything.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- One trip, one currency — the same guard `trip_component` has
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.payment_milestone_currency_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_currency char(3);
BEGIN
    SELECT t.currency INTO v_currency FROM public.trip t WHERE t.id = NEW.trip_id;

    IF v_currency IS NOT NULL AND NEW.currency <> v_currency THEN
        RAISE EXCEPTION
            'payment_milestone.currency (%) must match its trip (%) — a total cannot sum '
            'two currencies', NEW.currency, v_currency;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_milestone_currency_guard ON public.payment_milestone;
CREATE TRIGGER payment_milestone_currency_guard
    BEFORE INSERT OR UPDATE OF currency, trip_id ON public.payment_milestone
    FOR EACH ROW EXECUTE FUNCTION public.payment_milestone_currency_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- The producer
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trip_recompute_paid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip uuid;
BEGIN
    -- BOTH SIDES, so a milestone moved between trips fixes the one it left as well as the
    -- one it joined. `trip_id` is in the UPDATE OF list for exactly this.
    FOR v_trip IN
        SELECT DISTINCT id FROM (
            SELECT CASE WHEN TG_OP <> 'INSERT' THEN OLD.trip_id END AS id
            UNION ALL
            SELECT CASE WHEN TG_OP <> 'DELETE' THEN NEW.trip_id END
        ) ids WHERE id IS NOT NULL
    LOOP
        -- RECOMPUTED, never a delta. A delta is right until the first time one is missed,
        -- and then it is wrong forever with nothing to notice — which is the state this
        -- column was already in.
        UPDATE public.trip t
           SET total_paid_cents = sub.paid,
               updated_at = now()
          FROM (
            SELECT coalesce(sum(pm.paid_cents), 0) AS paid
              FROM public.payment_milestone pm
             WHERE pm.trip_id = v_trip
          ) sub
         WHERE t.id = v_trip
           -- Only when it actually moved: the schedule editor saves on every field, and a
           -- no-change UPDATE would bump `trip.updated_at` and every "last touched" reading
           -- derived from it.
           AND t.total_paid_cents IS DISTINCT FROM sub.paid;
    END LOOP;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trip_recompute_paid ON public.payment_milestone;
CREATE TRIGGER trip_recompute_paid
    AFTER INSERT OR DELETE OR UPDATE OF paid_cents, trip_id ON public.payment_milestone
    FOR EACH ROW EXECUTE FUNCTION public.trip_recompute_paid();

-- Postgres grants EXECUTE on a new function to PUBLIC by default, which `rls_agent_domain`
-- asserts against — a trigger function is not callable usefully by hand, but "not useful"
-- is not a security boundary.
REVOKE EXECUTE ON FUNCTION public.trip_recompute_paid()               FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.payment_milestone_currency_guard()  FROM public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill
-- ─────────────────────────────────────────────────────────────────────────────

-- ONE ROW, for the whole claimed amount, and only where there is no schedule to disagree
-- with. `deposit` rather than `final` because it is money already taken; `paid_at` is the
-- trip's own start date where there is one, so the row sorts sensibly against milestones
-- an advisor adds later rather than all landing on the migration's timestamp.
INSERT INTO public.payment_milestone (
    id, trip_id, kind, label, amount_cents, currency,
    due_date, paid_at, paid_cents, status, order_index
)
SELECT
    gen_random_uuid(), t.id, 'deposit',
    'Payment on file',
    t.total_paid_cents, t.currency,
    coalesce(t.start_date, current_date),
    coalesce(t.start_date::timestamptz, t.created_at),
    t.total_paid_cents, 'paid', 0
  FROM public.trip t
 WHERE t.total_paid_cents > 0
   AND NOT EXISTS (SELECT 1 FROM public.payment_milestone pm WHERE pm.trip_id = t.id);

-- The trigger fired on every row above and set each trip's total to the sum it just
-- inserted, which is the same number it already held. Trips that DO have a schedule are
-- untouched by the insert, so their totals are still whatever was hand-set — this brings
-- them onto their own schedule, which is the deliberate artifact of the two.
UPDATE public.trip t
   SET total_paid_cents = sub.paid,
       updated_at = now()
  FROM (
    SELECT pm.trip_id, sum(pm.paid_cents) AS paid
      FROM public.payment_milestone pm GROUP BY pm.trip_id
  ) sub
 WHERE t.id = sub.trip_id
   AND t.total_paid_cents IS DISTINCT FROM sub.paid;

-- A trip with no schedule at all and no claim is zero, not whatever it was.
UPDATE public.trip t
   SET total_paid_cents = 0, updated_at = now()
 WHERE t.total_paid_cents <> 0
   AND NOT EXISTS (SELECT 1 FROM public.payment_milestone pm WHERE pm.trip_id = t.id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE bad integer;
BEGIN
    SELECT count(*) INTO bad
      FROM public.trip t
      LEFT JOIN (
        SELECT trip_id, sum(paid_cents) AS paid FROM public.payment_milestone GROUP BY trip_id
      ) pm ON pm.trip_id = t.id
     WHERE t.total_paid_cents <> coalesce(pm.paid, 0);
    IF bad > 0 THEN
        RAISE EXCEPTION 'total_paid_cents disagrees with the milestones on % trip(s)', bad;
    END IF;
END $$;

DO $$
DECLARE leaked text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('trip_recompute_paid', 'payment_milestone_currency_guard')
       AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'anon can execute: %', leaked;
    END IF;
END $$;

COMMIT;
