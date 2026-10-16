-- §3.9 Login Support, PR 1: account admin (Screens 3.9.1 to 3.9.6 and the invite).
-- Rulings: docs/Screen-Inventory.md §3.9 (2026-10-16). Data-Model §5.1, §5.5, §5.6.
--
-- ── WHAT THIS ADDS ─────────────────────────────────────────────────────────────────────
--
--   1. auth_event.ip_address / user_agent become nullable (auth.sessions allows null).
--   2. auth_event_flag, an advisor's "this sign-in looks off" mark.
--   3. record_auth_session_start(), the FIRST writer of auth_event: one login_success row per
--      new auth.sessions row, plus account.last_login_at.
--   4. account_admin_target(), the one snapshot the tab renders and the Edge Function decides
--      from, and agent_client_account_admin(), its authenticated, aal2-gated door.
--   5. The writes the `account-admin` Edge Function calls, each with its audit row INSIDE the
--      same transaction: claim a sign-in email (the 3-an-hour cap), lock / unlock, sign out
--      everywhere, flag / unflag.
--
-- ── WHAT IS NOT HERE ON PURPOSE ────────────────────────────────────────────────────────
--
-- The GoTrue side of each action (generateLink, ban, unban, email_confirm) goes through the
-- Admin API in the Edge Function, never by writing auth.users from SQL: GoTrue owns those
-- columns (Data-Model §5.1.1) and its own caches and hooks would not see a raw UPDATE.
-- The ONE auth-schema write here is deleting a locked client's auth.sessions rows, which is
-- exactly what GoTrue's own global sign-out does (the refresh tokens cascade), and the Admin
-- API's signOut needs the client's own JWT, which an advisor never holds.
--
-- ── NOTHING A CLIENT CAN SIGN IN WITH PASSES THROUGH HERE ──────────────────────────────
--
-- No function in this file sees a link, token hash or OTP. The cap is claimed BEFORE the
-- link is made, and the audit row records only the kind of email.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. auth_event columns GoTrue may leave empty
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.auth_event ALTER COLUMN ip_address DROP NOT NULL;
ALTER TABLE public.auth_event ALTER COLUMN user_agent DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. auth_event_flag
--
-- Its own table because auth_event is append-only and a flag can be cleared. Clearing deletes
-- the row; the audit trail keeps both directions.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.auth_event_flag (
    auth_event_id        uuid PRIMARY KEY REFERENCES public.auth_event(id),
    flagged_by_agent_id  uuid NOT NULL REFERENCES public.agent(id),
    created_at           timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.auth_event_flag IS
    'An advisor''s mark that one sign-in looks suspicious (Screen 3.9.6). Never locks anything '
    'by itself. Service-role only. Data-Model §5.6.';

ALTER TABLE public.auth_event_flag ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_event_flag FROM public, anon, authenticated;
GRANT ALL ON public.auth_event_flag TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Recording sign-ins
--
-- GoTrue inserts one auth.sessions row per sign-in, by any method (password, Google, Apple,
-- magic link, invite, recovery). A token refresh UPDATEs that row, so it is not a sign-in and
-- records nothing. A failed password attempt opens no session and is not recorded in P1.
--
-- IT MUST NEVER COST ANYONE THEIR SIGN-IN. This runs inside GoTrue's own INSERT; an error
-- here aborts the session and the person cannot sign in at all. So every failure is caught,
-- reported as a WARNING, and swallowed. A missing activity row is a gap in a log; a raised
-- exception is a locked-out traveler.
--
-- Checked 2026-10-16: hosted Supabase grants `postgres` TRIGGER on auth.sessions by ACL (not
-- by supautils escalation), the same grant the on_auth_user_* triggers already rely on.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_auth_session_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_at timestamptz := coalesce(NEW.created_at, now());
BEGIN
    BEGIN
        -- Only an account we know about. An auth user with no account row is a half-made
        -- sign-up (handle_new_user runs in the same transaction, so this should not occur),
        -- and auth_event.account_id is a foreign key.
        IF EXISTS (SELECT 1 FROM public.account a WHERE a.id = NEW.user_id) THEN
            INSERT INTO public.auth_event
                (id, account_id, event_type, result, ip_address, user_agent, created_at)
            VALUES
                (public.uuid_v7(), NEW.user_id, 'login_success', 'success',
                 NEW.ip, left(NEW.user_agent, 500), v_at);

            UPDATE public.account
               SET last_login_at = greatest(coalesce(last_login_at, v_at), v_at)
             WHERE id = NEW.user_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'record_auth_session_start: % (%)', SQLERRM, SQLSTATE;
    END;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.record_auth_session_start() IS
    'AFTER INSERT ON auth.sessions: one login_success auth_event per sign-in and '
    'account.last_login_at. Swallows its own errors so it can never block a sign-in. '
    'Screen 3.9.6, Data-Model §5.5.';

REVOKE ALL ON FUNCTION public.record_auth_session_start() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_session_created ON auth.sessions;
CREATE TRIGGER on_auth_session_created
    AFTER INSERT ON auth.sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.record_auth_session_start();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The snapshot
--
-- One jsonb, so the tab and the Edge Function cannot disagree about what "has a password" or
-- "has a duplicate" means. NULL when the client is not this advisor's (or is merged away):
-- callers answer that as not-found, never as "forbidden", so an id's existence is not
-- confirmed.
--
-- `duplicateEmailClientId`: another live client record of ANY advisor with the same email.
-- Confirming an email fires handle_user_email_confirmed(), which adopts an unclaimed record
-- with that email; an invite does the same when it is accepted. Either would bind this
-- person's sign-in to a record that is not this one. So both refuse while one exists, and the
-- advisor is sent to Merge. Only the id of a record THIS advisor owns is returned; another
-- advisor's record is reported as a bare `true` so its id never leaks across books.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.account_admin_target(
    p_agent_id  uuid,
    p_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client   public.client%ROWTYPE;
    v_account  uuid;
    v_dup_id   uuid;
    v_dup_any  boolean;
    v_sends    integer;
    v_base     jsonb;
    v_user     record;
BEGIN
    SELECT c.* INTO v_client
      FROM public.client c
      JOIN public.agent a ON a.id = c.agent_id AND a.status <> 'archived'
     WHERE c.id = p_client_id
       AND c.agent_id = p_agent_id
       AND c.status <> 'merged_into';
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT pu.account_id INTO v_account
      FROM public.platform_user pu
     WHERE pu.client_id = v_client.id AND pu.role = 'client';

    SELECT o.id INTO v_dup_id
      FROM public.client o
     WHERE o.email = v_client.email
       AND o.id <> v_client.id
       AND o.status <> 'merged_into'
       AND o.archived_at IS NULL
       AND o.agent_id = p_agent_id
     ORDER BY o.created_at
     LIMIT 1;

    v_dup_any := v_dup_id IS NOT NULL OR EXISTS (
        SELECT 1 FROM public.client o
         WHERE o.email = v_client.email
           AND o.id <> v_client.id
           AND o.status <> 'merged_into'
           AND o.archived_at IS NULL
    );

    SELECT count(*)::integer INTO v_sends
      FROM public.audit_event e
     WHERE e.target_entity = 'client'
       AND e.target_id = v_client.id
       AND e.event_type = 'client.signin_email_requested'
       AND e.created_at > now() - interval '1 hour';

    v_base := jsonb_build_object(
        'clientId',               v_client.id,
        'firstName',              v_client.first_name,
        'lastName',               v_client.last_name,
        'clientEmail',            v_client.email,
        'clientArchived',         v_client.archived_at IS NOT NULL,
        'duplicateEmail',         v_dup_any,
        'duplicateEmailClientId', v_dup_id,
        'signInEmailsLastHour',   v_sends,
        'hasSignIn',              v_account IS NOT NULL
    );

    IF v_account IS NULL THEN
        RETURN v_base;
    END IF;

    SELECT u.email,
           u.email_confirmed_at,
           u.invited_at,
           u.banned_until,
           (u.encrypted_password IS NOT NULL AND u.encrypted_password <> '') AS has_password
      INTO v_user
      FROM auth.users u
     WHERE u.id = v_account;

    RETURN v_base || jsonb_build_object(
        'accountId',        v_account,
        'signInEmail',      v_user.email,
        'emailVerifiedAt',  v_user.email_confirmed_at,
        'invitedAt',        v_user.invited_at,
        'hasPassword',      coalesce(v_user.has_password, false),
        'providers',        coalesce((
            SELECT jsonb_agg(DISTINCT i.provider ORDER BY i.provider)
              FROM auth.identities i WHERE i.user_id = v_account
        ), '[]'::jsonb),
        'mfaEnrolled',      EXISTS (
            SELECT 1 FROM auth.mfa_factors f
             WHERE f.user_id = v_account AND f.status = 'verified'
        ),
        'lockedAt',         (SELECT a.locked_at FROM public.account a WHERE a.id = v_account),
        'lockedReason',     (SELECT a.locked_reason FROM public.account a WHERE a.id = v_account),
        'bannedUntil',      v_user.banned_until,
        'lastLoginAt',      (SELECT a.last_login_at FROM public.account a WHERE a.id = v_account),
        'sessions',         coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                       'id',           s.id,
                       'startedAt',    s.created_at,
                       -- refreshed_at is `timestamp` WITHOUT zone, written in UTC.
                       'lastActiveAt', coalesce(s.refreshed_at AT TIME ZONE 'UTC', s.updated_at, s.created_at),
                       'userAgent',    s.user_agent,
                       'ip',           host(s.ip)
                   ) ORDER BY coalesce(s.refreshed_at AT TIME ZONE 'UTC', s.updated_at, s.created_at) DESC)
              FROM auth.sessions s
             WHERE s.user_id = v_account
               AND (s.not_after IS NULL OR s.not_after > now())
        ), '[]'::jsonb),
        'activity',         coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                       'id',        ev.id,
                       'at',        ev.created_at,
                       'userAgent', ev.user_agent,
                       'ip',        host(ev.ip_address),
                       'flagged',   fl.auth_event_id IS NOT NULL
                   ) ORDER BY ev.created_at DESC)
              FROM (
                  SELECT * FROM public.auth_event e
                   WHERE e.account_id = v_account
                     AND e.event_type = 'login_success'
                     AND e.created_at > now() - interval '90 days'
                   ORDER BY e.created_at DESC
                   LIMIT 200
              ) ev
              LEFT JOIN public.auth_event_flag fl ON fl.auth_event_id = ev.id
        ), '[]'::jsonb)
    );
END;
$$;

COMMENT ON FUNCTION public.account_admin_target(uuid, uuid) IS
    'Screen 3.9.1''s status snapshot for one of p_agent_id''s clients, or NULL. Service-role '
    'only: p_agent_id is trusted input. The authenticated door is agent_client_account_admin().';

-- The tab's read. aal2 is checked HERE, in the database, from the verified JWT, so a session
-- that skipped the challenge reads nothing, whatever the web proxy does.
CREATE OR REPLACE FUNCTION public.agent_client_account_admin(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_agent uuid := public.current_agent_id();
    v_snap  jsonb;
BEGIN
    IF v_agent IS NULL THEN
        RETURN NULL;
    END IF;

    v_snap := public.account_admin_target(v_agent, p_client_id);
    IF v_snap IS NULL THEN
        RETURN NULL;
    END IF;

    IF coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
        -- Only enough to draw the gate: never the account's state.
        RETURN jsonb_build_object(
            'needsMfa',       true,
            'agentHasFactor', EXISTS (
                SELECT 1 FROM auth.mfa_factors f
                 WHERE f.user_id = auth.uid() AND f.status = 'verified'
            )
        );
    END IF;

    RETURN v_snap || jsonb_build_object('needsMfa', false);
END;
$$;

COMMENT ON FUNCTION public.agent_client_account_admin(uuid) IS
    'Screen 3.9.1 for the signed-in advisor. NULL when the client is not theirs; '
    '{needsMfa: true} until the session is aal2.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Writes. Each takes the audit row's id and actor and writes it in its own transaction.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.account_admin_audit(
    p_audit_id      uuid,
    p_actor_user_id uuid,
    p_event_type    text,
    p_client_id     uuid,
    p_metadata      jsonb,
    p_ip            text,
    p_user_agent    text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ip inet;
BEGIN
    IF p_audit_id IS NULL OR p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'account admin writes owe an audit row: audit id and actor are required';
    END IF;
    BEGIN
        v_ip := nullif(btrim(split_part(p_ip, ',', 1)), '')::inet;
    EXCEPTION WHEN invalid_text_representation THEN
        v_ip := NULL;
    END;
    INSERT INTO public.audit_event
        (id, actor_user_id, actor_role, event_type, target_entity, target_id,
         metadata, ip_address, user_agent)
    VALUES
        (p_audit_id, p_actor_user_id, 'agent', p_event_type, 'client', p_client_id,
         coalesce(p_metadata, '{}'::jsonb), v_ip, left(p_user_agent, 500));
END;
$$;

-- Locks the client row so two concurrent sends cannot both read "2 sent" and both go.
-- FOR NO KEY UPDATE, not FOR UPDATE: nothing here changes the key, and FOR UPDATE would also
-- block every insert that references the client (trips, messages) for the length of the call.
CREATE OR REPLACE FUNCTION public.account_admin_lock_client(
    p_agent_id  uuid,
    p_client_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM 1
       FROM public.client c
       JOIN public.agent a ON a.id = c.agent_id AND a.status <> 'archived'
      WHERE c.id = p_client_id
        AND c.agent_id = p_agent_id
        AND c.status <> 'merged_into'
        FOR NO KEY UPDATE OF c;
    RETURN FOUND;
END;
$$;

-- 'claimed' | 'capped' | 'not_found'. The cap covers reset, magic link and invite together.
CREATE OR REPLACE FUNCTION public.account_admin_claim_signin_email(
    p_agent_id      uuid,
    p_actor_user_id uuid,
    p_audit_id      uuid,
    p_client_id     uuid,
    p_kind          text,
    p_ip            text DEFAULT NULL,
    p_user_agent    text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sent integer;
BEGIN
    IF p_kind NOT IN ('reset', 'magic_link', 'invite') THEN
        RAISE EXCEPTION 'unknown sign-in email kind %', p_kind
              USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NOT public.account_admin_lock_client(p_agent_id, p_client_id) THEN
        RETURN 'not_found';
    END IF;

    SELECT count(*)::integer INTO v_sent
      FROM public.audit_event e
     WHERE e.target_entity = 'client'
       AND e.target_id = p_client_id
       AND e.event_type = 'client.signin_email_requested'
       AND e.created_at > now() - interval '1 hour';

    IF v_sent >= 3 THEN
        RETURN 'capped';
    END IF;

    PERFORM public.account_admin_audit(
        p_audit_id, p_actor_user_id, 'client.signin_email_requested', p_client_id,
        jsonb_build_object('kind', p_kind), p_ip, p_user_agent);
    RETURN 'claimed';
END;
$$;

COMMENT ON FUNCTION public.account_admin_claim_signin_email(uuid, uuid, uuid, uuid, text, text, text) IS
    'Claims one of a client''s 3 sign-in emails per hour (Screen 3.9.2/3.9.3, invite) and '
    'writes its audit row. Called BEFORE the link is made; the row never holds the link.';

-- Lock: sets account.locked_at / locked_reason and ends every session. Unlock clears both.
-- The GoTrue ban is the Edge Function's, through the Admin API, before this runs.
-- Returns NULL when the client is not the advisor's or has no sign-in.
CREATE OR REPLACE FUNCTION public.account_admin_set_lock(
    p_agent_id      uuid,
    p_actor_user_id uuid,
    p_audit_id      uuid,
    p_client_id     uuid,
    p_lock          boolean,
    p_reason        text,
    p_ip            text DEFAULT NULL,
    p_user_agent    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_account uuid;
    v_reason  text := nullif(btrim(p_reason), '');
    v_ended   integer := 0;
    v_was     timestamptz;
BEGIN
    IF v_reason IS NULL OR char_length(v_reason) > 500 THEN
        RAISE EXCEPTION 'a reason of 1 to 500 characters is required'
              USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF NOT public.account_admin_lock_client(p_agent_id, p_client_id) THEN
        RETURN NULL;
    END IF;

    SELECT pu.account_id INTO v_account
      FROM public.platform_user pu
     WHERE pu.client_id = p_client_id AND pu.role = 'client';
    IF v_account IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT a.locked_at INTO v_was FROM public.account a WHERE a.id = v_account FOR UPDATE;

    IF p_lock THEN
        UPDATE public.account
           SET locked_at = coalesce(locked_at, now()),
               locked_reason = v_reason,
               updated_at = now()
         WHERE id = v_account;

        -- GoTrue's own global sign-out is this delete; refresh tokens cascade with it.
        WITH gone AS (
            DELETE FROM auth.sessions s WHERE s.user_id = v_account RETURNING 1
        )
        SELECT count(*)::integer INTO v_ended FROM gone;
    ELSE
        UPDATE public.account
           SET locked_at = NULL,
               locked_reason = NULL,
               updated_at = now()
         WHERE id = v_account;
    END IF;

    PERFORM public.account_admin_audit(
        p_audit_id, p_actor_user_id,
        CASE WHEN p_lock THEN 'client.account_locked' ELSE 'client.account_unlocked' END,
        p_client_id,
        jsonb_build_object(
            'accountId', v_account,
            'reason', v_reason,
            'sessionsEnded', v_ended,
            'wasLocked', v_was IS NOT NULL),
        p_ip, p_user_agent);

    RETURN jsonb_build_object('accountId', v_account, 'sessionsEnded', v_ended);
END;
$$;

-- "Sign out everywhere" without a lock. NULL when not the advisor's / no sign-in.
CREATE OR REPLACE FUNCTION public.account_admin_sign_out_everywhere(
    p_agent_id      uuid,
    p_actor_user_id uuid,
    p_audit_id      uuid,
    p_client_id     uuid,
    p_ip            text DEFAULT NULL,
    p_user_agent    text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_account uuid;
    v_ended   integer;
BEGIN
    IF NOT public.account_admin_lock_client(p_agent_id, p_client_id) THEN
        RETURN NULL;
    END IF;

    SELECT pu.account_id INTO v_account
      FROM public.platform_user pu
     WHERE pu.client_id = p_client_id AND pu.role = 'client';
    IF v_account IS NULL THEN
        RETURN NULL;
    END IF;

    WITH gone AS (
        DELETE FROM auth.sessions s WHERE s.user_id = v_account RETURNING 1
    )
    SELECT count(*)::integer INTO v_ended FROM gone;

    PERFORM public.account_admin_audit(
        p_audit_id, p_actor_user_id, 'client.signed_out_everywhere', p_client_id,
        jsonb_build_object('accountId', v_account, 'sessionsEnded', v_ended),
        p_ip, p_user_agent);

    RETURN v_ended;
END;
$$;

-- Flag / unflag one sign-in. 'changed' | 'noop' | 'not_found'.
CREATE OR REPLACE FUNCTION public.account_admin_set_flag(
    p_agent_id      uuid,
    p_actor_user_id uuid,
    p_audit_id      uuid,
    p_client_id     uuid,
    p_auth_event_id uuid,
    p_flag          boolean,
    p_ip            text DEFAULT NULL,
    p_user_agent    text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rows integer;
BEGIN
    IF NOT public.account_admin_lock_client(p_agent_id, p_client_id) THEN
        RETURN 'not_found';
    END IF;

    -- The sign-in must be THIS client's, or an advisor could flag (and so learn the existence
    -- of) any auth_event id.
    PERFORM 1
       FROM public.auth_event e
       JOIN public.platform_user pu ON pu.account_id = e.account_id AND pu.role = 'client'
      WHERE e.id = p_auth_event_id
        AND pu.client_id = p_client_id
        AND e.event_type = 'login_success';
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;

    IF p_flag THEN
        INSERT INTO public.auth_event_flag (auth_event_id, flagged_by_agent_id)
        VALUES (p_auth_event_id, p_agent_id)
        ON CONFLICT (auth_event_id) DO NOTHING;
    ELSE
        DELETE FROM public.auth_event_flag WHERE auth_event_id = p_auth_event_id;
    END IF;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
        RETURN 'noop';
    END IF;

    PERFORM public.account_admin_audit(
        p_audit_id, p_actor_user_id,
        CASE WHEN p_flag THEN 'client.signin_flagged' ELSE 'client.signin_unflagged' END,
        p_client_id, jsonb_build_object('authEventId', p_auth_event_id),
        p_ip, p_user_agent);
    RETURN 'changed';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5b. The invite binds to THIS client when it is made, not when it is accepted
--
-- generateLink(type: invite) creates the auth user at once, and handle_new_user() gives it a
-- fresh blank client. Left alone, two things go wrong:
--   * the blank row sits in the advisor's roster as a second "Nora" until she accepts, and a
--     failed send leaves it there for good, where it blocks every later invite as a duplicate;
--   * on acceptance, handle_user_email_confirmed() adopts by EMAIL, so a same-email record made
--     in between would be adopted instead, and the real record (trips and all) archived.
--
-- So the Edge Function calls this straight after generateLink. It points the new sign-in at the
-- client the advisor invited, removes the blank row, and marks the auth user
-- (`raw_app_meta_data.invited_client_id`) so the confirmation trigger leaves the binding alone.
--
-- WHY BINDING BEFORE THE CLICK IS SAFE, when §5.1.1 forbids adopting at sign-up: that rule
-- exists because anyone can TYPE an address into a sign-up form. Here the advisor chose the
-- record, the address is the one on that record, and nobody receives a session until the link
-- mailed to that address is opened. Proof of the mailbox still comes first; only the choice of
-- record moves earlier, and an advisor made it rather than an inference.
--
-- `raw_app_meta_data` is server-controlled (no client can write it) and is written here, in the
-- same transaction as the binding, so the two cannot disagree.
--
-- 'bound' | 'already' | 'not_found' | 'conflict'.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.account_admin_bind_invite(
    p_agent_id      uuid,
    p_actor_user_id uuid,
    p_audit_id      uuid,
    p_client_id     uuid,
    p_account_id    uuid,
    p_ip            text DEFAULT NULL,
    p_user_agent    text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pu      public.platform_user%ROWTYPE;
    v_client  public.client%ROWTYPE;
    v_fresh   public.client%ROWTYPE;
    v_user    record;
BEGIN
    IF NOT public.account_admin_lock_client(p_agent_id, p_client_id) THEN
        RETURN 'not_found';
    END IF;
    SELECT * INTO v_client FROM public.client WHERE id = p_client_id;

    SELECT u.id, u.email, u.email_confirmed_at, u.created_at INTO v_user
      FROM auth.users u WHERE u.id = p_account_id FOR UPDATE;
    IF NOT FOUND OR v_user.email IS DISTINCT FROM v_client.email::text THEN
        RETURN 'conflict';
    END IF;

    SELECT * INTO v_pu FROM public.platform_user
     WHERE account_id = p_account_id FOR UPDATE;
    IF NOT FOUND OR v_pu.role <> 'client' THEN
        RETURN 'conflict';
    END IF;

    IF v_pu.client_id = p_client_id THEN
        -- A resend: already bound. Make sure the marker is there too.
        UPDATE auth.users
           SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                                   || jsonb_build_object('invited_client_id', p_client_id)
         WHERE id = p_account_id
           AND (raw_app_meta_data ->> 'invited_client_id') IS DISTINCT FROM p_client_id::text;
        RETURN 'already';
    END IF;

    -- Only an UNCONFIRMED sign-in whose client is the blank row handle_new_user() just made, and
    -- only onto a client nobody has claimed. Anything else is not an invite we created.
    IF v_user.email_confirmed_at IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.platform_user pu WHERE pu.client_id = p_client_id) THEN
        RETURN 'conflict';
    END IF;

    SELECT * INTO v_fresh FROM public.client WHERE id = v_pu.client_id FOR UPDATE;
    IF NOT FOUND
       OR v_fresh.agent_id <> p_agent_id
       OR EXISTS (SELECT 1 FROM public.trip t WHERE t.client_id = v_fresh.id)
       OR EXISTS (SELECT 1 FROM public.conversation cv WHERE cv.client_id = v_fresh.id) THEN
        RETURN 'conflict';
    END IF;

    UPDATE public.platform_user
       SET client_id = p_client_id,
           display_name = trim(v_client.first_name || ' ' || v_client.last_name),
           updated_at = now()
     WHERE id = v_pu.id;

    BEGIN
        DELETE FROM public.client WHERE id = v_fresh.id;
    EXCEPTION WHEN foreign_key_violation THEN
        UPDATE public.client
           SET status = 'archived', archived_at = now(), updated_at = now()
         WHERE id = v_fresh.id;
    END;

    UPDATE auth.users
       SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                               || jsonb_build_object('invited_client_id', p_client_id)
     WHERE id = p_account_id;

    PERFORM public.account_admin_audit(
        p_audit_id, p_actor_user_id, 'client.invited', p_client_id,
        jsonb_build_object('accountId', p_account_id), p_ip, p_user_agent);
    RETURN 'bound';
END;
$$;

COMMENT ON FUNCTION public.account_admin_bind_invite(uuid, uuid, uuid, uuid, uuid, text, text) IS
    'Points an advisor-invited sign-in at the invited client and marks it so the confirmation '
    'trigger does not re-adopt by email. Screen Inventory §3.9 (invite), Data-Model §5.1.1.';

-- The confirmation trigger, unchanged except for the first test after the lookup.
CREATE OR REPLACE FUNCTION public.handle_user_email_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user        public.platform_user;
    v_claim_id    uuid;
    v_match_count integer;
    v_throwaway   uuid;
BEGIN
    SELECT * INTO v_user FROM public.platform_user WHERE account_id = NEW.id;

    -- Agents and admins are provisioned deliberately, not by self-registration, and have
    -- no client row to adopt.
    IF NOT FOUND OR v_user.role <> 'client' OR v_user.client_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- An advisor's invite (§3.9) was bound to its client when it was made. Re-adopting by email
    -- here could move the traveler onto a same-email record made since, and archive the real one.
    IF NEW.raw_app_meta_data ? 'invited_client_id' THEN
        RETURN NEW;
    END IF;

    -- The row this signup created is excluded from its own candidate search — it shares the
    -- email and is, briefly, unclaimed-looking from the wrong angle.
    WITH unclaimed AS (
        SELECT c.id
          FROM public.client c
         WHERE c.email = NEW.email
           AND c.id <> v_user.client_id
           AND c.status = 'active'
           AND c.archived_at IS NULL
           AND NOT EXISTS (
                 SELECT 1 FROM public.platform_user pu WHERE pu.client_id = c.id
               )
         -- Two is all the information needed: one is a match, more than one is ambiguous.
         LIMIT 2
    )
    SELECT count(*)::integer, (SELECT id FROM unclaimed LIMIT 1)
      INTO v_match_count, v_claim_id
      FROM unclaimed;

    IF v_match_count <> 1 THEN
        RETURN NEW;
    END IF;

    v_throwaway := v_user.client_id;

    -- The agent's spelling wins for the display name too.
    UPDATE public.platform_user pu
       SET client_id = v_claim_id,
           display_name = (
               SELECT trim(c.first_name || ' ' || c.last_name)
               FROM public.client c WHERE c.id = v_claim_id
           ),
           updated_at = now()
     WHERE pu.id = v_user.id;

    -- Dispose of the blank row the signup made; archive instead if anything points at it, so a
    -- confirmation can never fail on cleanup.
    BEGIN
        DELETE FROM public.client WHERE id = v_throwaway;
    EXCEPTION
        WHEN foreign_key_violation THEN
            UPDATE public.client
               SET status = 'archived', archived_at = now(), updated_at = now()
             WHERE id = v_throwaway;
    END;

    RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Grants
--
-- Naming anon and authenticated is load-bearing: Supabase grants EXECUTE on new public
-- functions to them BY NAME, so `FROM public` alone leaves them in.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.account_admin_target(uuid, uuid)',
        'public.account_admin_audit(uuid, uuid, text, uuid, jsonb, text, text)',
        'public.account_admin_lock_client(uuid, uuid)',
        'public.account_admin_claim_signin_email(uuid, uuid, uuid, uuid, text, text, text)',
        'public.account_admin_set_lock(uuid, uuid, uuid, uuid, boolean, text, text, text)',
        'public.account_admin_sign_out_everywhere(uuid, uuid, uuid, uuid, text, text)',
        'public.account_admin_set_flag(uuid, uuid, uuid, uuid, uuid, boolean, text, text)',
        'public.account_admin_bind_invite(uuid, uuid, uuid, uuid, uuid, text, text)'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.agent_client_account_admin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.agent_client_account_admin(uuid) TO authenticated, service_role;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
DECLARE leaked text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'account\_admin\_%' OR p.proname = 'record_auth_session_start')
       AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR has_function_privilege('anon', p.oid, 'EXECUTE'));
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'account admin functions executable by a client role: %', leaked;
    END IF;

    IF has_function_privilege('anon', 'public.agent_client_account_admin(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon can execute agent_client_account_admin';
    END IF;

    IF has_table_privilege('authenticated', 'public.auth_event_flag', 'SELECT')
       OR has_table_privilege('anon', 'public.auth_event_flag', 'SELECT')
       OR has_table_privilege('authenticated', 'public.auth_event', 'SELECT') THEN
        RAISE EXCEPTION 'a client role can read auth_event or auth_event_flag';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'on_auth_session_created'
           AND tgrelid = 'auth.sessions'::regclass
    ) THEN
        RAISE EXCEPTION 'on_auth_session_created trigger is missing';
    END IF;
END $$;

COMMIT;
