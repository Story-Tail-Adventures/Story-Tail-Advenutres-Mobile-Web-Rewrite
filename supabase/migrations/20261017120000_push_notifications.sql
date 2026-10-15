-- §3.10 Stage 3b: message notifications (Screen Inventory §3.10.7, Data-Model §12.6 / §12.7).
--
-- When a client writes, their advisor's signed-in devices are told. This file is the queue
-- and its rules; the `push-dispatch` Edge Function does the sending, and `push-device`
-- registers devices. Security review: docs/Push-Notifications-Security-Review.md.
--
-- ── WHAT GYASI RULED (2026-10-15) ───────────────────────────────────────────────────────
--
--   * ONLY A NEW CLIENT MESSAGE notifies, to its advisor. Never an internal note, never the
--     advisor's own reply, never card data.
--   * ONE NOTIFICATION PER THREAD: a second message updates the queued row.
--   * REST HOURS: silent 9pm to 7am in the advisor's zone and all of Sunday, then ONE 7am
--     summary. Rest is not lateness (the overdue clock skips Sunday for the same reason).
--   * READING A THREAD ANYWHERE CLEARS IT EVERYWHERE: a silent dismiss goes to every device.
--
-- ── ONE TRIGGER, NOT EDITS TO STAGE 1's FUNCTIONS ───────────────────────────────────────
--
-- Every path that moves the advisor's unread count updates `conversation.agent_unread_count`:
-- a client's message raises it (conversation_record_client_message, called by trip-message),
-- and a read, a reply or an archive lowers it (agent_mark_conversation_read,
-- agent_send_message, agent_set_conversations_archived). So one AFTER UPDATE trigger on that
-- column queues a notification when it rises and clears one when it reaches zero, and none of
-- Stage 1's audited functions is rewritten.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE public.push_platform AS ENUM ('android', 'web', 'ios');

CREATE TABLE public.push_device (
    id               uuid PRIMARY KEY,
    platform_user_id uuid NOT NULL REFERENCES public.platform_user(id) ON DELETE CASCADE,
    platform         public.push_platform NOT NULL,
    fcm_token        text,
    web_endpoint     text,
    web_p256dh       text,
    web_auth         text,
    label            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    last_seen_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (platform = 'web' AND web_endpoint IS NOT NULL AND web_p256dh IS NOT NULL AND web_auth IS NOT NULL
             AND fcm_token IS NULL)
        OR (platform IN ('android', 'ios') AND fcm_token IS NOT NULL AND web_endpoint IS NULL)
    ),
    CHECK (label IS NULL OR char_length(label) <= 80)
);
CREATE UNIQUE INDEX push_device_fcm_token ON public.push_device (fcm_token) WHERE fcm_token IS NOT NULL;
CREATE UNIQUE INDEX push_device_web_endpoint ON public.push_device (web_endpoint) WHERE web_endpoint IS NOT NULL;
CREATE INDEX push_device_user ON public.push_device (platform_user_id);

CREATE TABLE public.push_outbox (
    -- Server-side default, unlike client-written tables (§21.6): no client ever makes a row.
    id                uuid PRIMARY KEY DEFAULT public.uuid_v7(),
    agent_id          uuid NOT NULL REFERENCES public.agent(id),
    conversation_id   uuid NOT NULL REFERENCES public.conversation(id) ON DELETE CASCADE,
    latest_message_id uuid NOT NULL REFERENCES public.message(id) ON DELETE CASCADE,
    message_count     integer NOT NULL CHECK (message_count > 0),
    due_at            timestamptz NOT NULL,
    held              boolean NOT NULL,
    state             text NOT NULL DEFAULT 'pending'
                      CHECK (state IN ('pending', 'sending', 'sent', 'cleared', 'failed')),
    attempts          integer NOT NULL DEFAULT 0,
    claimed_at        timestamptz,
    sent_at           timestamptz,
    -- Read after it was sent: the devices still show it, so a silent dismiss goes out.
    needs_dismiss     boolean NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now()
);
-- One WAITING notification per thread: a second message updates that row rather than adding
-- a second notification. Pending only, not 'sending': a message that arrives while the last
-- one is being sent must get a row of its own, or the in-flight payload (built from the older
-- message) would be marked sent and the newer one never told.
CREATE UNIQUE INDEX push_outbox_one_pending ON public.push_outbox (conversation_id)
    WHERE state = 'pending';
CREATE INDEX push_outbox_due ON public.push_outbox (due_at) WHERE state = 'pending';
CREATE INDEX push_outbox_dismiss ON public.push_outbox (id) WHERE needs_dismiss;

-- Service role only, like every table only Edge Functions read. No policies: RLS on with none
-- means nobody but the service role (and the definer functions below) sees a row.
ALTER TABLE public.push_device ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_device, public.push_outbox FROM public, anon, authenticated;
GRANT ALL ON public.push_device, public.push_outbox TO service_role;

COMMENT ON TABLE public.push_device IS
    'Data-Model §12.6: one row per signed-in device that turned notifications on. Service role '
    'only. Device addresses are identifiers: never returned to a client role.';
COMMENT ON TABLE public.push_outbox IS
    'Data-Model §12.7: one pending notification per thread, held through rest hours (9pm to '
    '7am and Sunday, in the advisor''s zone) into a single 7am summary.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rest hours
-- ─────────────────────────────────────────────────────────────────────────────

-- When a notification about something at [p_at] may go out: [p_at] itself, or 07:00 local
-- after the rest hours it fell in. 9pm to 7am is rest, and so is all of Sunday, so a Saturday
-- 10pm message and a Sunday noon one both wait for Monday 07:00. A bad zone string falls back
-- to UTC rather than raising inside a trigger.
CREATE OR REPLACE FUNCTION public.push_due_at(p_at timestamptz, p_time_zone text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_zone  text := p_time_zone;
    v_local timestamp;
    v_day   date;
BEGIN
    IF v_zone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_zone) THEN
        v_zone := 'UTC';
    END IF;
    v_local := p_at AT TIME ZONE v_zone;
    v_day := v_local::date;

    IF extract(hour FROM v_local) >= 21 THEN
        v_day := v_day + 1;
    ELSIF extract(hour FROM v_local) >= 7 AND extract(isodow FROM v_local) <> 7 THEN
        RETURN p_at;
    END IF;

    IF extract(isodow FROM v_day) = 7 THEN
        v_day := v_day + 1;
    END IF;
    RETURN (v_day + time '07:00') AT TIME ZONE v_zone;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Queue and clear, off the advisor's unread count
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.push_outbox_on_unread_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_latest uuid;
    v_tz     text;
    v_due    timestamptz;
BEGIN
    IF NEW.agent_unread_count > OLD.agent_unread_count THEN
        -- Nobody to tell: no row, so the table does not fill for advisors who never turned
        -- notifications on.
        -- An archived advisor is told nothing, as `current_agent_id()` lets them read nothing.
        IF NOT EXISTS (
            SELECT 1 FROM public.push_device d
              JOIN public.platform_user pu ON pu.id = d.platform_user_id
              JOIN public.agent a ON a.id = pu.agent_id
             WHERE pu.agent_id = NEW.agent_id AND pu.role = 'agent' AND a.status <> 'archived'
        ) THEN
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

        SELECT a.time_zone INTO v_tz FROM public.agent a WHERE a.id = NEW.agent_id;
        v_due := public.push_due_at(now(), v_tz);

        INSERT INTO public.push_outbox (agent_id, conversation_id, latest_message_id, message_count, due_at, held)
        VALUES (NEW.agent_id, NEW.id, v_latest, NEW.agent_unread_count - OLD.agent_unread_count,
                v_due, v_due > now())
        ON CONFLICT (conversation_id) WHERE state = 'pending'
        DO UPDATE SET latest_message_id = EXCLUDED.latest_message_id,
                      message_count     = push_outbox.message_count + EXCLUDED.message_count;

    ELSIF NEW.agent_unread_count = 0 AND OLD.agent_unread_count > 0 THEN
        -- Read (or replied to, or archived) before it went: nothing to send.
        UPDATE public.push_outbox SET state = 'cleared'
         WHERE conversation_id = NEW.id AND state = 'pending';
        -- Read after it went, or while it was going: the devices show (or will show) it. A
        -- 'sending' row keeps the flag through push_finish; dismissals are claimed only once
        -- the row is 'sent', so a dismiss never overtakes its own notification.
        UPDATE public.push_outbox SET needs_dismiss = true
         WHERE conversation_id = NEW.id AND NOT needs_dismiss
           AND (state = 'sending' OR (state = 'sent' AND sent_at > now() - interval '7 days'));
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER conversation_push_outbox
    AFTER UPDATE OF agent_unread_count ON public.conversation
    FOR EACH ROW
    WHEN (NEW.agent_unread_count IS DISTINCT FROM OLD.agent_unread_count)
    EXECUTE FUNCTION public.push_outbox_on_unread_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Devices (service_role, through `push-device`)
-- ─────────────────────────────────────────────────────────────────────────────

-- Register or refresh. A token or endpoint belongs to one device, so one already held by
-- another user (a shared laptop, a re-signed-in phone) moves to this one rather than being
-- duplicated: whoever signed in last is who the device tells.
CREATE OR REPLACE FUNCTION public.push_register_device(
    p_user_id      uuid,
    p_device_id    uuid,
    p_platform     public.push_platform,
    -- One address per platform: the FCM token (android, ios) or the web subscription.
    p_fcm_token    text DEFAULT NULL,
    p_web_endpoint text DEFAULT NULL,
    p_web_p256dh   text DEFAULT NULL,
    p_web_auth     text DEFAULT NULL,
    p_label        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.platform_user WHERE id = p_user_id AND role = 'agent') THEN
        RAISE EXCEPTION 'notifications are for advisors in this stage';
    END IF;

    SELECT id INTO v_id FROM public.push_device
     WHERE (p_fcm_token IS NOT NULL AND fcm_token = p_fcm_token)
        OR (p_web_endpoint IS NOT NULL AND web_endpoint = p_web_endpoint)
     FOR UPDATE;

    IF v_id IS NULL THEN
        -- Two first registrations of one address can race past the SELECT; the loser's insert
        -- does nothing and it takes the winner's row below. An id already used by some other
        -- row does the same, and then the address lookup finds nothing: refused, not "done".
        INSERT INTO public.push_device (id, platform_user_id, platform, fcm_token, web_endpoint, web_p256dh, web_auth, label)
        VALUES (p_device_id, p_user_id, p_platform, p_fcm_token, p_web_endpoint, p_web_p256dh, p_web_auth, p_label)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_id;
        IF v_id IS NOT NULL THEN
            RETURN v_id;
        END IF;
        SELECT id INTO v_id FROM public.push_device
         WHERE (p_fcm_token IS NOT NULL AND fcm_token = p_fcm_token)
            OR (p_web_endpoint IS NOT NULL AND web_endpoint = p_web_endpoint)
         FOR UPDATE;
        IF v_id IS NULL THEN
            RAISE EXCEPTION 'that device id is already in use';
        END IF;
    END IF;

    UPDATE public.push_device
       SET platform_user_id = p_user_id, web_p256dh = p_web_p256dh, web_auth = p_web_auth,
           label = coalesce(p_label, label), last_seen_at = now()
     WHERE id = v_id;
    RETURN v_id;
END;
$$;

-- Sign-out, or "turn off": only the caller's own device. Answers how many rows went.
CREATE OR REPLACE FUNCTION public.push_unregister_device(
    p_user_id      uuid,
    p_fcm_token    text DEFAULT NULL,
    p_web_endpoint text DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH gone AS (
        DELETE FROM public.push_device
         WHERE platform_user_id = p_user_id
           AND ((p_fcm_token IS NOT NULL AND fcm_token = p_fcm_token)
             OR (p_web_endpoint IS NOT NULL AND web_endpoint = p_web_endpoint))
        RETURNING 1
    )
    SELECT count(*)::integer FROM gone;
$$;

-- The push service said this address is dead (404 / 410): forget it.
CREATE OR REPLACE FUNCTION public.push_device_gone(p_device_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    DELETE FROM public.push_device WHERE id = p_device_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The dispatcher's reads and writes (service_role, through `push-dispatch`)
-- ─────────────────────────────────────────────────────────────────────────────

-- Claim what is due, so two overlapping cron runs never send one notification twice
-- (SKIP LOCKED). A row stuck 'sending' for 5 minutes (a crashed run) is claimable again. A
-- thread read since it was queued is cleared here rather than sent.
CREATE OR REPLACE FUNCTION public.push_claim_due(p_limit integer DEFAULT 50)
RETURNS TABLE (
    outbox_id         uuid,
    agent_id          uuid,
    conversation_id   uuid,
    held              boolean,
    message_count     integer,
    client_name       text,
    trip_title        text,
    preview           text,
    latest_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- A pass that died mid-send left rows 'sending'. After five minutes each counts as one
    -- failed try: back to pending (or failed after three), or cleared when a newer pending row
    -- for the thread already carries what it would have said.
    UPDATE public.push_outbox o SET state = 'cleared'
     WHERE o.state = 'sending' AND o.claimed_at < now() - interval '5 minutes'
       AND EXISTS (SELECT 1 FROM public.push_outbox p
                    WHERE p.conversation_id = o.conversation_id AND p.state = 'pending');
    UPDATE public.push_outbox o
       SET state = CASE WHEN o.attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END,
           attempts = o.attempts + 1, needs_dismiss = false
     WHERE o.state = 'sending' AND o.claimed_at < now() - interval '5 minutes';

    -- Read since it was queued: nothing to send.
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
    SELECT c.id, c.agent_id, c.conversation_id, c.held, c.message_count,
           coalesce(cl.preferred_name, cl.first_name) || ' ' || cl.last_name,
           t.title,
           public.message_preview(m.body),
           m.created_at
      FROM claimed c
      JOIN public.conversation cv ON cv.id = c.conversation_id
      JOIN public.client cl ON cl.id = cv.client_id
      LEFT JOIN public.trip t ON t.id = cv.trip_id
      JOIN public.message m ON m.id = c.latest_message_id;
END;
$$;

-- Every device of the advisor behind [p_agent_id].
CREATE OR REPLACE FUNCTION public.push_devices_for_agent(p_agent_id uuid)
RETURNS TABLE (
    device_id    uuid,
    platform     public.push_platform,
    fcm_token    text,
    web_endpoint text,
    web_p256dh   text,
    web_auth     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT d.id, d.platform, d.fcm_token, d.web_endpoint, d.web_p256dh, d.web_auth
      FROM public.push_device d
      JOIN public.platform_user pu ON pu.id = d.platform_user_id
      JOIN public.agent a ON a.id = pu.agent_id
     WHERE pu.agent_id = p_agent_id AND pu.role = 'agent' AND a.status <> 'archived'
     ORDER BY d.created_at;
$$;

-- After a send: 'sent', or back to 'pending' a little later (up to 3 tries), then 'failed'.
-- A failed row whose thread already has a newer pending row is 'cleared' instead: that row
-- will say it, and two pending rows for one thread would break the one-waiting rule. A
-- dismiss owed by a send that never landed is dropped.
CREATE OR REPLACE FUNCTION public.push_finish(p_outbox_id uuid, p_ok boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_state text;
BEGIN
    UPDATE public.push_outbox o
       SET state    = CASE WHEN p_ok THEN 'sent'
                           WHEN o.attempts + 1 >= 3 THEN 'failed'
                           WHEN EXISTS (SELECT 1 FROM public.push_outbox p
                                         WHERE p.conversation_id = o.conversation_id
                                           AND p.state = 'pending') THEN 'cleared'
                           ELSE 'pending' END,
           needs_dismiss = p_ok AND o.needs_dismiss,
           sent_at  = CASE WHEN p_ok THEN now() ELSE o.sent_at END,
           attempts = o.attempts + CASE WHEN p_ok THEN 0 ELSE 1 END,
           due_at   = CASE WHEN p_ok THEN o.due_at ELSE now() + (interval '2 minutes' * (o.attempts + 1)) END
     WHERE o.id = p_outbox_id AND o.state = 'sending'
    RETURNING o.state INTO v_state;
    RETURN coalesce(v_state, 'not_claimed');
END;
$$;

-- Dismissals owed (read after being sent). Claimed by turning the flag off: a dismiss is
-- best-effort, and sending one twice is harmless while never sending one is only cosmetic.
CREATE OR REPLACE FUNCTION public.push_claim_dismissals(p_limit integer DEFAULT 50)
RETURNS TABLE (agent_id uuid, conversation_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH claimed AS (
        UPDATE public.push_outbox o SET needs_dismiss = false
         WHERE o.id IN (
            SELECT x.id FROM public.push_outbox x WHERE x.needs_dismiss AND x.state = 'sent'
             ORDER BY x.sent_at LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
             FOR UPDATE SKIP LOCKED
         )
        RETURNING o.agent_id, o.conversation_id
    )
    SELECT DISTINCT agent_id, conversation_id FROM claimed;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The minute tick
-- ─────────────────────────────────────────────────────────────────────────────

-- Calls `push-dispatch` only when there is work, so an idle minute costs one indexed read
-- and no HTTP call. The URL is its own vault secret; the key reuses the cruise sync's
-- service-role secret (one credential to keep real, not two). ABSENCE IS QUIET, as the
-- cruise tick's is: a laptop with no vault secrets dispatches nothing.
CREATE OR REPLACE FUNCTION public.push_dispatch_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    fn_url      text;
    service_key text;
BEGIN
    -- Retention: a finished row is history after 30 days. Cheap, and it keeps the table small.
    DELETE FROM public.push_outbox
     WHERE state IN ('sent', 'cleared', 'failed') AND NOT needs_dismiss
       AND created_at < now() - interval '30 days';

    IF NOT EXISTS (SELECT 1 FROM public.push_outbox WHERE state = 'pending' AND due_at <= now())
       AND NOT EXISTS (SELECT 1 FROM public.push_outbox WHERE needs_dismiss)
       AND NOT EXISTS (SELECT 1 FROM public.push_outbox WHERE state = 'sending' AND claimed_at < now() - interval '5 minutes')
    THEN
        RETURN 'idle';
    END IF;

    SELECT decrypted_secret INTO fn_url FROM vault.decrypted_secrets WHERE name = 'push_dispatch_function_url';
    SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'cruise_sync_service_role_key';
    IF fn_url IS NULL OR service_key IS NULL THEN
        RETURN 'unprovisioned';
    END IF;

    PERFORM net.http_post(
        url := fn_url,
        headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object('trigger', 'cron'),
        timeout_milliseconds := 20000
    );
    RETURN 'dispatched';
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-dispatch') THEN
        PERFORM cron.unschedule('push-dispatch');
    END IF;
    PERFORM cron.schedule('push-dispatch', '* * * * *', 'SELECT public.push_dispatch_tick();');
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.push_due_at(timestamptz, text)',
        'public.push_outbox_on_unread_change()',
        'public.push_register_device(uuid, uuid, public.push_platform, text, text, text, text, text)',
        'public.push_unregister_device(uuid, text, text)',
        'public.push_device_gone(uuid)',
        'public.push_claim_due(integer)',
        'public.push_devices_for_agent(uuid)',
        'public.push_finish(uuid, boolean)',
        'public.push_claim_dismissals(integer)',
        'public.push_dispatch_tick()'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
DECLARE leaked text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'push\_%'
       AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR has_function_privilege('anon', p.oid, 'EXECUTE'));
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'push functions executable by a client role: %', leaked;
    END IF;

    IF has_table_privilege('authenticated', 'public.push_device', 'SELECT')
       OR has_table_privilege('authenticated', 'public.push_outbox', 'SELECT') THEN
        RAISE EXCEPTION 'push tables must stay service-role only';
    END IF;

    -- The rest-hours rule on its edges (Chicago, CDT = UTC-5 in October 2026).
    IF public.push_due_at('2026-10-15 14:00-05', 'America/Chicago') <> '2026-10-15 14:00-05'   -- Thu afternoon: now
       OR public.push_due_at('2026-10-15 21:30-05', 'America/Chicago') <> '2026-10-16 07:00-05' -- Thu 9:30pm: Fri 7am
       OR public.push_due_at('2026-10-16 06:59-05', 'America/Chicago') <> '2026-10-16 07:00-05' -- Fri 6:59am: 7am
       OR public.push_due_at('2026-10-17 22:00-05', 'America/Chicago') <> '2026-10-19 07:00-05' -- Sat 10pm: Mon 7am
       OR public.push_due_at('2026-10-18 12:00-05', 'America/Chicago') <> '2026-10-19 07:00-05' -- Sun noon: Mon 7am
       OR public.push_due_at('2026-10-19 07:00-05', 'America/Chicago') <> '2026-10-19 07:00-05' -- Mon 7am: now
       OR public.push_due_at('2026-10-15 14:00-05', 'Not/AZone') IS NULL THEN
        RAISE EXCEPTION 'push_due_at does not keep the rest-hours rule';
    END IF;
END $$;

COMMIT;
