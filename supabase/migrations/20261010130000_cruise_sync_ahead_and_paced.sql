-- The cruise sync reaches months ahead, and paces itself under the provider's per-minute
-- limit (Data-Model §24.7). P2.
--
-- ── WHAT THE FIRST REAL RUN SHOWED ──────────────────────────────────────────────────────
--
-- Production's first successful sync (2026-10-10, once the vault held a real key) stored 40
-- Royal Caribbean sailings, and every one of them departed between that day and a week
-- later. Two separate faults, neither visible until a run actually reached the provider:
--
--   1. THE WINDOW STARTED TODAY. Every sailing scope asked for departures "today forward",
--      sorted soonest-first, 10 rows a request. Four requests is about one week of Royal
--      Caribbean's Caribbean departures, and the cursor resumes from there next Monday,
--      by which time a week of sailings has left. So the catalogue never gets ahead of the
--      calendar: it holds this week and nothing else, forever. A visitor searching for
--      February found nothing, and nobody books a cruise for next Tuesday.
--
--   2. SEVEN OF EIGHT LINES GOT NOTHING. The RapidAPI relay throttles BASIC to roughly ten
--      requests a minute. The run spent 11 in 16 seconds on the scopes at the top of the
--      priority list and every scope after that came back 429. The client treats a 429
--      with no Retry-After as "come back later" (client.ts explains why retrying it is
--      worse), which would be right if a later run started somewhere else. It does not:
--      priority order is fixed, so the same scopes at the top spend the same minute every
--      Monday and the same seven never get a turn.
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────────────────────
--
--   * `departure_offset_days`: the window opens this many days out instead of today. With
--     the window starting 90 days ahead, each weekly pass collects about a week of
--     departures three months out, and those sailings stay in the catalogue as the
--     calendar moves towards them. After about thirteen weeks the catalogue covers today
--     to roughly three months ahead, and keeps rolling. The reach is the offset; reaching
--     further on the same budget means a bigger offset and a longer fill.
--
--   * Several ticks each Monday, three minutes apart, and a cap of 8 requests per run in
--     sync.ts. Each tick does what fits under the cap and leaves the rest due, so the next
--     tick picks up where it stopped, a fresh minute later. 8 per tick against ~10 a
--     minute is the headroom.
--
--   * Sailing scopes move to `min_interval_days = 6`, which is what makes several ticks
--     safe: a scope runs once a week, on whichever Monday tick reaches it first. At 0 it
--     would run on EVERY tick, which is four times the spend for the same rows.
--
--   * Sailing cursors are cleared. Each one was a position in the old today-forward
--     window; starting the new window clean is cheaper than reasoning about whether the
--     provider honours a bookmark from before the window moved.
--
--   * Sailing `last_run_at` is cleared too, and that one is load-bearing. The old error
--     path stamped it on EVERY failure, 429s included, so seven scopes that fetched nothing
--     on 2026-10-10 carry a stamp from that day. With a 6-day interval, the first Monday
--     after this deploys would read all eight as "ran within 6d", skip them, and report a
--     green run. Those stamps describe fetches that never happened, or happened in the old
--     window; neither should gate the new one.
--
-- WHAT THIS DOES NOT TOUCH: which scopes are enabled. That is a budget decision, made per
-- environment with an UPDATE, and this migration leaves it alone in both directions.

BEGIN;

ALTER TABLE public.cruise_sync_scope
    ADD COLUMN departure_offset_days integer NOT NULL DEFAULT 0,
    -- An offset at or past the far edge of the window asks for an empty range forever,
    -- spending a request a week to learn nothing.
    ADD CONSTRAINT cruise_sync_scope_offset_inside_window CHECK (
        departure_offset_days >= 0
        AND (departure_within_days IS NULL OR departure_offset_days < departure_within_days)
    );

COMMENT ON COLUMN public.cruise_sync_scope.departure_offset_days IS
    'Sailing scopes only: the departure window opens this many days from now rather than '
    'today, so the weekly pass collects sailings far enough out to be booked. The catalogue '
    'fills in towards today as the calendar moves. 0 means today-forward.';

-- Every sailing scope: once a week, and a clean start in the new window.
UPDATE public.cruise_sync_scope
   SET min_interval_days = 6,
       cursor            = NULL,
       cursor_set_at     = NULL,
       last_run_at       = NULL,
       last_status       = NULL,
       last_error        = NULL,
       updated_at        = now()
 WHERE endpoint = 'cruises';

-- The offset, only where the window is wide enough to hold it. A separate statement on
-- purpose: folded into the one above, the guard would also skip the interval change for a
-- hand-narrowed scope, and the assertion at the bottom would then abort the whole deploy,
-- which is how the first production migration run died. A narrow scope keeps today-forward.
UPDATE public.cruise_sync_scope
   SET departure_offset_days = 90
 WHERE endpoint = 'cruises'
   AND (departure_within_days IS NULL OR departure_within_days > 90);

-- Restated, because the original comment says sailing scopes "run every time", which this
-- migration makes false, and a comment that contradicts the rows is worse than none.
COMMENT ON COLUMN public.cruise_sync_scope.min_interval_days IS
    'Minimum days between runs of this scope. Reference scopes use 28 (monthly). Sailing '
    'scopes use 6: the Monday cron fires several ticks a few minutes apart, and 6 makes each '
    'sailing scope run once a week on whichever tick reaches it first. 0 would run it on '
    'every tick.';

-- Four ticks, three minutes apart. Same unschedule-then-schedule shape the original
-- schedule migration uses, so a replay converges on one job rather than two.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cruise-sync-weekly') THEN
        PERFORM cron.unschedule('cruise-sync-weekly');
    END IF;

    PERFORM cron.schedule(
        'cruise-sync-weekly',
        '17,20,23,26 9 * * 1',
        'SELECT public.cruise_sync_tick();'
    );
END $$;

-- Re-stated rather than inherited: the cruise_sync_watchdog migration's schedule check ran
-- once, at its own point in history, and asserts nothing about this file. The watchdog at
-- 09:30 reads the most recent dispatch inside its 25-minute window, which is now the 09:26
-- tick, and a tick with nothing left to do still opens and closes a run row, so it reads as
-- healthy rather than missing.
--
-- KNOWN EDGE, left as it is: the tick hands pg_net a 10-second timeout, and a tick that
-- spends 8 requests takes longer than that. pg_net records `timed_out` while the function
-- keeps running (the 2026-10-10 run took 16 seconds and finished). Only the LAST tick's reply
-- is read, and with today's scopes the work fits in the first three ticks, so the 09:26 one
-- is idle and quick. Enable enough scopes to push real work onto 09:26 and the watchdog will
-- report a timeout that did no harm; raise the tick's timeout then.
DO $$
DECLARE
    tick_sched     text;
    watchdog_sched text;
BEGIN
    SELECT schedule INTO tick_sched     FROM cron.job WHERE jobname = 'cruise-sync-weekly';
    SELECT schedule INTO watchdog_sched FROM cron.job WHERE jobname = 'cruise-sync-watchdog';

    IF tick_sched IS DISTINCT FROM '17,20,23,26 9 * * 1'
       OR watchdog_sched IS DISTINCT FROM '30 9 * * 1' THEN
        RAISE EXCEPTION
            'the ticks must all land before the 09:30 watchdog on the same Monday: tick=%, watchdog=%',
            coalesce(tick_sched, '<missing>'), coalesce(watchdog_sched, '<missing>');
    END IF;

    IF EXISTS (SELECT 1 FROM public.cruise_sync_scope
                WHERE endpoint = 'cruises' AND min_interval_days < 6) THEN
        RAISE EXCEPTION 'every sailing scope must run at most once a week, or each Monday tick re-spends it';
    END IF;
END $$;

COMMIT;
