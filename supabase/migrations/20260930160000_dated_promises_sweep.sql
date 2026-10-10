-- Two documented behaviours that nothing performed, and the one job that performs them.
--
-- Both are the same shape as the three "documented total with no producer" columns fixed
-- this week, one step abstracted: a DATE is stored, a doc says something happens when it
-- passes, and nothing ever looks. They share a job because they share a cause.
--
-- ── (1) THE OVERDUE SWEEP DATA-MODEL §9.5 NAMES BY NAME ─────────────────────────────────
--
-- §9.5, on payment_milestone: *"Indexes: index on `(trip_id, order_index)`; index on
-- `(status, due_date)` for the agent-side overdue sweep."* The index was built. The sweep
-- was never written.
--
-- So a milestone whose due date passes stays `scheduled` forever. Everything downstream
-- already accepts `overdue` — `agent_payments_due`, `agent_trip_payments` and
-- `agent_trip_overview` all filter `status IN ('scheduled','overdue')`, the client
-- dashboard renders a red row for it, and §3.4.15's table has a chip for it — but nothing
-- ever sets it. The one `overdue` row anywhere is hand-written in the seed. A state the
-- whole stack is built to display, that can only be reached by typing it.
--
-- ── (2) "AUTHORIZATIONS EXPIRE AUTOMATICALLY" ───────────────────────────────────────────
--
-- Data-Model §9.2 says exactly that. `card_authorization.expires_at` is `NOT NULL`, so
-- every row carries the date. Nothing anywhere writes `'expired'` or `'exhausted'` to
-- `card_authorization.status` — grep the repository — so an authorization past its expiry
-- reads `active` forever.
--
-- This one is on a payment surface, which is why it is here rather than deferred with the
-- rest of §3.6: `card_auth_active_per_trip` is a UNIQUE index partial on `status = 'active'`,
-- so a stale row that never expires BLOCKS a new authorization for the same card and trip.
-- The traveler is told to authorize again and cannot.
--
-- ── SUPPRESSION, DECIDED HERE ───────────────────────────────────────────────────────────
--
-- §9.5 is explicit that `overdue` is stored rather than derived *"because the agent needs
-- to be able to suppress it — a supplier who has verbally extended a deadline should not
-- produce a red row on the client's dashboard."*
--
-- A sweep that only promotes would re-flip a suppressed row the next morning, so
-- suppression needs a carrier. It does NOT need a new column: **suppression is expressed by
-- moving the due date**, which is what a verbally extended deadline actually is. The
-- advisor edits the milestone in §3.4.15, the date moves, and the sweep has nothing to
-- promote. A `waived` milestone is likewise never touched, because waived is a decision and
-- overdue is an observation. Asserted in constraints_commission.sql.
--
-- The sweep only ever PROMOTES scheduled -> overdue. It never demotes, because an advisor
-- who has already moved a date has said what they mean and a job should not argue.

BEGIN;

CREATE OR REPLACE FUNCTION public.sweep_dated_promises()
RETURNS TABLE (milestones_marked_overdue integer, authorizations_expired integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_milestones integer;
    v_auths      integer;
BEGIN
    -- `due_date < current_date`, not `<=`: a milestone due today is due today, not late.
    -- Only from `scheduled`, so `paid` and `waived` are untouchable and a date the advisor
    -- has already moved forward simply does not match.
    UPDATE public.payment_milestone
       SET status     = 'overdue',
           updated_at = now()
     WHERE status = 'scheduled'
       AND due_date IS NOT NULL
       AND due_date < current_date;
    GET DIAGNOSTICS v_milestones = ROW_COUNT;

    -- Only from `active`. `revoked` is a decision someone made and must not be overwritten
    -- with a weaker word; `exhausted` belongs to §3.6's card-use logging, which is unbuilt
    -- (card_use_event has no writer at all), and is deliberately not guessed at here.
    UPDATE public.card_authorization
       SET status     = 'expired',
           updated_at = now()
     WHERE status = 'active'
       AND expires_at < now();
    GET DIAGNOSTICS v_auths = ROW_COUNT;

    RETURN QUERY SELECT v_milestones, v_auths;
END $$;

-- Callable by nobody but the owner and cron. `authenticated` BY NAME: Supabase grants
-- EXECUTE on new public functions to anon, authenticated and service_role by name, so
-- `FROM public, anon` alone would leave every signed-in user able to re-date the whole
-- book's payment schedule.
REVOKE ALL ON FUNCTION public.sweep_dated_promises() FROM public, anon, authenticated;

COMMENT ON FUNCTION public.sweep_dated_promises() IS
    'Daily. Promotes payment_milestone scheduled -> overdue once due_date has passed, and '
    'card_authorization active -> expired once expires_at has. Both are behaviours the Data '
    'Model already promised (§9.5 names "the agent-side overdue sweep" as the reason an '
    'index exists; §9.2 says authorizations expire automatically) and neither had any '
    'mechanism. Promotes only: suppression is expressed by moving the date, so a job never '
    'argues with an advisor who has already edited one.';

-- 06:10 daily, local-to-the-database. Early enough that the advisor's first look at the
-- worklist is already correct, and odd-numbered so it does not pile onto the top of an hour
-- with everything else.
DO $$
BEGIN
    PERFORM cron.unschedule('dated-promises-sweep')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dated-promises-sweep');

    PERFORM cron.schedule(
        'dated-promises-sweep',
        '10 6 * * *',
        'SELECT public.sweep_dated_promises();'
    );
END $$;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
DECLARE leaked text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'sweep_dated_promises'
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'a client role can execute %, which re-dates payment schedules book-wide',
            leaked;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dated-promises-sweep') THEN
        RAISE EXCEPTION 'the dated-promises sweep was not scheduled';
    END IF;
END $$;

-- The index §9.5 built for this sweep is still there, and is the one the sweep uses. A
-- migration that dropped it would leave the job doing a sequential scan over every
-- milestone in the book every morning, silently.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'payment_milestone'
           AND indexdef LIKE '%status%' AND indexdef LIKE '%due_date%'
    ) THEN
        RAISE EXCEPTION
            'the (status, due_date) index on payment_milestone is gone. Data-Model §9.5 '
            'built it "for the agent-side overdue sweep", which now exists and needs it.';
    END IF;
END $$;

COMMIT;
