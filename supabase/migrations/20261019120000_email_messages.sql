-- §3.10 Stage 4: the advisor's replies reach the client by email, and the client can answer by
-- replying (Screen Inventory §3.10, Data-Model §12.8 to §12.10). This file is the queue, the
-- tokens and the inbound record; `email-dispatch` sends over IONOS SMTP, `email-inbound` takes
-- Resend's webhook, `email-unsubscribe` is the opt-out link. Rulings and review:
-- docs/Email-Provider-Review.md §6, docs/SMTP-Library-Security-Review.md.
--
-- ── WHAT GYASI RULED (2026-10-16) ───────────────────────────────────────────────────────
--
--   * THE FULL REPLY goes by email, card numbers masked, about FIVE MINUTES after the advisor's
--     latest reply, and NOT AT ALL if the client read it in the app first.
--   * REST HOURS IN THE CLIENT'S ZONE: 9pm to 7am and Sunday wait for 7am.
--   * ONLY CLIENTS WHO CAN SIGN IN, at their verified account email. The advisor is warned in
--     the thread about one who cannot.
--   * ONE OPT-OUT LINK per email; it turns off this email only.
--   * A REPLY BY EMAIL lands in the thread, matched by a per-email token AND the sender.
--   * AN "EMAILED" MARK under each reply an email carried (`message.emailed_at`).
--
-- ── ONE TRIGGER, AS PUSH DID ────────────────────────────────────────────────────────────
--
-- A client-visible advisor reply is the only thing that raises `client_unread_count`
-- (agent_send_message), and the client's own read is what lowers it
-- (client_mark_conversation_read). So one AFTER UPDATE trigger on that column queues an email
-- when it rises and clears a waiting one when it reaches zero. An internal note never raises
-- it, so a note can never be emailed, and none of Stage 1's audited functions is rewritten.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Message: where it came from, and whether an email carried it
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.message
    ADD COLUMN channel text NOT NULL DEFAULT 'app' CHECK (channel IN ('app', 'email')),
    ADD COLUMN emailed_at timestamptz;

COMMENT ON COLUMN public.message.channel IS
    'Data-Model §12.2: app, or email for a client reply that arrived by email (§12.10).';
COMMENT ON COLUMN public.message.emailed_at IS
    'Data-Model §12.2: when IONOS accepted an email carrying this advisor reply. Drives the '
    'advisor-only "Emailed" mark. Not in the client grant.';
-- The client's grant on message is a column list (20260907031255), so neither new column is
-- readable by a client. Asserted at the end.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.email_outbox (
    id                uuid PRIMARY KEY DEFAULT public.uuid_v7(),
    conversation_id   uuid NOT NULL REFERENCES public.conversation(id) ON DELETE CASCADE,
    client_user_id    uuid NOT NULL REFERENCES public.platform_user(id) ON DELETE CASCADE,
    first_message_at  timestamptz NOT NULL,
    latest_message_id uuid NOT NULL REFERENCES public.message(id) ON DELETE CASCADE,
    due_at            timestamptz NOT NULL,
    state             text NOT NULL DEFAULT 'pending'
                      CHECK (state IN ('pending', 'sending', 'sent', 'cleared', 'skipped', 'failed')),
    skip_reason       text CHECK (skip_reason IN ('opted_out', 'no_email', 'client_archived')),
    attempts          integer NOT NULL DEFAULT 0,
    claimed_at        timestamptz,
    sent_at           timestamptz,
    last_error        text CHECK (last_error IS NULL OR char_length(last_error) <= 200),
    created_at        timestamptz NOT NULL DEFAULT now(),
    CHECK ((state = 'skipped') = (skip_reason IS NOT NULL))
);
-- One WAITING email per thread: a second reply joins it. Pending only, as push_outbox's index:
-- a reply during a send gets its own row rather than being marked sent by an email that was
-- built before it existed.
CREATE UNIQUE INDEX email_outbox_one_pending ON public.email_outbox (conversation_id)
    WHERE state = 'pending';
CREATE INDEX email_outbox_due ON public.email_outbox (due_at) WHERE state = 'pending';
CREATE INDEX email_outbox_thread_sent ON public.email_outbox (conversation_id, sent_at DESC)
    WHERE state = 'sent';
-- Retention (email_dispatch_tick deletes finished rows after 30 days).
CREATE INDEX email_outbox_finished ON public.email_outbox (created_at)
    WHERE state IN ('sent', 'cleared', 'skipped', 'failed');

CREATE TABLE public.email_token (
    token_hash      bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
    purpose         text NOT NULL CHECK (purpose IN ('reply', 'unsubscribe')),
    -- Which email carried it. Nulled when that outbox row is retired after 30 days; the token
    -- outlives it (a client may answer an old email).
    outbox_id       uuid REFERENCES public.email_outbox(id) ON DELETE SET NULL,
    conversation_id uuid NOT NULL REFERENCES public.conversation(id) ON DELETE CASCADE,
    client_user_id  uuid NOT NULL REFERENCES public.platform_user(id) ON DELETE CASCADE,
    expires_at      timestamptz NOT NULL,
    used_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_token_outbox ON public.email_token (outbox_id);
CREATE INDEX email_token_expiry ON public.email_token (expires_at);

CREATE TABLE public.inbound_email (
    id                uuid PRIMARY KEY DEFAULT public.uuid_v7(),
    provider_email_id text NOT NULL UNIQUE CHECK (char_length(provider_email_id) BETWEEN 1 AND 200),
    outcome           text NOT NULL CHECK (outcome IN ('accepted', 'unknown_token', 'expired_token',
                          'sender_mismatch', 'thread_closed', 'empty', 'too_long', 'auto_reply')),
    message_id        uuid REFERENCES public.message(id) ON DELETE SET NULL,
    files_dropped     integer NOT NULL DEFAULT 0 CHECK (files_dropped >= 0),
    received_at       timestamptz NOT NULL DEFAULT now(),
    -- Only an accepted reply names a message (and keeps naming it unless the message is gone).
    CHECK (outcome = 'accepted' OR message_id IS NULL)
);

-- Service role only. RLS on with no policy: nobody but the service role and the definer
-- functions below sees a row.
CREATE INDEX inbound_email_received ON public.inbound_email (received_at);

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_email ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_outbox, public.email_token, public.inbound_email FROM public, anon, authenticated;
GRANT ALL ON public.email_outbox, public.email_token, public.inbound_email TO service_role;

COMMENT ON TABLE public.email_outbox IS
    'Data-Model §12.8: one waiting email per thread, about an advisor reply the client has not '
    'read. Ids and times only: the dispatcher reads the replies at send time.';
COMMENT ON TABLE public.email_token IS
    'Data-Model §12.9: SHA-256 of each email''s reply and unsubscribe tokens. The token itself '
    'exists only in the email.';
COMMENT ON TABLE public.inbound_email IS
    'Data-Model §12.10: one row per email Resend reported. Nothing about a rejected email is kept.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Who an email goes to
-- ─────────────────────────────────────────────────────────────────────────────

-- The client of a thread who can sign in: their platform_user. Null when they have no account,
-- which means no email (Gyasi, 2026-10-16) and so no queued row, the way push queues nothing
-- for an advisor with no device.
CREATE OR REPLACE FUNCTION public.email_client_user(p_client_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT pu.id FROM public.platform_user pu
     WHERE pu.client_id = p_client_id AND pu.role = 'client'
     LIMIT 1;
$$;

-- Whether this user has turned the messages email off (§12.5). Missing row, category or channel
-- means ON: only an explicit false is off.
CREATE OR REPLACE FUNCTION public.email_messages_opted_out(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT coalesce((SELECT np.channels -> 'messages' -> 'email' = 'false'::jsonb
                       FROM public.notification_preference np WHERE np.user_id = p_user_id), false);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Queue and clear, off the client's unread count
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.email_outbox_on_unread_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user   uuid;
    v_latest uuid;
    v_at     timestamptz;
    v_tz     text;
    v_due    timestamptz;
BEGIN
    IF NEW.client_unread_count > OLD.client_unread_count THEN
        v_user := public.email_client_user(NEW.client_id);
        IF v_user IS NULL THEN
            RETURN NEW;
        END IF;

        -- The reply that raised the count: the newest client-visible advisor message.
        SELECT m.id, m.created_at INTO v_latest, v_at
          FROM public.message m
         WHERE m.conversation_id = NEW.id AND m.sender_role <> 'client'
           AND NOT m.is_internal_note AND m.archived_at IS NULL
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT 1;
        IF v_latest IS NULL THEN
            RETURN NEW;
        END IF;

        SELECT pu.time_zone INTO v_tz FROM public.platform_user pu WHERE pu.id = v_user;
        -- Five minutes after THIS reply, so a burst goes as one email; then moved past the
        -- client's rest hours (push_due_at is the same 9pm to 7am and Sunday rule).
        v_due := public.push_due_at(now() + interval '5 minutes', v_tz);

        INSERT INTO public.email_outbox (conversation_id, client_user_id, first_message_at,
                                         latest_message_id, due_at)
        VALUES (NEW.id, v_user, v_at, v_latest, v_due)
        ON CONFLICT (conversation_id) WHERE state = 'pending'
        -- Each reply pushes the send out, but never past 30 minutes after the first one waiting,
        -- so a long back-and-forth cannot defer the email for ever.
        DO UPDATE SET latest_message_id = EXCLUDED.latest_message_id,
                      due_at = public.push_due_at(
                          least(now() + interval '5 minutes',
                                email_outbox.first_message_at + interval '30 minutes'),
                          v_tz);

    ELSIF NEW.client_unread_count = 0 AND OLD.client_unread_count > 0 THEN
        -- Read in the app before it went: no email. A sent one is not un-sent.
        UPDATE public.email_outbox SET state = 'cleared'
         WHERE conversation_id = NEW.id AND state = 'pending';

    ELSIF NEW.client_unread_count < OLD.client_unread_count THEN
        -- Read PART of it in the app: the waiting email starts at the first reply still unread
        -- (the count is the newest N client-visible advisor replies), so it never repeats what
        -- they have already seen.
        SELECT m.created_at INTO v_at
          FROM public.message m
         WHERE m.conversation_id = NEW.id AND m.sender_role <> 'client'
           AND NOT m.is_internal_note AND m.archived_at IS NULL
         ORDER BY m.created_at DESC, m.id DESC
         OFFSET NEW.client_unread_count - 1
         LIMIT 1;
        IF v_at IS NOT NULL THEN
            UPDATE public.email_outbox SET first_message_at = greatest(first_message_at, v_at)
             WHERE conversation_id = NEW.id AND state = 'pending';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER conversation_email_outbox
    AFTER UPDATE OF client_unread_count ON public.conversation
    FOR EACH ROW
    WHEN (NEW.client_unread_count IS DISTINCT FROM OLD.client_unread_count)
    EXECUTE FUNCTION public.email_outbox_on_unread_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The dispatcher's reads and writes (service_role, through `email-dispatch`)
-- ─────────────────────────────────────────────────────────────────────────────

-- Claim what is due, exclusively (SKIP LOCKED). Before claiming: a crashed run's rows count a
-- failed try; a thread read since it was queued is cleared; a row that must not be sent is
-- SKIPPED with its reason, decided now rather than at queue time, so an opt-out that landed in
-- the five minutes is honoured.
CREATE OR REPLACE FUNCTION public.email_claim_due(p_limit integer DEFAULT 25)
RETURNS TABLE (
    outbox_id         uuid,
    conversation_id   uuid,
    recipient         text,
    client_first_name text,
    agent_first_name  text,
    trip_title        text,
    previous_outbox_id uuid,
    messages          jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- A run that died mid-send left rows 'sending'. After 15 minutes (well past one run's time
    -- budget, so a slow run is never re-claimed under itself) each counts as a failed try. When
    -- a newer pending row exists, it takes over the stale row's replies (first_message_at moves
    -- back) and the stale row is cleared: otherwise those replies would never be emailed.
    UPDATE public.email_outbox p SET first_message_at = least(p.first_message_at, o.first_message_at)
      FROM public.email_outbox o
     WHERE o.state = 'sending' AND o.claimed_at < now() - interval '15 minutes'
       AND p.conversation_id = o.conversation_id AND p.state = 'pending';
    UPDATE public.email_outbox o SET state = 'cleared'
     WHERE o.state = 'sending' AND o.claimed_at < now() - interval '15 minutes'
       AND EXISTS (SELECT 1 FROM public.email_outbox p
                    WHERE p.conversation_id = o.conversation_id AND p.state = 'pending');
    UPDATE public.email_outbox o
       SET state = CASE WHEN o.attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END,
           attempts = o.attempts + 1
     WHERE o.state = 'sending' AND o.claimed_at < now() - interval '15 minutes';

    UPDATE public.email_outbox o SET state = 'cleared'
      FROM public.conversation cv
     WHERE o.conversation_id = cv.id AND o.state = 'pending' AND cv.client_unread_count = 0;

    UPDATE public.email_outbox o
       SET state = 'skipped',
           skip_reason = CASE
               WHEN cv.archived_at IS NOT NULL OR cl.archived_at IS NOT NULL
                    OR cl.status <> 'active' OR a.archived_at IS NOT NULL THEN 'client_archived'
               WHEN public.email_messages_opted_out(o.client_user_id) THEN 'opted_out'
               ELSE 'no_email' END
      FROM public.conversation cv, public.client cl, public.platform_user pu, public.account a
     WHERE o.state = 'pending' AND o.due_at <= now()
       AND cv.id = o.conversation_id AND cl.id = cv.client_id
       AND pu.id = o.client_user_id AND a.id = pu.account_id
       AND (cv.archived_at IS NOT NULL OR cl.archived_at IS NOT NULL OR cl.status <> 'active'
            OR a.archived_at IS NOT NULL
            OR public.email_messages_opted_out(o.client_user_id)
            OR a.email IS NULL OR a.email_verified_at IS NULL
            OR pu.client_id IS DISTINCT FROM cv.client_id);

    RETURN QUERY
    WITH claimed AS (
        UPDATE public.email_outbox o
           SET state = 'sending', claimed_at = now()
         WHERE o.id IN (
            SELECT x.id FROM public.email_outbox x
             WHERE x.state = 'pending' AND x.due_at <= now()
             ORDER BY x.due_at
             LIMIT greatest(1, least(coalesce(p_limit, 25), 100))
             FOR UPDATE SKIP LOCKED
         )
        RETURNING o.*
    )
    SELECT c.id, c.conversation_id, a.email::text,
           coalesce(cl.preferred_name, cl.first_name),
           split_part(btrim(ag.display_name), ' ', 1),
           t.title,
           (SELECT s.id FROM public.email_outbox s
             WHERE s.conversation_id = c.conversation_id AND s.state = 'sent'
             ORDER BY s.sent_at DESC LIMIT 1),
           coalesce((
               SELECT jsonb_agg(jsonb_build_object(
                          'message_id', m.id, 'body', m.body, 'created_at', m.created_at,
                          'attachments', coalesce((
                              SELECT jsonb_agg(d.filename ORDER BY d.filename)
                                FROM public.message_attachment ma
                                JOIN public.document d ON d.id = ma.document_id AND d.archived_at IS NULL
                               WHERE ma.message_id = m.id), '[]'::jsonb))
                        ORDER BY m.created_at, m.id)
                 FROM public.message m
                WHERE m.conversation_id = c.conversation_id
                  AND m.sender_role <> 'client' AND NOT m.is_internal_note AND m.archived_at IS NULL
                  AND m.created_at >= c.first_message_at
                  AND m.created_at <= lm.created_at), '[]'::jsonb)
      FROM claimed c
      JOIN public.conversation cv ON cv.id = c.conversation_id
      JOIN public.client cl ON cl.id = cv.client_id
      JOIN public.agent ag ON ag.id = cv.agent_id
      JOIN public.platform_user pu ON pu.id = c.client_user_id
      JOIN public.account a ON a.id = pu.account_id
      JOIN public.message lm ON lm.id = c.latest_message_id
      LEFT JOIN public.trip t ON t.id = cv.trip_id;
END;
$$;

-- The two tokens an email carries, hashed by the caller (SHA-256, 32 bytes each). Written
-- BEFORE the send: an email whose tokens failed to save must not go, or its reply and opt-out
-- links would be dead on arrival. A send that then fails leaves two rows that simply expire.
CREATE OR REPLACE FUNCTION public.email_record_tokens(
    p_outbox_id   uuid,
    p_reply_hash  bytea,
    p_unsub_hash  bytea
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    o public.email_outbox%ROWTYPE;
BEGIN
    SELECT * INTO o FROM public.email_outbox WHERE id = p_outbox_id AND state = 'sending';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'that email is not being sent';
    END IF;
    INSERT INTO public.email_token (token_hash, purpose, outbox_id, conversation_id, client_user_id, expires_at)
    VALUES (p_reply_hash, 'reply', o.id, o.conversation_id, o.client_user_id, now() + interval '1 year'),
           (p_unsub_hash, 'unsubscribe', o.id, o.conversation_id, o.client_user_id, now() + interval '2 years');
END;
$$;

-- After a send. Accepted: 'sent', and every reply it carried is stamped `emailed_at` (the
-- "Emailed" mark). A transient failure goes back to pending a little later, three tries in all;
-- a permanent one (SMTP 5xx) fails at once. A failure whose thread already has a newer pending
-- row is 'cleared': that row carries the replies, and two pending rows would break the index.
CREATE OR REPLACE FUNCTION public.email_finish(
    p_outbox_id uuid,
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
    o       public.email_outbox%ROWTYPE;
BEGIN
    UPDATE public.email_outbox x
       SET state    = CASE WHEN p_ok THEN 'sent'
                           WHEN p_permanent OR x.attempts + 1 >= 3 THEN 'failed'
                           WHEN EXISTS (SELECT 1 FROM public.email_outbox p
                                         WHERE p.conversation_id = x.conversation_id
                                           AND p.state = 'pending') THEN 'cleared'
                           ELSE 'pending' END,
           sent_at  = CASE WHEN p_ok THEN now() ELSE x.sent_at END,
           attempts = x.attempts + CASE WHEN p_ok THEN 0 ELSE 1 END,
           due_at   = CASE WHEN p_ok THEN x.due_at ELSE now() + (interval '5 minutes' * (x.attempts + 1)) END,
           last_error = CASE WHEN p_ok THEN NULL ELSE left(p_error, 200) END
     WHERE x.id = p_outbox_id AND x.state = 'sending'
    RETURNING x.* INTO o;
    IF NOT FOUND THEN
        RETURN 'not_claimed';
    END IF;
    v_state := o.state;

    -- Cleared because a newer row is waiting: that row must carry THIS row's replies too, or
    -- they are never emailed (it was queued starting at its own, later, first reply).
    IF v_state = 'cleared' THEN
        UPDATE public.email_outbox p SET first_message_at = least(p.first_message_at, o.first_message_at)
         WHERE p.conversation_id = o.conversation_id AND p.state = 'pending';
    END IF;

    IF p_ok THEN
        UPDATE public.message m SET emailed_at = now()
          FROM public.message lm
         WHERE lm.id = o.latest_message_id
           AND m.conversation_id = o.conversation_id
           AND m.sender_role <> 'client' AND NOT m.is_internal_note AND m.archived_at IS NULL
           AND m.created_at >= o.first_message_at AND m.created_at <= lm.created_at
           AND m.emailed_at IS NULL;
    END IF;
    RETURN v_state;
END;
$$;

-- A claimed row the run had no time left to send: back to waiting, no try counted. When a newer
-- row is already waiting, this one's replies move into it instead.
CREATE OR REPLACE FUNCTION public.email_release(p_outbox_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    o public.email_outbox%ROWTYPE;
BEGIN
    SELECT * INTO o FROM public.email_outbox WHERE id = p_outbox_id AND state = 'sending' FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'not_claimed';
    END IF;
    IF EXISTS (SELECT 1 FROM public.email_outbox p
                WHERE p.conversation_id = o.conversation_id AND p.state = 'pending') THEN
        UPDATE public.email_outbox p SET first_message_at = least(p.first_message_at, o.first_message_at)
         WHERE p.conversation_id = o.conversation_id AND p.state = 'pending';
        UPDATE public.email_outbox SET state = 'cleared' WHERE id = o.id;
        RETURN 'cleared';
    END IF;
    UPDATE public.email_outbox SET state = 'pending', claimed_at = NULL WHERE id = o.id;
    RETURN 'pending';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. A reply by email (service_role, through `email-inbound`)
-- ─────────────────────────────────────────────────────────────────────────────

-- Everything an inbound reply needs, in ONE transaction: dedupe on the provider's id, the token,
-- the thread, the sender, the text, then the message, the thread bump (the same
-- conversation_record_client_message trip-message uses, so unread counts, push and the overdue
-- clock behave as for an in-app message) and its audit row. Answers the outcome; `reply_to` is
-- set ONLY when the sender was verified, so the caller can never answer a forged address.
CREATE OR REPLACE FUNCTION public.email_inbound_record(
    p_provider_email_id text,
    p_token_hash        bytea,
    p_from              text,
    p_sender_verified   boolean,
    p_body              text,
    p_files             integer,
    p_message_id        uuid,
    -- An out-of-office or other automatic answer (RFC 3834 headers): never a client message.
    p_auto_reply        boolean DEFAULT false
)
RETURNS TABLE (outcome text, message_id uuid, duplicate boolean, reply_to text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_seen    public.inbound_email%ROWTYPE;
    v_tok     public.email_token%ROWTYPE;
    v_email   citext;
    v_client  uuid;
    v_outcome text;
    v_body    text := btrim(coalesce(p_body, ''), E' \t\r\n');
BEGIN
    SELECT * INTO v_seen FROM public.inbound_email WHERE provider_email_id = p_provider_email_id;
    IF FOUND THEN
        RETURN QUERY SELECT v_seen.outcome, v_seen.message_id, true, NULL::text;
        RETURN;
    END IF;

    SELECT * INTO v_tok FROM public.email_token
     WHERE token_hash = p_token_hash AND purpose = 'reply';
    IF coalesce(p_auto_reply, false) THEN
        v_outcome := 'auto_reply';
    ELSIF NOT FOUND THEN
        v_outcome := 'unknown_token';
    ELSIF v_tok.expires_at <= now() THEN
        v_outcome := 'expired_token';
    ELSE
        SELECT a.email, pu.client_id INTO v_email, v_client
          FROM public.platform_user pu JOIN public.account a ON a.id = pu.account_id
         WHERE pu.id = v_tok.client_user_id AND pu.role = 'client' AND a.archived_at IS NULL
           AND a.email_verified_at IS NOT NULL;
        IF v_email IS NULL OR NOT coalesce(p_sender_verified, false)
           OR lower(btrim(coalesce(p_from, ''))) <> lower(v_email::text) THEN
            v_outcome := 'sender_mismatch';
        ELSIF NOT EXISTS (
            SELECT 1 FROM public.conversation cv JOIN public.client cl ON cl.id = cv.client_id
             WHERE cv.id = v_tok.conversation_id AND cv.client_id = v_client
               AND cv.archived_at IS NULL AND cl.archived_at IS NULL AND cl.status = 'active') THEN
            v_outcome := 'thread_closed';
        ELSIF v_body = '' THEN
            v_outcome := 'empty';
        ELSIF char_length(v_body) > 8000 THEN
            v_outcome := 'too_long';
        ELSE
            v_outcome := 'accepted';
        END IF;
    END IF;

    IF v_outcome <> 'accepted' THEN
        INSERT INTO public.inbound_email (provider_email_id, outcome, files_dropped)
        VALUES (p_provider_email_id, v_outcome, greatest(coalesce(p_files, 0), 0));
        RETURN QUERY SELECT v_outcome, NULL::uuid, false, NULL::text;
        RETURN;
    END IF;

    -- clock_timestamp(), as agent_send_message stamps its messages: now() is the transaction's
    -- start, which can sort a reply before a message written earlier in the same transaction.
    INSERT INTO public.message (id, conversation_id, sender_user_id, sender_role, body,
                                is_internal_note, channel, created_at)
    VALUES (p_message_id, v_tok.conversation_id, v_tok.client_user_id, 'client', v_body, false,
            'email', clock_timestamp());
    PERFORM public.conversation_record_client_message(p_message_id);

    INSERT INTO public.inbound_email (provider_email_id, outcome, message_id, files_dropped)
    VALUES (p_provider_email_id, 'accepted', p_message_id, greatest(coalesce(p_files, 0), 0));
    UPDATE public.email_token SET used_at = now() WHERE token_hash = p_token_hash;

    INSERT INTO public.audit_event (id, actor_user_id, actor_role, event_type, target_entity, target_id, metadata)
    VALUES (public.uuid_v7(), v_tok.client_user_id, 'client', 'message.created', 'message', p_message_id,
            jsonb_build_object('conversationId', v_tok.conversation_id, 'channel', 'email',
                               'filesDropped', greatest(coalesce(p_files, 0), 0)));

    RETURN QUERY SELECT 'accepted'::text, p_message_id, false, v_email::text;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. The opt-out (service_role, through `email-unsubscribe`)
-- ─────────────────────────────────────────────────────────────────────────────

-- What a token's opt-out page shows: 'on', 'off', or 'invalid' (unknown or expired). Reads only.
CREATE OR REPLACE FUNCTION public.email_unsubscribe_status(p_token_hash bytea)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT coalesce((
        SELECT CASE WHEN public.email_messages_opted_out(t.client_user_id) THEN 'off' ELSE 'on' END
          FROM public.email_token t
         WHERE t.token_hash = p_token_hash AND t.purpose = 'unsubscribe' AND t.expires_at > now()),
        'invalid');
$$;

-- Turn the messages email off (p_on = false) or back on. Creates the preference row if there is
-- none (§12.5's first writer) and touches only channels.messages.email. Audited: who changed how
-- a client is contacted is worth a row. Answers the new status, or 'invalid'.
CREATE OR REPLACE FUNCTION public.email_set_messages_email(p_token_hash bytea, p_on boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user uuid;
BEGIN
    SELECT t.client_user_id INTO v_user FROM public.email_token t
     WHERE t.token_hash = p_token_hash AND t.purpose = 'unsubscribe' AND t.expires_at > now();
    IF v_user IS NULL OR p_on IS NULL THEN
        RETURN 'invalid';
    END IF;

    INSERT INTO public.notification_preference (user_id, channels)
    VALUES (v_user, jsonb_build_object('messages', jsonb_build_object('email', p_on)))
    ON CONFLICT (user_id) DO UPDATE
       SET channels = jsonb_set(
               CASE WHEN jsonb_typeof(notification_preference.channels -> 'messages') = 'object'
                    THEN notification_preference.channels
                    ELSE notification_preference.channels || '{"messages": {}}'::jsonb END,
               '{messages,email}', to_jsonb(p_on)),
           updated_at = now();
    UPDATE public.email_token SET used_at = now() WHERE token_hash = p_token_hash;

    INSERT INTO public.audit_event (id, actor_user_id, actor_role, event_type, target_entity, target_id, metadata)
    VALUES (public.uuid_v7(), v_user, 'client', 'notification_preference.updated',
            'notification_preference', v_user,
            jsonb_build_object('channel', 'email', 'category', 'messages', 'on', p_on, 'via', 'email_link'));

    RETURN CASE WHEN p_on THEN 'on' ELSE 'off' END;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. The advisor's thread: the "Emailed" mark
-- ─────────────────────────────────────────────────────────────────────────────

-- agent_conversation_messages (20261015120000) gains emailed_at and channel. The return type
-- changes, so DROP and CREATE; the body is otherwise the same.
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
    channel          text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT x.id, x.sender_role, x.body, x.is_internal_note, x.created_at, x.attachments, x.total,
           x.emailed_at, x.channel
      FROM (
        SELECT m.id, m.sender_role::text AS sender_role, m.body, m.is_internal_note, m.created_at,
               coalesce((SELECT jsonb_agg(jsonb_build_object(
                                   'document_id', d.id, 'filename', d.filename, 'kind', d.kind)
                                 ORDER BY d.filename)
                           FROM public.message_attachment ma
                           JOIN public.document d ON d.id = ma.document_id AND d.archived_at IS NULL
                          WHERE ma.message_id = m.id), '[]'::jsonb) AS attachments,
               (count(*) OVER ())::integer AS total,
               m.emailed_at, m.channel
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
-- 9. The minute tick
-- ─────────────────────────────────────────────────────────────────────────────

-- Calls `email-dispatch` only when a row is due, exactly as push_dispatch_tick does. Its own
-- URL secret; the service-role key is the one the cruise sync and push already use. Absence is
-- quiet: a laptop with no vault secrets sends nothing. Retention runs here too.
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
    DELETE FROM public.inbound_email WHERE received_at < now() - interval '90 days';

    IF NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE state = 'pending' AND due_at <= now())
       AND NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE state = 'sending' AND claimed_at < now() - interval '15 minutes')
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

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-dispatch') THEN
        PERFORM cron.unschedule('email-dispatch');
    END IF;
    PERFORM cron.schedule('email-dispatch', '* * * * *', 'SELECT public.email_dispatch_tick();');
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.email_client_user(uuid)',
        'public.email_messages_opted_out(uuid)',
        'public.email_outbox_on_unread_change()',
        'public.email_claim_due(integer)',
        'public.email_record_tokens(uuid, bytea, bytea)',
        'public.email_finish(uuid, boolean, boolean, text)',
        'public.email_release(uuid)',
        'public.email_inbound_record(text, bytea, text, boolean, text, integer, uuid, boolean)',
        'public.email_unsubscribe_status(bytea)',
        'public.email_set_messages_email(bytea, boolean)',
        'public.email_dispatch_tick()'
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
     WHERE n.nspname = 'public' AND p.proname LIKE 'email\_%'
       AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR has_function_privilege('anon', p.oid, 'EXECUTE'));
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'email functions executable by a client role: %', leaked;
    END IF;

    IF has_table_privilege('authenticated', 'public.email_outbox', 'SELECT')
       OR has_table_privilege('authenticated', 'public.email_token', 'SELECT')
       OR has_table_privilege('authenticated', 'public.inbound_email', 'SELECT') THEN
        RAISE EXCEPTION 'email tables must stay service-role only';
    END IF;

    -- The client may not read when, or whether, an advisor's reply was emailed.
    IF has_column_privilege('authenticated', 'public.message', 'emailed_at', 'SELECT')
       OR has_column_privilege('anon', 'public.message', 'emailed_at', 'SELECT') THEN
        RAISE EXCEPTION 'message.emailed_at must stay out of the client grant';
    END IF;
END $$;

COMMIT;
