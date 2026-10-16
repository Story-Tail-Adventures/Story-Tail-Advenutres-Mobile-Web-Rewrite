-- §3.10 Stage 4: client replies by email are read from the app's own IONOS mailbox over IMAP,
-- not through Resend (Gyasi, 2026-10-16). Library review: docs/IMAP-Library-Security-Review.md
-- (imapflow 2.2.1, approved). The `email-inbox` Edge Function does the reading; this file gives
-- it what it needs from the database.
--
--   1. email_inbound_record learns a SECOND way to find a reply's token. The reply address is
--      `info+<token>@…`, and when that survives the token is matched by its hash, as before. When
--      it does not (the mail app replied to From, or IONOS dropped the plus part), the reply's
--      In-Reply-To / References names our email by its Message-ID, `<outbox-id@…>`, and the token
--      is that email's reply token, found by outbox_id. Every other check is unchanged: a live
--      token, a verified sender equal to the account email, an open thread.
--   2. email_inbox_tick, every two minutes from pg_cron, posts to `email-inbox`. There is no "is
--      there work?" check to make first: the mailbox is outside the database.
--
-- The Resend webhook function (`email-inbound`) is removed in the same change; nothing in the
-- database referred to Resend.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. email_inbound_record: the token by hash, or by the email the reply answers
-- ─────────────────────────────────────────────────────────────────────────────

-- The signature gains a parameter, so DROP and CREATE.
DROP FUNCTION public.email_inbound_record(text, bytea, text, boolean, text, integer, uuid, boolean);

CREATE FUNCTION public.email_inbound_record(
    p_provider_email_id text,
    p_token_hash        bytea,
    p_from              text,
    p_sender_verified   boolean,
    p_body              text,
    p_files             integer,
    p_message_id        uuid,
    -- An out-of-office or other automatic answer (RFC 3834 headers): never a client message.
    p_auto_reply        boolean DEFAULT false,
    -- The outbox row the reply answers, read from its In-Reply-To / References. Used only when no
    -- token hash matched. Works while that row exists (30 days).
    p_reply_outbox_id   uuid DEFAULT NULL
)
RETURNS TABLE (outcome text, message_id uuid, duplicate boolean, reply_to text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_seen    public.inbound_email%ROWTYPE;
    v_tok     public.email_token%ROWTYPE;
    v_found   boolean := false;
    v_matched text := NULL;
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

    IF p_token_hash IS NOT NULL THEN
        SELECT * INTO v_tok FROM public.email_token
         WHERE token_hash = p_token_hash AND purpose = 'reply';
        v_found := FOUND;
        IF v_found THEN v_matched := 'address'; END IF;
    END IF;
    IF NOT v_found AND p_reply_outbox_id IS NOT NULL THEN
        SELECT * INTO v_tok FROM public.email_token
         WHERE outbox_id = p_reply_outbox_id AND purpose = 'reply'
         ORDER BY created_at DESC
         LIMIT 1;
        v_found := FOUND;
        IF v_found THEN v_matched := 'thread'; END IF;
    END IF;

    IF coalesce(p_auto_reply, false) THEN
        v_outcome := 'auto_reply';
    ELSIF NOT v_found THEN
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
    UPDATE public.email_token SET used_at = now() WHERE token_hash = v_tok.token_hash;

    INSERT INTO public.audit_event (id, actor_user_id, actor_role, event_type, target_entity, target_id, metadata)
    VALUES (public.uuid_v7(), v_tok.client_user_id, 'client', 'message.created', 'message', p_message_id,
            jsonb_build_object('conversationId', v_tok.conversation_id, 'channel', 'email',
                               'matchedBy', v_matched,
                               'filesDropped', greatest(coalesce(p_files, 0), 0)));

    RETURN QUERY SELECT 'accepted'::text, p_message_id, false, v_email::text;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The inbox tick
-- ─────────────────────────────────────────────────────────────────────────────

-- Posts to `email-inbox` every two minutes, which logs into the mailbox once per run. Its own URL
-- secret; the service-role key is the one the other ticks use. Absence is quiet, as theirs is.
CREATE OR REPLACE FUNCTION public.email_inbox_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    fn_url      text;
    service_key text;
BEGIN
    SELECT decrypted_secret INTO fn_url FROM vault.decrypted_secrets WHERE name = 'email_inbox_function_url';
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
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-inbox') THEN
        PERFORM cron.unschedule('email-inbox');
    END IF;
    PERFORM cron.schedule('email-inbox', '*/2 * * * *', 'SELECT public.email_inbox_tick();');
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.email_inbound_record(text, bytea, text, boolean, text, integer, uuid, boolean, uuid)',
        'public.email_inbox_tick()'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

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
END $$;

COMMIT;
