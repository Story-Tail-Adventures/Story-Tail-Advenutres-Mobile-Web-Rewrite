-- Make `trip.total_value_cents` and `trip.total_commission_cents` true.
--
-- ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────────────────
--
-- docs/Data-Model.md describes `total_value_cents` as "Sum of components — what the trip
-- costs them" and `total_commission_cents` as "Sum of component commissions". NOTHING
-- computed either. There was no trigger on `trip_component`, no function wrote them, and the
-- only writes anywhere were hand-set `seed.sql` rows — one of which carries a comment
-- ("Sums to total_value_cents 1284500") asserting an arithmetic the database never checked.
--
-- That was invisible while nothing could add a component. Screen 3.4.4 is the screen that
-- adds components, so this lands BEFORE it rather than after: without it, the first
-- component an advisor adds silently falsifies the Value and Comm columns on §3.4.1, the
-- cost card on §3.4.2, the pipeline board, and the one KPI on the worklist an advisor might
-- quote out loud.
--
-- It is the same defect `client.lifetime_value_cents` had, found the same way — by reading
-- what the document claimed and looking for the code that made it so. §3.3.1 answered its
-- version by DERIVING at read time. This one is answered with a trigger instead, because
-- five separate read surfaces already consume the cached columns and are correct today;
-- deriving would mean rewriting all five to pay for a subquery per row on the two screens
-- (the board and the worklist KPIs) where the cached column is currently free.
--
-- ── WHAT IT DELIBERATELY DOES NOT TOUCH ──────────────────────────────────────────────────
--
-- `total_paid_cents`. That is money that actually moved, tracked against supplier payments
-- and card use — not a function of the component list. A trip can be fully built and
-- entirely unpaid.
--
-- ── ONE TRIP, ONE CURRENCY ───────────────────────────────────────────────────────────────
--
-- Story-Tail operates in North America and quotes in USD (Gyasi, 2026-09-27), so a
-- mixed-currency trip is not a case this business has. The sum therefore does NOT branch on
-- currency — but it also does not pretend the column cannot differ: a component whose
-- currency is not its trip's is REFUSED, because summing it would need an FX rate that
-- exists nowhere in the schema, and silently excluding it would make the headline total omit
-- a cost the advisor entered.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- The guard: a component is priced in its trip's currency
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trip_component_currency_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip_currency char(3);
BEGIN
    SELECT t.currency INTO v_trip_currency FROM public.trip t WHERE t.id = NEW.trip_id;

    IF v_trip_currency IS NOT NULL AND NEW.currency <> v_trip_currency THEN
        RAISE EXCEPTION
            'trip_component.currency (%) must match its trip''s (%) — there is no FX rate in '
            'this schema, so a component in another currency could neither be summed into '
            'trip.total_value_cents nor left out of it honestly',
            NEW.currency, v_trip_currency;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trip_component_currency_matches_trip
    BEFORE INSERT OR UPDATE OF currency, trip_id ON public.trip_component
    FOR EACH ROW EXECUTE FUNCTION public.trip_component_currency_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- The recompute
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trip_recompute_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    -- On DELETE the row is in OLD; on INSERT it is in NEW. An UPDATE that MOVED a component
    -- between trips has to touch both, which is why this is a set rather than a scalar —
    -- the naive version recomputes the destination and leaves the source overstated forever.
    v_trips uuid[] := ARRAY[]::uuid[];
    v_trip  uuid;
BEGIN
    IF TG_OP <> 'INSERT' THEN v_trips := v_trips || OLD.trip_id; END IF;
    IF TG_OP <> 'DELETE' THEN v_trips := v_trips || NEW.trip_id; END IF;

    FOREACH v_trip IN ARRAY (SELECT array_agg(DISTINCT u) FROM unnest(v_trips) u)
    LOOP
        UPDATE public.trip t
           SET total_value_cents = COALESCE((
                   SELECT sum(c.cost_cents) FROM public.trip_component c
                    WHERE c.trip_id = t.id AND c.archived_at IS NULL), 0),
               total_commission_cents = COALESCE((
                   SELECT sum(c.commission_cents) FROM public.trip_component c
                    WHERE c.trip_id = t.id AND c.archived_at IS NULL), 0),
               updated_at = now()
         WHERE t.id = v_trip
           -- ONLY WHEN SOMETHING ACTUALLY MOVED. Without this the trigger writes `trip` on
           -- every component touch, bumping `updated_at` and waking anything watching it —
           -- and an archived-then-unarchived component would report a change that nets to
           -- nothing.
           AND (t.total_value_cents, t.total_commission_cents) IS DISTINCT FROM (
                   COALESCE((SELECT sum(c.cost_cents) FROM public.trip_component c
                              WHERE c.trip_id = t.id AND c.archived_at IS NULL), 0),
                   COALESCE((SELECT sum(c.commission_cents) FROM public.trip_component c
                              WHERE c.trip_id = t.id AND c.archived_at IS NULL), 0));
    END LOOP;

    RETURN NULL;  -- AFTER trigger; the return value is ignored.
END;
$$;

-- AFTER, and STATEMENT-level would be wrong here: the recompute needs to know WHICH trips
-- were touched, and a statement trigger has no OLD/NEW row to read them from.
--
-- `archived_at` is in the UPDATE column list because archiving a component is how §3.4.12
-- removes one (Data-Model §20.1 soft-delete), and a removal that left the total standing
-- would be the same bug in the other direction.
CREATE TRIGGER trip_component_totals
    AFTER INSERT OR DELETE OR UPDATE OF cost_cents, commission_cents, archived_at, trip_id
    ON public.trip_component
    FOR EACH ROW EXECUTE FUNCTION public.trip_recompute_totals();

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill, and the assertion that the seed was telling the truth
-- ─────────────────────────────────────────────────────────────────────────────

-- EVERY TRIP WITH COMPONENTS is recomputed from them. A trip with NO components keeps the
-- value it has: the seed carries trips whose totals were set by hand and whose components
-- were never written, and zeroing those would delete real figures the rest of the fixtures
-- (payment milestones, commission rows, the worklist KPI) are balanced against.
UPDATE public.trip t
   SET total_value_cents = sums.value_cents,
       total_commission_cents = sums.commission_cents
  FROM (
      SELECT c.trip_id,
             sum(c.cost_cents)       AS value_cents,
             sum(c.commission_cents) AS commission_cents
        FROM public.trip_component c
       WHERE c.archived_at IS NULL
       GROUP BY c.trip_id
  ) sums
 WHERE t.id = sums.trip_id
   AND (t.total_value_cents, t.total_commission_cents)
       IS DISTINCT FROM (sums.value_cents, sums.commission_cents);

DO $$
DECLARE bad text;
BEGIN
    -- The guard is retroactive: if a seeded component already disagrees with its trip's
    -- currency, every sum above is meaningless and the trigger would have refused the row.
    SELECT string_agg(DISTINCT c.id::text, ', ') INTO bad
      FROM public.trip_component c
      JOIN public.trip t ON t.id = c.trip_id
     WHERE c.currency <> t.currency;
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'component currency disagrees with its trip: %', bad;
    END IF;

    -- And the totals now match their components everywhere a component exists.
    SELECT string_agg(t.id::text, ', ') INTO bad
      FROM public.trip t
      JOIN (SELECT trip_id, sum(cost_cents) v, sum(commission_cents) k
              FROM public.trip_component WHERE archived_at IS NULL GROUP BY trip_id) s
        ON s.trip_id = t.id
     WHERE (t.total_value_cents, t.total_commission_cents) IS DISTINCT FROM (s.v, s.k);
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'trip totals still disagree with their components after backfill: %', bad;
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────
--
-- POSTGRES GRANTS EXECUTE ON A NEW FUNCTION TO `PUBLIC` BY DEFAULT, and a trigger function
-- is still a function: without this, `anon` could execute both of these by name.
--
-- Calling one directly would fail — a trigger function has no `TG_OP` outside a trigger —
-- so this is not a live hole so much as executable surface with no reason to exist.
-- `rls_agent_domain.sql` asserts the absolute rule rather than the interesting one
-- ("anon can execute no function in public that an extension did not install"), which is
-- why it caught these the moment they were added, and why that is the right shape for it.
REVOKE EXECUTE ON FUNCTION public.trip_recompute_totals() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trip_component_currency_guard() FROM public, anon, authenticated;

COMMIT;
