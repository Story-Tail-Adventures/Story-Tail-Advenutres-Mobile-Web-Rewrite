-- §3.12 Agent Settings, PR 2: Notifications (3.12.3), Signature (3.12.4), and what they drive.
-- Rulings: docs/Screen-Inventory.md §3.12 (2026-10-17). Data-Model §7.5, §12.2, §12.5, §12.7,
-- §12.11, §12.12.
--
-- ── WHAT THIS ADDS ─────────────────────────────────────────────────────────────────────
--
--   1. The advisor's alert switches: agent_alert_on(), read from notification_preference with
--      the §3.12.3 defaults (a missing key is the DEFAULT, not "on").
--   2. Rest hours follow working hours (Q6) and time away (Q14): agent_rest_until() replaces
--      the fixed 9pm-7am-and-Sunday rule FOR ADVISORS. push_due_at() stays as it is for
--      clients' emails. Held notifications are re-timed when the hours or time away change.
--   3. push_outbox learns a second kind, `quote_request`, and why a row was held (rest/away).
--      The client-message push respects the push switch.
--   4. agent_alert_email (§12.11): the advisor's alert emails, sent by email-dispatch. Never a
--      client's words.
--   5. alert_quote_request(): what quote-request calls after it creates an inquiry trip. Not a
--      trigger on trip: the advisor's own "New trip" makes an inquiry too, and must not alert.
--   6. The out-of-office auto-reply (§12.12): once per thread per block, as the advisor,
--      tagged message.is_auto_reply, never marking the thread read, never counting as an answer.
--   7. Settings writes for the two new tabs and the auto-reply fields, each audited in its own
--      transaction, and the snapshot reads them.
--   8. agent_signature_for_conversation(), which email-dispatch prints under the advisor's words.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Alert switches
-- ─────────────────────────────────────────────────────────────────────────────

-- The advisor's own platform_user (their login), or NULL.
CREATE OR REPLACE FUNCTION public.agent_platform_user(p_agent_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT pu.id FROM public.platform_user pu
     WHERE pu.agent_id = p_agent_id AND pu.role = 'agent'
     ORDER BY pu.created_at
     LIMIT 1;
$$;

-- §3.12.3 defaults: client messages push on / email off; quote requests push on / email on.
CREATE OR REPLACE FUNCTION public.agent_alert_default(p_category text, p_channel text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_category = 'client_messages' AND p_channel = 'push'  THEN true
        WHEN p_category = 'client_messages' AND p_channel = 'email' THEN false
        WHEN p_category = 'quote_requests'  AND p_channel = 'push'  THEN true
        WHEN p_category = 'quote_requests'  AND p_channel = 'email' THEN true
        ELSE false END;
$$;

-- Whether this advisor wants this alert on this channel. Only an explicit boolean overrides
-- the default; anything else in the blob is ignored.
CREATE OR REPLACE FUNCTION public.agent_alert_on(p_agent_id uuid, p_category text, p_channel text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(
        (SELECT CASE WHEN jsonb_typeof(np.channels -> p_category -> p_channel) = 'boolean'
                     THEN (np.channels -> p_category ->> p_channel)::boolean END
           FROM public.notification_preference np
          WHERE np.user_id = public.agent_platform_user(p_agent_id)),
        public.agent_alert_default(p_category, p_channel));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rest hours = outside working hours, or a day of time away
-- ─────────────────────────────────────────────────────────────────────────────

-- When something at [p_at] may notify this advisor, and why it waited:
--   (p_at, NULL)          they are working now
--   (start, 'rest')       the start of their next working period
--   (start, 'away')       the same, when a day of time away was skipped to get there
-- An advisor with no working day at all has no rest hours to honour: (p_at, NULL), rather than
-- a notification that can never go. A bad zone falls back to UTC rather than raising in a trigger.
CREATE OR REPLACE FUNCTION public.agent_rest_until(p_agent_id uuid, p_at timestamptz)
RETURNS TABLE (due_at timestamptz, reason text)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_zone   text;
    v_sched  jsonb;
    v_local  timestamp;
    v_day    date;
    v_hours  jsonb;
    v_start  timestamp;
    v_end    timestamp;
    v_away   boolean := false;
    v_keys   text[] := ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
BEGIN
    SELECT a.time_zone, av.weekly_schedule INTO v_zone, v_sched
      FROM public.agent a
      LEFT JOIN public.agent_availability av ON av.agent_id = a.id
     WHERE a.id = p_agent_id;
    -- A cheap validity test (pg_timezone_names is a slow view, and this runs on every client
    -- message): a zone Postgres cannot use raises, and becomes UTC.
    BEGIN
        PERFORM now() AT TIME ZONE coalesce(v_zone, 'UTC');
    EXCEPTION WHEN OTHERS THEN
        v_zone := 'UTC';
    END;
    v_zone := coalesce(v_zone, 'UTC');
    v_sched := coalesce(v_sched, public.agent_default_weekly_schedule());

    IF NOT EXISTS (SELECT 1 FROM jsonb_each(v_sched) d WHERE jsonb_typeof(d.value) = 'object') THEN
        RETURN QUERY SELECT p_at, NULL::text;
        RETURN;
    END IF;

    v_local := p_at AT TIME ZONE v_zone;

    -- A year and a little: time away can be a year long (§7.5), and a week past it always holds
    -- a working day, since at least one weekday works.
    FOR i IN 0..380 LOOP
        v_day := v_local::date + i;
        IF EXISTS (SELECT 1 FROM public.agent_time_off t
                    WHERE t.agent_id = p_agent_id AND v_day BETWEEN t.starts_on AND t.ends_on) THEN
            v_away := true;
            CONTINUE;
        END IF;
        v_hours := v_sched -> v_keys[extract(isodow FROM v_day)::int];
        IF jsonb_typeof(v_hours) <> 'object' THEN
            CONTINUE;
        END IF;
        v_start := v_day + (v_hours ->> 'start')::time;
        v_end   := v_day + (v_hours ->> 'end')::time;   -- '24:00' is the next midnight
        IF i = 0 AND v_local >= v_start AND v_local < v_end THEN
            RETURN QUERY SELECT p_at, NULL::text;
            RETURN;
        END IF;
        IF v_local < v_start THEN
            RETURN QUERY SELECT (v_start AT TIME ZONE v_zone),
                                CASE WHEN v_away THEN 'away' ELSE 'rest' END;
            RETURN;
        END IF;
    END LOOP;
    RETURN QUERY SELECT p_at, NULL::text;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. push_outbox: a second kind, and why a row waited
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.push_outbox
    ADD COLUMN kind text NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'quote_request')),
    ADD COLUMN trip_id uuid REFERENCES public.trip(id) ON DELETE CASCADE,
    ADD COLUMN hold_reason text CHECK (hold_reason IN ('rest', 'away')),
    ALTER COLUMN conversation_id DROP NOT NULL,
    ALTER COLUMN latest_message_id DROP NOT NULL;

ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_kind_target CHECK (
    (kind = 'message' AND conversation_id IS NOT NULL AND latest_message_id IS NOT NULL AND trip_id IS NULL)
    OR (kind = 'quote_request' AND trip_id IS NOT NULL AND conversation_id IS NULL AND latest_message_id IS NULL)
);

-- Rows already held under the old rule were held for rest.
UPDATE public.push_outbox SET hold_reason = 'rest' WHERE held AND hold_reason IS NULL;

-- Re-time what is waiting for this advisor after their hours or time away change: a held row
-- goes at the start of their (new) next working period, or now if they are working now.
-- It stays a summary row either way (it was held when it arrived).
CREATE OR REPLACE FUNCTION public.agent_push_reschedule(p_agent_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_due    timestamptz;
    v_reason text;
BEGIN
    SELECT r.due_at, r.reason INTO v_due, v_reason FROM public.agent_rest_until(p_agent_id, now()) r;
    UPDATE public.push_outbox o
       SET due_at = v_due,
           hold_reason = coalesce(v_reason, o.hold_reason)
     WHERE o.agent_id = p_agent_id AND o.state = 'pending' AND o.held
       AND o.due_at IS DISTINCT FROM v_due;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_push_reschedule_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public.agent_push_reschedule(CASE WHEN TG_OP = 'DELETE' THEN OLD.agent_id ELSE NEW.agent_id END);
    RETURN NULL;
END;
$$;

CREATE TRIGGER agent_availability_push_reschedule
    AFTER UPDATE OF weekly_schedule ON public.agent_availability
    FOR EACH ROW EXECUTE FUNCTION public.agent_push_reschedule_trigger();
CREATE TRIGGER agent_time_off_push_reschedule
    AFTER INSERT OR UPDATE OR DELETE ON public.agent_time_off
    FOR EACH ROW EXECUTE FUNCTION public.agent_push_reschedule_trigger();

CREATE OR REPLACE FUNCTION public.agent_zone_push_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public.agent_push_reschedule(NEW.id);
    RETURN NULL;
END;
$$;
CREATE TRIGGER agent_time_zone_push_reschedule
    AFTER UPDATE OF time_zone ON public.agent
    FOR EACH ROW WHEN (NEW.time_zone IS DISTINCT FROM OLD.time_zone)
    EXECUTE FUNCTION public.agent_zone_push_reschedule();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. agent_alert_email
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.agent_alert_email (
    id              uuid PRIMARY KEY DEFAULT public.uuid_v7(),
    agent_id        uuid NOT NULL REFERENCES public.agent(id),
    kind            text NOT NULL CHECK (kind IN ('client_message', 'quote_request')),
    conversation_id uuid REFERENCES public.conversation(id) ON DELETE CASCADE,
    trip_id         uuid REFERENCES public.trip(id) ON DELETE CASCADE,
    state           text NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending', 'sending', 'sent', 'cleared', 'failed')),
    attempts        integer NOT NULL DEFAULT 0,
    claimed_at      timestamptz,
    sent_at         timestamptz,
    last_error      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT agent_alert_email_target CHECK (
        (kind = 'client_message' AND conversation_id IS NOT NULL AND trip_id IS NULL)
        OR (kind = 'quote_request' AND trip_id IS NOT NULL AND conversation_id IS NULL)
    )
);
CREATE UNIQUE INDEX agent_alert_email_one_pending ON public.agent_alert_email (conversation_id)
    WHERE state = 'pending' AND conversation_id IS NOT NULL;
CREATE INDEX agent_alert_email_due ON public.agent_alert_email (created_at) WHERE state = 'pending';

ALTER TABLE public.agent_alert_email ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_alert_email FROM public, anon, authenticated;
GRANT ALL ON public.agent_alert_email TO service_role;

COMMENT ON TABLE public.agent_alert_email IS
    'Data-Model §12.11: the advisor''s alert emails (client message, quote request). Never a '
    'client''s words. Service role only; sent by email-dispatch.';

-- Claim what is waiting (SKIP LOCKED). A thread read since it was queued is cleared, not sent.
-- A run that died mid-send leaves rows 'sending'; after 15 minutes each counts as a failed try.
CREATE OR REPLACE FUNCTION public.agent_alert_email_claim(p_limit integer DEFAULT 25)
RETURNS TABLE (
    alert_id         uuid,
    kind             text,
    recipient        text,
    agent_first_name text,
    client_name      text,
    trip_title       text,
    conversation_id  uuid,
    trip_id          uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- At most ONE stale row per thread goes back to pending, and none where one already waits:
    -- two going back at once would break the one-pending-per-thread index and jam every claim.
    UPDATE public.agent_alert_email o
       SET state = CASE WHEN o.attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END,
           attempts = o.attempts + 1
     WHERE o.id IN (
            SELECT DISTINCT ON (coalesce(x.conversation_id, x.id)) x.id
              FROM public.agent_alert_email x
             WHERE x.state = 'sending' AND x.claimed_at < now() - interval '15 minutes'
               AND NOT (x.conversation_id IS NOT NULL AND EXISTS (
                       SELECT 1 FROM public.agent_alert_email p
                        WHERE p.conversation_id = x.conversation_id AND p.state = 'pending'))
             ORDER BY coalesce(x.conversation_id, x.id), x.created_at DESC);
    UPDATE public.agent_alert_email o SET state = 'cleared'
     WHERE o.state = 'sending' AND o.claimed_at < now() - interval '15 minutes';

    UPDATE public.agent_alert_email o SET state = 'cleared'
      FROM public.conversation cv
     WHERE o.state = 'pending' AND o.conversation_id = cv.id AND cv.agent_unread_count = 0;
    -- An archived advisor is told nothing.
    UPDATE public.agent_alert_email o SET state = 'cleared'
      FROM public.agent a
     WHERE o.state = 'pending' AND a.id = o.agent_id AND a.status = 'archived';

    RETURN QUERY
    WITH claimed AS (
        UPDATE public.agent_alert_email o
           SET state = 'sending', claimed_at = now()
         WHERE o.id IN (
            SELECT x.id FROM public.agent_alert_email x
             WHERE x.state = 'pending'
             ORDER BY x.created_at
             LIMIT greatest(1, least(coalesce(p_limit, 25), 100))
             FOR UPDATE SKIP LOCKED
         )
        RETURNING o.*
    )
    SELECT c.id, c.kind, ag.email::text,
           split_part(btrim(ag.display_name), ' ', 1),
           coalesce(cl.preferred_name, cl.first_name) || ' ' || cl.last_name,
           t.title,
           c.conversation_id,
           c.trip_id
      FROM claimed c
      JOIN public.agent ag ON ag.id = c.agent_id
      LEFT JOIN public.conversation cv ON cv.id = c.conversation_id
      LEFT JOIN public.trip t ON t.id = coalesce(c.trip_id, cv.trip_id)
      LEFT JOIN public.client cl ON cl.id = coalesce(cv.client_id, t.client_id);
END;
$$;

-- sent, or back for a retry, or failed (a 5xx, or the third try). The error is the SMTP code
-- and words only, cut to 200 characters by the caller.
CREATE OR REPLACE FUNCTION public.agent_alert_email_finish(
    p_alert_id  uuid,
    p_ok        boolean,
    p_permanent boolean DEFAULT false,
    p_error     text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_state text;
BEGIN
    UPDATE public.agent_alert_email o
       SET state = CASE WHEN p_ok THEN 'sent'
                        WHEN p_permanent OR o.attempts + 1 >= 3 THEN 'failed'
                        ELSE 'pending' END,
           attempts = o.attempts + CASE WHEN p_ok THEN 0 ELSE 1 END,
           sent_at = CASE WHEN p_ok THEN now() ELSE o.sent_at END,
           last_error = CASE WHEN p_ok THEN NULL ELSE left(p_error, 200) END
     WHERE o.id = p_alert_id AND o.state = 'sending'
    RETURNING o.state INTO v_state;
    RETURN v_state;
END;
$$;

-- A claimed row the run had no time for goes back to waiting, with no try counted.
CREATE OR REPLACE FUNCTION public.agent_alert_email_release(p_alert_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    UPDATE public.agent_alert_email o SET state = 'pending', claimed_at = NULL
     WHERE o.id = p_alert_id AND o.state = 'sending'
       AND NOT (o.conversation_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM public.agent_alert_email p
                WHERE p.conversation_id = o.conversation_id AND p.state = 'pending'))
    RETURNING o.state;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Client message: push (respecting the switch and the hours) and the alert email
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.push_outbox_on_unread_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_latest uuid;
    v_due    timestamptz;
    v_reason text;
BEGIN
    IF NEW.agent_unread_count > OLD.agent_unread_count THEN
        -- An archived advisor is told nothing, as `current_agent_id()` lets them read nothing.
        IF EXISTS (SELECT 1 FROM public.agent a WHERE a.id = NEW.agent_id AND a.status = 'archived') THEN
            RETURN NEW;
        END IF;

        -- (The alert email and the auto-reply hang off a NEW client message instead, section 7:
        -- a client merge raises this count by moving old messages, and must not fire them.)

        -- Push: only with the switch on AND a device to tell, so the table does not fill for
        -- advisors who never turned notifications on.
        IF NOT public.agent_alert_on(NEW.agent_id, 'client_messages', 'push')
           OR NOT EXISTS (
               SELECT 1 FROM public.push_device d
                 JOIN public.platform_user pu ON pu.id = d.platform_user_id
                WHERE pu.agent_id = NEW.agent_id AND pu.role = 'agent') THEN
            RETURN NEW;
        END IF;

        SELECT m.id INTO v_latest
          FROM public.message m
         WHERE m.conversation_id = NEW.id AND m.sender_role = 'client'
           AND NOT m.is_internal_note AND m.archived_at IS NULL
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT 1;
        IF v_latest IS NULL THEN
            RETURN NEW;
        END IF;

        -- §3.12.2 (Q6, Q14): working hours are rest hours, and time away is rest too.
        SELECT r.due_at, r.reason INTO v_due, v_reason FROM public.agent_rest_until(NEW.agent_id, now()) r;

        INSERT INTO public.push_outbox
            (agent_id, kind, conversation_id, latest_message_id, message_count, due_at, held, hold_reason)
        VALUES (NEW.agent_id, 'message', NEW.id, v_latest, NEW.agent_unread_count - OLD.agent_unread_count,
                v_due, v_due > now(), CASE WHEN v_due > now() THEN v_reason END)
        ON CONFLICT (conversation_id) WHERE state = 'pending'
        DO UPDATE SET latest_message_id = EXCLUDED.latest_message_id,
                      message_count     = push_outbox.message_count + EXCLUDED.message_count;

    ELSIF NEW.agent_unread_count = 0 AND OLD.agent_unread_count > 0 THEN
        -- Read (or replied to, or archived) before it went: nothing to send.
        UPDATE public.push_outbox SET state = 'cleared'
         WHERE conversation_id = NEW.id AND state = 'pending';
        UPDATE public.agent_alert_email SET state = 'cleared'
         WHERE conversation_id = NEW.id AND state = 'pending';
        -- Read after it went, or while it was going: the devices show (or will show) it.
        UPDATE public.push_outbox SET needs_dismiss = true
         WHERE conversation_id = NEW.id AND NOT needs_dismiss
           AND (state = 'sending' OR (state = 'sent' AND sent_at > now() - interval '7 days'));
    END IF;
    RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Quote requests
-- ─────────────────────────────────────────────────────────────────────────────

-- Called by `quote-request` after it creates the inquiry trip (service role). Queues the push
-- (switch on, a device to tell, held through rest hours) and the alert email (switch on).
-- Returns what it queued, for the function's log.
CREATE OR REPLACE FUNCTION public.alert_quote_request(p_trip_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_agent  uuid;
    v_due    timestamptz;
    v_reason text;
    v_out    text := '';
BEGIN
    SELECT t.agent_id INTO v_agent
      FROM public.trip t JOIN public.agent a ON a.id = t.agent_id
     WHERE t.id = p_trip_id AND t.status = 'inquiry' AND a.status <> 'archived';
    IF v_agent IS NULL THEN
        RETURN 'none';
    END IF;

    IF public.agent_alert_on(v_agent, 'quote_requests', 'email') THEN
        INSERT INTO public.agent_alert_email (agent_id, kind, trip_id)
        VALUES (v_agent, 'quote_request', p_trip_id);
        v_out := v_out || 'email ';
    END IF;

    IF public.agent_alert_on(v_agent, 'quote_requests', 'push')
       AND EXISTS (SELECT 1 FROM public.push_device d
                     JOIN public.platform_user pu ON pu.id = d.platform_user_id
                    WHERE pu.agent_id = v_agent AND pu.role = 'agent') THEN
        SELECT r.due_at, r.reason INTO v_due, v_reason FROM public.agent_rest_until(v_agent, now()) r;
        INSERT INTO public.push_outbox (agent_id, kind, trip_id, message_count, due_at, held, hold_reason)
        VALUES (v_agent, 'quote_request', p_trip_id, 1, v_due, v_due > now(),
                CASE WHEN v_due > now() THEN v_reason END);
        v_out := v_out || 'push';
    END IF;
    RETURN coalesce(nullif(btrim(v_out), ''), 'none');
END;
$$;

-- push_claim_due gains the kind, the trip and why a row waited. Its result changes, so it is
-- dropped and made again (CREATE OR REPLACE cannot change a RETURNS TABLE).
DROP FUNCTION public.push_claim_due(integer);

CREATE FUNCTION public.push_claim_due(p_limit integer DEFAULT 50)
RETURNS TABLE (
    outbox_id         uuid,
    agent_id          uuid,
    kind              text,
    conversation_id   uuid,
    trip_id           uuid,
    held              boolean,
    hold_reason       text,
    message_count     integer,
    client_name       text,
    trip_title        text,
    preview           text,
    latest_created_at timestamptz,
    destination       text,
    start_date        date,
    end_date          date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.push_outbox o SET state = 'cleared'
     WHERE o.state = 'sending' AND o.claimed_at < now() - interval '5 minutes'
       AND o.conversation_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.push_outbox p
                    WHERE p.conversation_id = o.conversation_id AND p.state = 'pending');
    -- One stale row per thread back to pending (two would break push_outbox_one_pending); the
    -- rest are cleared. Quote requests have no thread and each stands alone.
    UPDATE public.push_outbox o
       SET state = CASE WHEN o.attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END,
           attempts = o.attempts + 1, needs_dismiss = false
     WHERE o.id IN (
            SELECT DISTINCT ON (coalesce(x.conversation_id, x.id)) x.id
              FROM public.push_outbox x
             WHERE x.state = 'sending' AND x.claimed_at < now() - interval '5 minutes'
             ORDER BY coalesce(x.conversation_id, x.id), x.created_at DESC);
    UPDATE public.push_outbox o SET state = 'cleared'
     WHERE o.state = 'sending' AND o.claimed_at < now() - interval '5 minutes';

    UPDATE public.push_outbox o SET state = 'cleared'
      FROM public.conversation cv
     WHERE o.conversation_id = cv.id AND o.state = 'pending' AND cv.agent_unread_count = 0;

    RETURN QUERY
    WITH claimed AS (
        UPDATE public.push_outbox o
           SET state = 'sending', claimed_at = now()
         WHERE o.id IN (
            SELECT x.id FROM public.push_outbox x
             WHERE x.state = 'pending' AND x.due_at <= now()
             ORDER BY x.due_at
             LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
             FOR UPDATE SKIP LOCKED
         )
        RETURNING o.*
    )
    SELECT c.id, c.agent_id, c.kind, c.conversation_id, c.trip_id, c.held, c.hold_reason,
           c.message_count,
           coalesce(cl.preferred_name, cl.first_name) || ' ' || cl.last_name,
           t.title,
           CASE WHEN c.kind = 'message' THEN public.message_preview(m.body) END,
           coalesce(m.created_at, c.created_at),
           CASE WHEN c.kind = 'quote_request' THEN nullif(array_to_string(t.destinations, ', '), '') END,
           CASE WHEN c.kind = 'quote_request' THEN t.start_date END,
           CASE WHEN c.kind = 'quote_request' THEN t.end_date END
      FROM claimed c
      LEFT JOIN public.conversation cv ON cv.id = c.conversation_id
      LEFT JOIN public.trip t ON t.id = coalesce(c.trip_id, cv.trip_id)
      LEFT JOIN public.client cl ON cl.id = coalesce(cv.client_id, t.client_id)
      LEFT JOIN public.message m ON m.id = c.latest_message_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. The out-of-office auto-reply
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.message ADD COLUMN is_auto_reply boolean NOT NULL DEFAULT false;
-- The client sees the tag ("Automatic reply"): it is part of what they read.
GRANT SELECT (is_auto_reply) ON public.message TO authenticated;

CREATE TABLE public.agent_auto_reply (
    time_off_id     uuid NOT NULL REFERENCES public.agent_time_off(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES public.conversation(id) ON DELETE CASCADE,
    -- DEFERRED: the trigger claims the (block, thread) pair FIRST, so two messages at once
    -- send one reply, and only then writes the message this points at.
    message_id      uuid NOT NULL REFERENCES public.message(id) ON DELETE CASCADE
                    DEFERRABLE INITIALLY DEFERRED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (time_off_id, conversation_id)
);
ALTER TABLE public.agent_auto_reply ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_auto_reply FROM public, anon, authenticated;
GRANT ALL ON public.agent_auto_reply TO service_role;
COMMENT ON TABLE public.agent_auto_reply IS
    'Data-Model §12.12: which threads a block of time away has already answered (once each).';

-- "Monday, July 8": the day after the block ends.
CREATE OR REPLACE FUNCTION public.agent_return_date_label(p_ends_on date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT trim(to_char(p_ends_on + 1, 'FMDay')) || ', ' || trim(to_char(p_ends_on + 1, 'FMMonth FMDD'));
$$;

-- A NEW client message (not a moved one: a client merge re-points old messages with UPDATE,
-- and must alert no one and answer no one). Does two things for its advisor:
--   * the client-message alert email, if that switch is on (one per thread while it waits; a
--     second message adds nothing to an email that carries no words);
--   * the out-of-office auto-reply, once per thread per block.
-- The app path records the message here, then raises the unread count; the inbound-email path
-- does both in one function. Either way this runs first.
CREATE OR REPLACE FUNCTION public.agent_on_client_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_conv   public.conversation;
    v_block  public.agent_time_off;
    v_sender uuid;
    v_body   text;
    v_id     uuid := public.uuid_v7();
    v_now    timestamptz;
BEGIN
    SELECT cv.* INTO v_conv FROM public.conversation cv WHERE cv.id = NEW.conversation_id;
    IF NOT FOUND OR v_conv.archived_at IS NOT NULL
       OR NOT EXISTS (SELECT 1 FROM public.agent a WHERE a.id = v_conv.agent_id AND a.status <> 'archived') THEN
        RETURN NULL;
    END IF;

    IF public.agent_alert_on(v_conv.agent_id, 'client_messages', 'email') THEN
        INSERT INTO public.agent_alert_email (agent_id, kind, conversation_id)
        VALUES (v_conv.agent_id, 'client_message', v_conv.id)
        ON CONFLICT (conversation_id) WHERE state = 'pending' AND conversation_id IS NOT NULL
        DO NOTHING;
    END IF;

    SELECT t.* INTO v_block
      FROM public.agent_time_off t
     WHERE t.agent_id = v_conv.agent_id
       AND t.auto_reply_enabled AND t.auto_reply_text IS NOT NULL
       AND public.agent_local_today(v_conv.agent_id) BETWEEN t.starts_on AND t.ends_on
     LIMIT 1;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_sender := public.agent_platform_user(v_conv.agent_id);
    IF v_sender IS NULL THEN
        RETURN NULL;
    END IF;

    -- Once per thread per block: the PK decides, so two messages at once send one reply.
    INSERT INTO public.agent_auto_reply (time_off_id, conversation_id, message_id)
    VALUES (v_block.id, v_conv.id, v_id)
    ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Spaces inside the braces are allowed when it is saved ({{ return_date }}), so here too.
    v_body := regexp_replace(v_block.auto_reply_text, '\{\{\s*return_date\s*\}\}',
                             public.agent_return_date_label(v_block.ends_on), 'g');
    -- After the client's message, whatever its timestamp: never above it in the thread.
    v_now := greatest(clock_timestamp(), NEW.created_at + interval '1 millisecond');

    INSERT INTO public.message
        (id, conversation_id, sender_user_id, sender_role, body, is_internal_note, is_auto_reply, created_at)
    VALUES (v_id, v_conv.id, v_sender, 'agent', v_body, false, true, v_now);

    -- What a client-visible advisor message moves, EXCEPT agent_unread_count: an automatic
    -- reply never marks the thread read. client_unread_count rising queues the usual email.
    UPDATE public.conversation cv
       SET last_message_at      = greatest(v_now, cv.last_message_at),
           last_message_preview = public.message_preview(v_body),
           client_unread_count  = cv.client_unread_count + 1,
           updated_at           = v_now
     WHERE cv.id = v_conv.id;
    RETURN NULL;
END;
$$;

-- Only client messages a client can see; the auto-reply itself is an agent row and never fires it.
CREATE TRIGGER message_client_alerts
    AFTER INSERT ON public.message
    FOR EACH ROW
    WHEN (NEW.sender_role = 'client' AND NOT NEW.is_internal_note AND NEW.archived_at IS NULL)
    EXECUTE FUNCTION public.agent_on_client_message();

-- The reply-owed clock ignores automatic replies: a thread answered only by one is still owed
-- a real answer. Otherwise as 20261015120000 defined it.
CREATE OR REPLACE FUNCTION public.agent_threads_for_current_agent()
RETURNS TABLE (
    conversation_id      uuid,
    client_id            uuid,
    client_display_name  text,
    client_first_name    text,
    trip_id              uuid,
    trip_title           text,
    subject              text,
    last_message_at      timestamptz,
    last_message_preview text,
    agent_unread_count   integer,
    last_sender_role     text,
    awaiting_since       timestamptz,
    reply_due_at         timestamptz,
    overdue              boolean,
    archived             boolean,
    as_of                timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT a.id AS agent_id, a.time_zone FROM public.agent a
         WHERE a.id = public.current_agent_id()
    )
    SELECT cv.id, c.id,
           coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name,
           coalesce(c.preferred_name, c.first_name),
           cv.trip_id, t.title, cv.subject,
           cv.last_message_at, cv.last_message_preview, cv.agent_unread_count,
           last_seen.sender_role::text,
           w.awaiting_since,
           public.conversation_reply_due_at(w.awaiting_since, me.time_zone),
           coalesce(now() >= public.conversation_reply_due_at(w.awaiting_since, me.time_zone), false),
           (cv.agent_archived_at IS NOT NULL AND cv.agent_archived_at >= cv.last_message_at),
           now()
      FROM public.conversation cv
     CROSS JOIN me
      JOIN public.client c ON c.id = cv.client_id
      LEFT JOIN public.trip t ON t.id = cv.trip_id
      LEFT JOIN LATERAL (
            SELECT m.sender_role, m.created_at
              FROM public.message m
             WHERE m.conversation_id = cv.id AND m.archived_at IS NULL AND NOT m.is_internal_note
               AND NOT m.is_auto_reply
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT 1
           ) last_seen ON true
      LEFT JOIN LATERAL (
            SELECT min(m.created_at) AS awaiting_since
              FROM public.message m
             WHERE m.conversation_id = cv.id AND m.archived_at IS NULL AND NOT m.is_internal_note
               AND m.sender_role = 'client'
               AND last_seen.sender_role = 'client'
               AND m.created_at > coalesce((
                     SELECT max(r.created_at) FROM public.message r
                      WHERE r.conversation_id = cv.id AND r.archived_at IS NULL
                        AND NOT r.is_internal_note AND NOT r.is_auto_reply
                        AND r.sender_role <> 'client'), '-infinity')
           ) w ON true
     WHERE cv.agent_id = me.agent_id
       AND cv.archived_at IS NULL
       AND c.status <> 'merged_into'
       AND (cv.trip_id IS NULL OR t.agent_id = me.agent_id);
$$;

-- The advisor's thread carries the tag too.
DROP FUNCTION public.agent_conversation_messages(uuid);

CREATE FUNCTION public.agent_conversation_messages(p_conversation_id uuid)
RETURNS TABLE (
    message_id       uuid,
    sender_role      text,
    body             text,
    is_internal_note boolean,
    created_at       timestamptz,
    attachments      jsonb,
    total_messages   integer,
    emailed_at       timestamptz,
    channel          text,
    is_auto_reply    boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT x.id, x.sender_role, x.body, x.is_internal_note, x.created_at, x.attachments, x.total,
           x.emailed_at, x.channel, x.is_auto_reply
      FROM (
        SELECT m.id, m.sender_role::text AS sender_role, m.body, m.is_internal_note, m.created_at,
               coalesce((SELECT jsonb_agg(jsonb_build_object(
                                   'document_id', d.id, 'filename', d.filename, 'kind', d.kind)
                                 ORDER BY d.filename)
                           FROM public.message_attachment ma
                           JOIN public.document d ON d.id = ma.document_id AND d.archived_at IS NULL
                          WHERE ma.message_id = m.id), '[]'::jsonb) AS attachments,
               (count(*) OVER ())::integer AS total,
               m.emailed_at, m.channel, m.is_auto_reply
          FROM public.message m
         WHERE m.conversation_id IN (
                 SELECT th.conversation_id FROM public.agent_threads_for_current_agent() th
                  WHERE th.conversation_id = p_conversation_id)
           AND m.archived_at IS NULL
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT 500
      ) x
     ORDER BY x.created_at, x.id;
$$;
REVOKE EXECUTE ON FUNCTION public.agent_conversation_messages(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.agent_conversation_messages(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Settings: the snapshot, and the writes for Notifications, Signature and the auto-reply
-- ─────────────────────────────────────────────────────────────────────────────

-- The default signature (Q19): the prototype's lines without the locked one.
CREATE OR REPLACE FUNCTION public.agent_default_signature()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT E'{{agent.name}}, Travel Advisor\n{{agent.phone}} · {{agent.email}}\nadventures.story-tail.com\n\nMaking travel an adventure';
$$;

CREATE OR REPLACE FUNCTION public.agent_settings_snapshot(p_agent_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'displayName',  a.display_name,
            'pronouns',     a.pronouns,
            'email',        a.email,
            'phone',        a.phone,
            'bio',          a.bio,
            'avatarUrl',    a.avatar_url,
            'socialLinks',  a.social_links,
            'emailSignature', a.email_signature
        ),
        'availability', jsonb_build_object(
            'timeZone',          a.time_zone,
            'weeklySchedule',    coalesce(av.weekly_schedule, public.agent_default_weekly_schedule()),
            'responseTimeHours', coalesce(av.response_time_hours, 24)
        ),
        'notifications', jsonb_build_object(
            'clientMessages', jsonb_build_object(
                'push',  public.agent_alert_on(a.id, 'client_messages', 'push'),
                'email', public.agent_alert_on(a.id, 'client_messages', 'email')),
            'quoteRequests', jsonb_build_object(
                'push',  public.agent_alert_on(a.id, 'quote_requests', 'push'),
                'email', public.agent_alert_on(a.id, 'quote_requests', 'email'))
        ),
        'signature', jsonb_build_object(
            'text',      coalesce(a.email_signature, public.agent_default_signature()),
            'isDefault', a.email_signature IS NULL
        ),
        'today', public.agent_local_today(a.id),
        'timeOff', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                       'id',               t.id,
                       'startsOn',         t.starts_on,
                       'endsOn',           t.ends_on,
                       'label',            t.label,
                       'autoReplyEnabled', t.auto_reply_enabled,
                       'autoReplyText',    t.auto_reply_text
                   ) ORDER BY t.starts_on)
              FROM public.agent_time_off t
             WHERE t.agent_id = a.id
               AND t.ends_on >= public.agent_local_today(a.id)
        ), '[]'::jsonb)
    )
      FROM public.agent a
      LEFT JOIN public.agent_availability av ON av.agent_id = a.id
     WHERE a.id = p_agent_id
       AND a.status <> 'archived';
$$;

-- 3.12.3. All four switches saved together (one tab, one Save); the row is created on first
-- save. Only the advisor's own categories are touched; anything else in the blob is kept.
CREATE OR REPLACE FUNCTION public.agent_settings_update_notifications(
    p_agent_id              uuid,
    p_client_messages_push  boolean,
    p_client_messages_email boolean,
    p_quote_requests_push   boolean,
    p_quote_requests_email  boolean,
    p_audit_id              uuid,
    p_actor_user_id         uuid,
    p_ip                    text,
    p_user_agent            text
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
    v_old  jsonb;
    v_new  jsonb;
    v_diff jsonb;
BEGIN
    IF p_client_messages_push IS NULL OR p_client_messages_email IS NULL
       OR p_quote_requests_push IS NULL OR p_quote_requests_email IS NULL THEN
        RAISE EXCEPTION 'every switch needs a value';
    END IF;
    IF NOT public.agent_settings_lock(p_agent_id) THEN
        RETURN 'not_found';
    END IF;
    v_user := public.agent_platform_user(p_agent_id);
    IF v_user IS NULL THEN
        RETURN 'not_found';
    END IF;

    v_old := jsonb_build_object(
        'clientMessages', jsonb_build_object(
            'push',  public.agent_alert_on(p_agent_id, 'client_messages', 'push'),
            'email', public.agent_alert_on(p_agent_id, 'client_messages', 'email')),
        'quoteRequests', jsonb_build_object(
            'push',  public.agent_alert_on(p_agent_id, 'quote_requests', 'push'),
            'email', public.agent_alert_on(p_agent_id, 'quote_requests', 'email')));
    v_new := jsonb_build_object(
        'clientMessages', jsonb_build_object('push', p_client_messages_push, 'email', p_client_messages_email),
        'quoteRequests',  jsonb_build_object('push', p_quote_requests_push,  'email', p_quote_requests_email));
    v_diff := public.agent_settings_diff(v_old, v_new);
    IF v_diff = '{}'::jsonb THEN
        RETURN 'unchanged';
    END IF;

    INSERT INTO public.notification_preference (user_id, channels)
    VALUES (v_user, jsonb_build_object(
        'client_messages', jsonb_build_object('push', p_client_messages_push, 'email', p_client_messages_email),
        'quote_requests',  jsonb_build_object('push', p_quote_requests_push,  'email', p_quote_requests_email)))
    ON CONFLICT (user_id) DO UPDATE
       SET channels = CASE WHEN jsonb_typeof(notification_preference.channels) = 'object'
                           THEN notification_preference.channels ELSE '{}'::jsonb END
                      || EXCLUDED.channels,
           updated_at = now();

    PERFORM public.agent_settings_audit(p_audit_id, p_actor_user_id, 'agent.notifications_updated',
        'agent', p_agent_id, jsonb_build_object('changes', v_diff), p_ip, p_user_agent);
    RETURN 'updated';
END;
$$;

-- 3.12.4. NULL (or the default's exact text) stores NULL, so a later change to the default
-- reaches an advisor who never wrote their own.
CREATE OR REPLACE FUNCTION public.agent_settings_update_signature(
    p_agent_id      uuid,
    p_signature     text,
    p_audit_id      uuid,
    p_actor_user_id uuid,
    p_ip            text,
    p_user_agent    text
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old text;
    v_new text := nullif(btrim(p_signature, E' \n\r\t'), '');
BEGIN
    IF v_new = public.agent_default_signature() THEN
        v_new := NULL;
    END IF;
    IF NOT public.agent_settings_lock(p_agent_id) THEN
        RETURN 'not_found';
    END IF;
    SELECT a.email_signature INTO v_old FROM public.agent a WHERE a.id = p_agent_id;
    IF v_old IS NOT DISTINCT FROM v_new THEN
        RETURN 'unchanged';
    END IF;
    UPDATE public.agent SET email_signature = v_new, updated_at = now() WHERE id = p_agent_id;
    PERFORM public.agent_settings_audit(p_audit_id, p_actor_user_id, 'agent.signature_updated',
        'agent', p_agent_id,
        jsonb_build_object('changes', jsonb_build_object('emailSignature',
            jsonb_build_object('from', v_old, 'to', v_new))),
        p_ip, p_user_agent);
    RETURN 'updated';
END;
$$;

-- The time-away write gains the auto-reply. Its arguments change, so it is dropped and made
-- again; otherwise the rules are PR 1's.
DROP FUNCTION public.agent_settings_save_time_off(uuid, uuid, boolean, date, date, text, uuid, uuid, text, text);

CREATE FUNCTION public.agent_settings_save_time_off(
    p_id                 uuid,
    p_agent_id           uuid,
    p_is_new             boolean,
    p_starts_on          date,
    p_ends_on            date,
    p_label              text,
    p_auto_reply_enabled boolean,
    p_auto_reply_text    text,
    p_audit_id           uuid,
    p_actor_user_id      uuid,
    p_ip                 text,
    p_user_agent         text
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_today  date;
    v_row    public.agent_time_off;
    v_exists boolean;
    v_diff   jsonb;
    v_reply  boolean := coalesce(p_auto_reply_enabled, false);
    v_text   text := nullif(btrim(p_auto_reply_text), '');
BEGIN
    IF p_starts_on IS NULL OR p_ends_on IS NULL OR p_ends_on < p_starts_on THEN
        RETURN 'bad_dates';
    END IF;
    IF v_reply AND v_text IS NULL THEN
        RETURN 'reply_needs_text';
    END IF;

    IF NOT public.agent_settings_lock(p_agent_id) THEN
        RETURN 'not_found';
    END IF;
    v_today := public.agent_local_today(p_agent_id);

    SELECT * INTO v_row FROM public.agent_time_off WHERE id = p_id FOR UPDATE;
    v_exists := FOUND;

    IF v_exists AND v_row.agent_id <> p_agent_id THEN
        RETURN 'conflict';
    END IF;
    IF NOT v_exists AND NOT coalesce(p_is_new, false) THEN
        RETURN 'not_found';
    END IF;
    IF v_exists AND v_row.starts_on <= v_today THEN
        RETURN 'started';
    END IF;
    IF p_starts_on < v_today THEN
        RETURN 'starts_in_past';
    END IF;

    IF NOT v_exists THEN
        BEGIN
            INSERT INTO public.agent_time_off
                (id, agent_id, starts_on, ends_on, label, auto_reply_enabled, auto_reply_text)
            VALUES (p_id, p_agent_id, p_starts_on, p_ends_on, p_label, v_reply, v_text);
        EXCEPTION WHEN exclusion_violation THEN
            RETURN 'overlap';
        END;
        PERFORM public.agent_settings_audit(p_audit_id, p_actor_user_id, 'agent_time_off.created',
            'agent_time_off', p_id,
            jsonb_build_object('startsOn', p_starts_on, 'endsOn', p_ends_on, 'label', p_label,
                               'autoReplyEnabled', v_reply, 'autoReplyText', v_text),
            p_ip, p_user_agent);
        RETURN 'created';
    END IF;

    v_diff := public.agent_settings_diff(
        jsonb_build_object('startsOn', v_row.starts_on, 'endsOn', v_row.ends_on, 'label', v_row.label,
                           'autoReplyEnabled', v_row.auto_reply_enabled, 'autoReplyText', v_row.auto_reply_text),
        jsonb_build_object('startsOn', p_starts_on, 'endsOn', p_ends_on, 'label', p_label,
                           'autoReplyEnabled', v_reply, 'autoReplyText', v_text));
    IF v_diff = '{}'::jsonb THEN
        RETURN 'unchanged';
    END IF;

    BEGIN
        UPDATE public.agent_time_off
           SET starts_on = p_starts_on, ends_on = p_ends_on, label = p_label,
               auto_reply_enabled = v_reply, auto_reply_text = v_text, updated_at = now()
         WHERE id = p_id;
    EXCEPTION WHEN exclusion_violation THEN
        RETURN 'overlap';
    END;
    PERFORM public.agent_settings_audit(p_audit_id, p_actor_user_id, 'agent_time_off.updated',
        'agent_time_off', p_id, jsonb_build_object('changes', v_diff), p_ip, p_user_agent);
    RETURN 'updated';
END;
$$;

-- What email-dispatch prints under the advisor's words: the stored signature or the default,
-- with the advisor's own name, phone and email to fill the merge fields.
CREATE OR REPLACE FUNCTION public.agent_signature_for_conversation(p_conversation_id uuid)
RETURNS TABLE (signature text, display_name text, phone text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(a.email_signature, public.agent_default_signature()),
           a.display_name, a.phone, a.email::text
      FROM public.conversation cv
      JOIN public.agent a ON a.id = cv.agent_id
     WHERE cv.id = p_conversation_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. The email tick also wakes for the advisor's alerts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.email_dispatch_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    fn_url      text;
    service_key text;
BEGIN
    DELETE FROM public.email_token WHERE expires_at < now() - interval '30 days';
    DELETE FROM public.email_outbox o
     WHERE o.state IN ('sent', 'cleared', 'skipped', 'failed')
       AND o.created_at < now() - interval '30 days';
    DELETE FROM public.agent_alert_email o
     WHERE o.state IN ('sent', 'cleared', 'failed')
       AND o.created_at < now() - interval '30 days';
    DELETE FROM public.inbound_email WHERE received_at < now() - interval '90 days';

    IF NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE state = 'pending' AND due_at <= now())
       AND NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE state = 'sending' AND claimed_at < now() - interval '15 minutes')
       AND NOT EXISTS (SELECT 1 FROM public.agent_alert_email WHERE state = 'pending')
       AND NOT EXISTS (SELECT 1 FROM public.agent_alert_email WHERE state = 'sending' AND claimed_at < now() - interval '15 minutes')
    THEN
        RETURN 'idle';
    END IF;

    SELECT decrypted_secret INTO fn_url FROM vault.decrypted_secrets WHERE name = 'email_dispatch_function_url';
    SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'cruise_sync_service_role_key';
    IF fn_url IS NULL OR service_key IS NULL THEN
        RETURN 'unprovisioned';
    END IF;

    PERFORM net.http_post(
        url := fn_url,
        headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object('trigger', 'cron'),
        timeout_milliseconds := 30000
    );
    RETURN 'dispatched';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_platform_user(uuid)',
        'public.agent_alert_on(uuid, text, text)',
        'public.agent_rest_until(uuid, timestamptz)',
        'public.agent_push_reschedule(uuid)',
        'public.agent_alert_email_claim(integer)',
        'public.agent_alert_email_finish(uuid, boolean, boolean, text)',
        'public.agent_alert_email_release(uuid)',
        'public.alert_quote_request(uuid)',
        'public.push_claim_due(integer)',
        'public.agent_settings_update_notifications(uuid, boolean, boolean, boolean, boolean, uuid, uuid, text, text)',
        'public.agent_settings_update_signature(uuid, text, uuid, uuid, text, text)',
        'public.agent_settings_save_time_off(uuid, uuid, boolean, date, date, text, boolean, text, uuid, uuid, text, text)',
        'public.agent_signature_for_conversation(uuid)'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

-- Pure helpers, and the trigger functions: nothing outside the database calls them, but the
-- service role writes rows that fire them and calls through them, so it is named explicitly.
DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_alert_default(text, text)',
        'public.agent_return_date_label(date)',
        'public.agent_default_signature()',
        'public.agent_push_reschedule_trigger()',
        'public.agent_zone_push_reschedule()',
        'public.agent_on_client_message()'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

COMMIT;
