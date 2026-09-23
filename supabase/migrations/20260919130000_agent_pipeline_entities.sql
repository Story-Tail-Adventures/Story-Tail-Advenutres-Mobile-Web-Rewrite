-- The two entities §3.2.1's KPI strip needs. Data-Model §7.4 and §8.8, which this implements
-- and which landed first (CLAUDE.md: the doc leads the code).
--
-- Both exist because the prototype's five KPI tiles beat the Screen Inventory's four
-- (Gyasi, 2026-09-19), and two of the five had nothing behind them:
--
--   * "Inquiry → book · 11 days" is an elapsed time. `trip.status_changed_at` holds only the
--     LATEST transition, so no duration is derivable from `trip` at all. → trip_status_history
--   * "Commission expected · 71% confidence" needs a per-stage probability. → pipeline_weight
--
-- Neither table is readable by a client role. They are the agency's own operating data:
-- `trip_status_history` is the shape of the sales process and `pipeline_weight` is what the
-- agency thinks its own book is worth. Both go the way §2.4's payment tables went — RLS on,
-- no policy, no grant — and the agent reads them through the SECURITY DEFINER accessors in
-- the next migration rather than through a grant.
--
-- `auto_expose_new_tables` grants SELECT to anon and authenticated on CREATE, so the REVOKE
-- below is required, not decorative. 20260919120000_agent_domain_lockdown.sql exists because
-- twenty-three tables were created without one.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- TripStatusHistory — Data-Model §8.8
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.trip_status_history (
    id                 uuid PRIMARY KEY,
    trip_id            uuid NOT NULL REFERENCES public.trip(id) ON DELETE CASCADE,
    from_status        trip_status,
    to_status          trip_status NOT NULL,
    changed_at         timestamptz NOT NULL DEFAULT now(),
    changed_by_user_id uuid REFERENCES public.platform_user(id),
    -- A transition to the status it was already in is not a transition. Catching it here
    -- rather than in the Edge Function means a retry or a double-submit cannot inflate the
    -- timeline the cycle-time KPI is computed from.
    CHECK (from_status IS NULL OR from_status <> to_status)
);

-- A single trip's timeline, oldest first.
CREATE INDEX trip_status_history_trip ON public.trip_status_history (trip_id, changed_at);

-- The cross-book aggregates: 3.2.1's inquiry→book cycle time and 3.11's stage reporting.
CREATE INDEX trip_status_history_stage ON public.trip_status_history (to_status, changed_at);

COMMENT ON TABLE public.trip_status_history IS
    'Append-only record of every trip status transition (Data-Model §8.8). Exists because '
    'trip.status_changed_at holds only the latest transition, so nothing about elapsed time '
    'is derivable from trip alone. Never UPDATEd or DELETEd: a history somebody can edit '
    'answers a different question from the one it appears to answer. Correcting a wrong '
    'status is a new transition, not an amendment.';

COMMENT ON COLUMN public.trip_status_history.from_status IS
    'Null on the row recording the trip''s creation — there was no prior status.';

COMMENT ON COLUMN public.trip_status_history.changed_by_user_id IS
    'Null when a system path moved the trip. quote-request creates a trip in `inquiry` with '
    'no human actor, which is the case this nullability exists for.';

ALTER TABLE public.trip_status_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_status_history FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- PipelineWeight — Data-Model §7.4
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.pipeline_weight (
    agent_id   uuid NOT NULL REFERENCES public.agent(id) ON DELETE CASCADE,
    status     trip_status NOT NULL,
    weight_pct smallint NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (agent_id, status),
    CHECK (weight_pct BETWEEN 0 AND 100)
);

COMMENT ON TABLE public.pipeline_weight IS
    'Per-stage conversion probability the commission forecast multiplies by (Data-Model '
    '§7.4). A table rather than a jsonb column on agent, so the values get a CHECK and an '
    'enum-typed status and the forecast can join them in SQL — agent_availability.'
    'time_off_blocks is the cautionary example of jsonb config with no declared schema.';

COMMENT ON COLUMN public.pipeline_weight.weight_pct IS
    'Defaults set 2026-09-19: inquiry 20, proposal 50, booked 100, in_progress 100, '
    'completed 100, cancelled 0. Defaults, not constants — 3.12 Agent Settings edits them. '
    'Nobody has enough history in this platform to derive real conversion rates yet, which '
    'is the argument for making them editable rather than for guessing better numbers.';

ALTER TABLE public.pipeline_weight ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pipeline_weight FROM anon, authenticated;

-- Every agent carries a full set of six, so "which statuses count" is never an implicit rule
-- living in whichever query was written first. A forecast reads the open ones explicitly.
CREATE OR REPLACE FUNCTION public.seed_pipeline_weights()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.pipeline_weight (agent_id, status, weight_pct)
    VALUES (NEW.id, 'inquiry',     20),
           (NEW.id, 'proposal',    50),
           (NEW.id, 'booked',     100),
           (NEW.id, 'in_progress', 100),
           (NEW.id, 'completed',  100),
           (NEW.id, 'cancelled',    0)
    ON CONFLICT (agent_id, status) DO NOTHING;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.seed_pipeline_weights() IS
    'Gives every new agent the default weight set. Without it an agent with no rows gets a '
    'forecast of zero, which is a silent wrong answer rather than a visible missing one.';

REVOKE EXECUTE ON FUNCTION public.seed_pipeline_weights() FROM public, anon, authenticated;

CREATE TRIGGER agent_seed_pipeline_weights
    AFTER INSERT ON public.agent
    FOR EACH ROW EXECUTE FUNCTION public.seed_pipeline_weights();

-- Agents that already exist. There is one today; this is written to handle any number.
INSERT INTO public.pipeline_weight (agent_id, status, weight_pct)
SELECT a.id, w.status, w.weight_pct
  FROM public.agent a
 CROSS JOIN (VALUES ('inquiry'::trip_status,     20::smallint),
                    ('proposal'::trip_status,    50::smallint),
                    ('booked'::trip_status,     100::smallint),
                    ('in_progress'::trip_status, 100::smallint),
                    ('completed'::trip_status,  100::smallint),
                    ('cancelled'::trip_status,    0::smallint)) AS w(status, weight_pct)
ON CONFLICT (agent_id, status) DO NOTHING;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

-- The REVOKEs above, verified rather than assumed. Both tables were born with an
-- auto_expose grant and this is the migration that has to take it off.
DO $$
DECLARE
    leaked text;
BEGIN
    WITH granted AS (
        SELECT table_name FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
        UNION
        SELECT table_name FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
    )
    SELECT string_agg(DISTINCT table_name, ', ') INTO leaked
      FROM granted
     WHERE table_name IN ('trip_status_history', 'pipeline_weight');

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'New agent-domain tables still grant to a client role: %. auto_expose_new_tables '
            'grants on CREATE; the REVOKE is required, not decorative.', leaked;
    END IF;
END $$;

-- Every agent has a complete weight set. An agent missing one row silently drops that stage
-- out of the forecast, which reads as a smaller pipeline rather than as an error.
DO $$
DECLARE
    incomplete text;
BEGIN
    SELECT string_agg(a.id::text, ', ') INTO incomplete
      FROM public.agent a
      LEFT JOIN public.pipeline_weight pw ON pw.agent_id = a.id
     GROUP BY a.id
    HAVING count(pw.status) <> 6;

    IF incomplete IS NOT NULL THEN
        RAISE EXCEPTION 'Agents without a complete six-status weight set: %', incomplete;
    END IF;
END $$;

COMMIT;
