-- §3.10 Stage 1: the advisor's inbox and thread (Screens 3.10.1 and 3.10.2).
--
-- The client side of messaging shipped with §2.6: inbox, threads, attachments, and the
-- `trip-message` Edge Function. The advisor could only read. This adds the advisor's reads,
-- the advisor's send, the inbox's archive, and the read-clearing BOTH sides have lacked.
--
-- ── WHAT GYASI RULED (2026-10-13) ───────────────────────────────────────────────────────
--
--   * IN-APP FIRST. Email is Stage 4; nothing here sends one.
--   * OVERDUE ("past SLA" on the artboard) IS ONE BUSINESS DAY, SUNDAYS NEVER COUNT. Rest is
--     not lateness. See conversation_reply_due_at().
--
-- ── THREE THINGS THIS FILE IS CAREFUL ABOUT ─────────────────────────────────────────────
--
--   1. `conversation.last_message_at` and `last_message_preview` are in the CLIENT's column
--      grant. An internal note must never move them, or the client reads the advisor's
--      private note as their inbox preview. Only a client-visible reply does.
--   2. `conversation.archived_at` is not an inbox archive. The client's read policy hides an
--      archived thread entirely and `trip-message` skips it, so "archive" on the advisor's
--      side would have deleted the thread from the client's view. The inbox gets its own
--      `agent_archived_at`, withheld from the client.
--   3. `client_unread_count` was never raised or cleared by anything (seed hand-writes a 2).
--      §2.6 left that on purpose: "the increment and the clearing belong to the agent send
--      path and arrive together". They arrive here, together.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The inbox's own archive, and one live thread per trip
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.conversation ADD COLUMN agent_archived_at timestamptz;

COMMENT ON COLUMN public.conversation.agent_archived_at IS
    'Archived from the ADVISOR''s inbox (Screen 3.10.1): the last_message_at the advisor archived '
    'through. Counts only while nothing client-visible has been written since '
    '(agent_archived_at >= last_message_at), so the next message brings the thread back. NOT '
    'archived_at, which removes the thread for the client. Withheld from the client grant.';

-- A second live thread may ALREADY exist: `trip-message` finds-or-creates in separate round
-- trips, so a double-submitted first message could have made two. The indexes below would then
-- fail to build and take the whole migration with them. Say which rows, rather than leave a
-- bare "could not create unique index" in a deploy log. (Merging them is a decision about a
-- client's history, so it is not made silently here.)
DO $$
DECLARE dupes text;
BEGIN
    SELECT string_agg(format('client %s, trip %s: %s', client_id, coalesce(trip_id::text, 'none'), ids), '; ')
      INTO dupes
      FROM (SELECT client_id, trip_id, string_agg(id::text, ', ' ORDER BY created_at) AS ids
              FROM public.conversation
             WHERE archived_at IS NULL
             GROUP BY client_id, trip_id
            HAVING count(*) > 1) d;
    IF dupes IS NOT NULL THEN
        RAISE EXCEPTION 'more than one live thread for the same client and trip; merge or archive all but one first: %', dupes;
    END IF;
END $$;

-- Both writers find-or-create a live thread per (client, trip) and per client with no trip.
-- Nothing stopped the client and the advisor each creating one at the same moment; a second
-- live thread would then break every later lookup (maybeSingle on two rows is an error).
CREATE UNIQUE INDEX conversation_one_live_trip_thread
    ON public.conversation (client_id, trip_id)
    WHERE archived_at IS NULL AND trip_id IS NOT NULL;
CREATE UNIQUE INDEX conversation_one_live_general_thread
    ON public.conversation (client_id)
    WHERE archived_at IS NULL AND trip_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- The preview `trip-message` writes, in SQL: one line, 140 characters, cut on a word boundary
-- when one is within the last 20. Kept identical so the inbox reads the same whoever wrote.
CREATE OR REPLACE FUNCTION public.message_preview(p_body text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_line  text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
    v_cut   text;
    v_space integer;
BEGIN
    IF length(v_line) <= 140 THEN
        RETURN v_line;
    END IF;
    v_cut := left(v_line, 140);
    -- 0-based index of the last space, as the TypeScript's lastIndexOf; -1 when none.
    v_space := CASE WHEN strpos(reverse(v_cut), ' ') = 0 THEN -1
                    ELSE length(v_cut) - strpos(reverse(v_cut), ' ') END;
    RETURN CASE WHEN v_space > 120 THEN left(v_cut, v_space) ELSE v_cut END || '…';
END;
$$;

-- When a reply falls due (Gyasi, 2026-10-13): the end of the next business day after
-- `p_since`, in the advisor's zone, Monday to Saturday. Saturday's and Sunday's messages
-- are both due at the end of Monday; Friday's at the end of Saturday.
CREATE OR REPLACE FUNCTION public.conversation_reply_due_at(p_since timestamptz, p_time_zone text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_next date;
BEGIN
    IF p_since IS NULL THEN
        RETURN NULL;
    END IF;
    v_next := (p_since AT TIME ZONE p_time_zone)::date + 1;
    IF extract(isodow FROM v_next) = 7 THEN
        v_next := v_next + 1;
    END IF;
    -- The midnight that ENDS the due day, in the advisor's zone.
    RETURN (v_next + 1)::timestamp AT TIME ZONE p_time_zone;
END;
$$;

-- The advisor's threads: theirs on the conversation AND, for a trip thread, on the trip (the
-- two-agent-id rule every agent read uses), not removed for the client, and not on a client
-- merged into another (agent_client_conversations' rule). With, per thread, what the inbox
-- derives: who spoke last, since when a reply is owed, and whether it is archived from the
-- inbox.
--
-- A thread with an ARCHIVED client or trip stays: the client can still write in it, so the
-- advisor can still answer. Starting a NEW thread needs a live client and trip
-- (agent_message_target, agent_send_message's client path).
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
      -- The last message the CLIENT can see. Internal notes are the advisor's own and never
      -- answer anyone.
      LEFT JOIN LATERAL (
            SELECT m.sender_role, m.created_at
              FROM public.message m
             WHERE m.conversation_id = cv.id AND m.archived_at IS NULL AND NOT m.is_internal_note
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT 1
           ) last_seen ON true
      -- Since when a reply is owed: the FIRST client message after the advisor's last
      -- client-visible reply. Null when the advisor spoke last.
      LEFT JOIN LATERAL (
            SELECT min(m.created_at) AS awaiting_since
              FROM public.message m
             WHERE m.conversation_id = cv.id AND m.archived_at IS NULL AND NOT m.is_internal_note
               AND m.sender_role = 'client'
               AND last_seen.sender_role = 'client'
               AND m.created_at > coalesce((
                     SELECT max(r.created_at) FROM public.message r
                      WHERE r.conversation_id = cv.id AND r.archived_at IS NULL
                        AND NOT r.is_internal_note AND r.sender_role <> 'client'), '-infinity')
           ) w ON true
     WHERE cv.agent_id = me.agent_id
       AND cv.archived_at IS NULL
       AND c.status <> 'merged_into'
       AND (cv.trip_id IS NULL OR t.agent_id = me.agent_id);
$$;

COMMENT ON FUNCTION public.agent_threads_for_current_agent() IS
    'The one definition of "my threads" (§3.10): conversation.agent_id and, for a trip thread, '
    'trip.agent_id are the caller, and the client has not lost the thread. Derives last sender, '
    'awaiting_since, reply_due_at, overdue and the inbox archive. Not executable by any client '
    'role; reached only through the definer accessors.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The advisor's reads
-- ─────────────────────────────────────────────────────────────────────────────

-- Screen 3.10.1's list. Filters: archived view, unread, overdue, one client, one trip, and a
-- search over names (preferred and legal), trip, subject and every message body (notes included: they are the
-- advisor's own). Newest first; total_count is the filtered count, for paging.
CREATE OR REPLACE FUNCTION public.agent_message_threads(
    p_archived  boolean DEFAULT false,
    p_unread    boolean DEFAULT false,
    p_overdue   boolean DEFAULT false,
    p_client_id uuid    DEFAULT NULL,
    p_trip_id   uuid    DEFAULT NULL,
    p_search    text    DEFAULT NULL,
    p_limit     integer DEFAULT 50,
    p_offset    integer DEFAULT 0
)
RETURNS TABLE (
    conversation_id      uuid,
    client_id            uuid,
    client_display_name  text,
    trip_id              uuid,
    trip_title           text,
    subject              text,
    last_message_at      timestamptz,
    last_message_preview text,
    last_sender_role     text,
    agent_unread_count   integer,
    reply_due_at         timestamptz,
    overdue              boolean,
    archived             boolean,
    total_count          integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH q AS (
        -- A search is a phrase, not a pattern: LIKE's own wildcards are escaped.
        SELECT nullif(btrim(left(coalesce(p_search, ''), 100)), '') AS raw
    ), pat AS (
        SELECT CASE WHEN q.raw IS NULL THEN NULL
                    ELSE '%' || replace(replace(replace(q.raw, '\', '\\'), '%', '\%'), '_', '\_') || '%'
               END AS like_pattern
          FROM q
    )
    SELECT th.conversation_id, th.client_id, th.client_display_name, th.trip_id, th.trip_title,
           th.subject, th.last_message_at, th.last_message_preview, th.last_sender_role,
           th.agent_unread_count, th.reply_due_at, th.overdue, th.archived,
           (count(*) OVER ())::integer
      FROM public.agent_threads_for_current_agent() th
      JOIN public.client c ON c.id = th.client_id
     CROSS JOIN pat
     WHERE th.archived = coalesce(p_archived, false)
       AND (NOT coalesce(p_unread, false)  OR th.agent_unread_count > 0)
       AND (NOT coalesce(p_overdue, false) OR th.overdue)
       AND (p_client_id IS NULL OR th.client_id = p_client_id)
       AND (p_trip_id   IS NULL OR th.trip_id   = p_trip_id)
       AND (pat.like_pattern IS NULL
            OR th.client_display_name ILIKE pat.like_pattern
            -- "Jonathan" finds the client who goes by Jon.
            OR (c.first_name || ' ' || c.last_name) ILIKE pat.like_pattern
            OR th.trip_title          ILIKE pat.like_pattern
            OR th.subject             ILIKE pat.like_pattern
            OR EXISTS (SELECT 1 FROM public.message m
                        WHERE m.conversation_id = th.conversation_id AND m.archived_at IS NULL
                          AND m.body ILIKE pat.like_pattern))
     ORDER BY th.last_message_at DESC, th.conversation_id
     LIMIT  greatest(1, least(coalesce(p_limit, 50), 200))
     OFFSET greatest(0, coalesce(p_offset, 0));
$$;

-- The inbox header ("5 unread · 2 overdue"), over every open thread whatever the filters.
CREATE OR REPLACE FUNCTION public.agent_message_summary()
RETURNS TABLE (
    open_threads    integer,
    unread_threads  integer,
    unread_messages integer,
    overdue_threads integer,
    archived_threads integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT count(*) FILTER (WHERE NOT th.archived)::integer,
           count(*) FILTER (WHERE NOT th.archived AND th.agent_unread_count > 0)::integer,
           coalesce(sum(th.agent_unread_count) FILTER (WHERE NOT th.archived), 0)::integer,
           count(*) FILTER (WHERE NOT th.archived AND th.overdue)::integer,
           count(*) FILTER (WHERE th.archived)::integer
      FROM public.agent_threads_for_current_agent() th
     -- Zero rows, not a row of zeros, for anyone who is not an advisor.
     WHERE public.current_agent_id() IS NOT NULL
    HAVING public.current_agent_id() IS NOT NULL;
$$;

-- Screen 3.10.2's header. Zero rows for a thread that is not the caller's.
CREATE OR REPLACE FUNCTION public.agent_conversation(p_conversation_id uuid)
RETURNS TABLE (
    conversation_id     uuid,
    client_id           uuid,
    client_display_name text,
    client_first_name   text,
    trip_id             uuid,
    trip_title          text,
    subject             text,
    agent_unread_count  integer,
    reply_due_at        timestamptz,
    overdue             boolean,
    archived            boolean,
    -- Whether the client can sign in to read it. Without a login the reply waits for them.
    client_can_sign_in  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT th.conversation_id, th.client_id, th.client_display_name, th.client_first_name,
           th.trip_id, th.trip_title, th.subject, th.agent_unread_count,
           th.reply_due_at, th.overdue, th.archived,
           EXISTS (SELECT 1 FROM public.platform_user pu
                    WHERE pu.client_id = th.client_id AND pu.role = 'client')
      FROM public.agent_threads_for_current_agent() th
     WHERE th.conversation_id = p_conversation_id;
$$;

-- Screen 3.10.2's messages, internal notes included, with each one's attachments by name.
-- The newest 500 in time order; total_messages is the whole count, so a longer thread can say
-- so on screen without guessing from the row count.
CREATE OR REPLACE FUNCTION public.agent_conversation_messages(p_conversation_id uuid)
RETURNS TABLE (
    message_id       uuid,
    sender_role      text,
    body             text,
    is_internal_note boolean,
    created_at       timestamptz,
    attachments      jsonb,
    total_messages   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT x.id, x.sender_role, x.body, x.is_internal_note, x.created_at, x.attachments, x.total
      FROM (
        SELECT m.id, m.sender_role::text AS sender_role, m.body, m.is_internal_note, m.created_at,
               coalesce((SELECT jsonb_agg(jsonb_build_object(
                                   'document_id', d.id, 'filename', d.filename, 'kind', d.kind)
                                 ORDER BY d.filename)
                           FROM public.message_attachment ma
                           JOIN public.document d ON d.id = ma.document_id AND d.archived_at IS NULL
                          WHERE ma.message_id = m.id), '[]'::jsonb) AS attachments,
               -- Window functions run before LIMIT: this is every message, not the 500.
               (count(*) OVER ())::integer AS total
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

-- "Message client" (Client Detail, Trip Detail): who the new message is for, and the live
-- thread it belongs in if one already exists. Zero rows unless the client is the caller's and,
-- when given, the trip is the caller's and that client's.
CREATE OR REPLACE FUNCTION public.agent_message_target(p_client_id uuid, p_trip_id uuid DEFAULT NULL)
RETURNS TABLE (
    client_id           uuid,
    client_display_name text,
    client_first_name   text,
    trip_id             uuid,
    trip_title          text,
    conversation_id     uuid,
    client_can_sign_in  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT c.id,
           coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name,
           coalesce(c.preferred_name, c.first_name),
           t.id, t.title,
           (SELECT cv.id FROM public.conversation cv
             WHERE cv.client_id = c.id AND cv.archived_at IS NULL
               AND cv.trip_id IS NOT DISTINCT FROM p_trip_id
               AND cv.agent_id = c.agent_id
             LIMIT 1),
           EXISTS (SELECT 1 FROM public.platform_user pu
                    WHERE pu.client_id = c.id AND pu.role = 'client')
      FROM public.client c
      LEFT JOIN public.trip t ON t.id = p_trip_id
     WHERE c.id = p_client_id
       AND c.agent_id = public.current_agent_id()
       AND c.archived_at IS NULL
       AND c.status <> 'merged_into'
       AND (p_trip_id IS NULL
            OR (t.id IS NOT NULL AND t.client_id = c.id AND t.agent_id = c.agent_id
                AND t.archived_at IS NULL));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The advisor's writes (service_role, through the agent-message Edge Function)
-- ─────────────────────────────────────────────────────────────────────────────

-- Send, in one transaction: find or create the thread, insert the message, update the thread.
-- Addressed by an existing thread OR by a client (and optionally a trip), never both.
--
-- p_seen_up_to is the created_at of the newest message the advisor had on screen, or NULL when
-- they had none ("new message"). Writing in a thread reads it, but only up to there: a client
-- message that landed while they typed stays unread, so it cannot hide under the reply. (It
-- does count as answered for "overdue"; the unread badge is what flags it.)
--
-- Outcomes: 'sent', or 'note_needs_thread' (an internal note cannot START a thread: the
-- client would see a thread with nothing in it). Zero rows: not the caller's, or not there.
CREATE OR REPLACE FUNCTION public.agent_send_message(
    p_agent_id            uuid,
    p_actor_user_id       uuid,
    p_message_id          uuid,
    p_body                text,
    p_is_internal_note    boolean,
    -- DEFAULT NULL from here on: exactly one way of addressing is used per call, and the
    -- generated types then make the others optional rather than nullable.
    p_seen_up_to          timestamptz DEFAULT NULL,
    p_new_conversation_id uuid DEFAULT NULL,
    p_conversation_id     uuid DEFAULT NULL,
    p_client_id           uuid DEFAULT NULL,
    p_trip_id             uuid DEFAULT NULL
)
RETURNS TABLE (outcome text, conversation_id uuid, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_body       text := btrim(coalesce(p_body, ''));
    v_conv       public.conversation%ROWTYPE;
    v_trip_title text;
    v_now        timestamptz;
    v_unread     integer;
BEGIN
    -- The Edge Function checks all of this first, in English; these are the second lock.
    IF v_body = '' OR length(v_body) > 8000 THEN
        RAISE EXCEPTION 'a message is 1 to 8000 characters';
    END IF;
    -- No default: a missing flag must never turn a private note into a message the client reads.
    IF p_is_internal_note IS NULL THEN
        RAISE EXCEPTION 'say whether this is an internal note';
    END IF;
    IF p_message_id IS NULL THEN
        RAISE EXCEPTION 'a message needs its id';
    END IF;
    IF (p_conversation_id IS NULL) = (p_client_id IS NULL) THEN
        RAISE EXCEPTION 'address a message by a thread or by a client, not both and not neither';
    END IF;
    IF p_conversation_id IS NOT NULL AND p_trip_id IS NOT NULL THEN
        RAISE EXCEPTION 'a thread already has its trip';
    END IF;

    -- An archived advisor writes nothing, the rule every write on this side applies; and the
    -- actor is that advisor's own login.
    IF NOT EXISTS (SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived')
       OR NOT EXISTS (SELECT 1 FROM public.platform_user pu
                       WHERE pu.id = p_actor_user_id AND pu.agent_id = p_agent_id) THEN
        RETURN;
    END IF;

    IF p_conversation_id IS NOT NULL THEN
        -- The same scope as agent_threads_for_current_agent(): an archived client or trip can
        -- still be answered, a merged client cannot.
        SELECT cv.* INTO v_conv
          FROM public.conversation cv
          JOIN public.client c ON c.id = cv.client_id
          LEFT JOIN public.trip t ON t.id = cv.trip_id
         WHERE cv.id = p_conversation_id
           AND cv.agent_id = p_agent_id
           AND cv.archived_at IS NULL
           AND c.status <> 'merged_into'
           AND (cv.trip_id IS NULL OR t.agent_id = p_agent_id)
           FOR UPDATE OF cv;
        IF NOT FOUND THEN
            RETURN;
        END IF;
    ELSE
        -- A NEW thread, on the other hand, needs a live client and trip.
        IF NOT EXISTS (SELECT 1 FROM public.client c
                        WHERE c.id = p_client_id AND c.agent_id = p_agent_id
                          AND c.archived_at IS NULL AND c.status <> 'merged_into') THEN
            RETURN;
        END IF;
        IF p_trip_id IS NOT NULL THEN
            SELECT t.title INTO v_trip_title FROM public.trip t
             WHERE t.id = p_trip_id AND t.agent_id = p_agent_id AND t.client_id = p_client_id
               AND t.archived_at IS NULL;
            IF NOT FOUND THEN
                RETURN;
            END IF;
        END IF;

        SELECT cv.* INTO v_conv FROM public.conversation cv
         WHERE cv.client_id = p_client_id AND cv.archived_at IS NULL
           AND cv.trip_id IS NOT DISTINCT FROM p_trip_id
           FOR UPDATE;

        IF NOT FOUND THEN
            IF p_is_internal_note THEN
                RETURN QUERY SELECT 'note_needs_thread'::text, NULL::uuid, NULL::timestamptz;
                RETURN;
            END IF;
            IF p_new_conversation_id IS NULL THEN
                RAISE EXCEPTION 'a new thread needs its id';
            END IF;
            -- The client may be creating this thread at the same moment. ON CONFLICT waits for
            -- theirs to commit and then does nothing, and the select below picks it up. The
            -- arbiter is named, so a clash on the new id itself still raises.
            IF p_trip_id IS NULL THEN
                INSERT INTO public.conversation
                    (id, client_id, agent_id, trip_id, subject, last_message_at,
                     last_message_preview, client_unread_count, agent_unread_count)
                VALUES (p_new_conversation_id, p_client_id, p_agent_id, NULL,
                        -- A general thread has no title to borrow; the inbox falls back itself.
                        NULL, clock_timestamp(), NULL, 0, 0)
                ON CONFLICT (client_id) WHERE archived_at IS NULL AND trip_id IS NULL DO NOTHING;
            ELSE
                INSERT INTO public.conversation
                    (id, client_id, agent_id, trip_id, subject, last_message_at,
                     last_message_preview, client_unread_count, agent_unread_count)
                VALUES (p_new_conversation_id, p_client_id, p_agent_id, p_trip_id,
                        -- The trip's title, as trip-message names the threads it creates.
                        v_trip_title, clock_timestamp(), NULL, 0, 0)
                ON CONFLICT (client_id, trip_id) WHERE archived_at IS NULL AND trip_id IS NOT NULL
                DO NOTHING;
            END IF;
            SELECT cv.* INTO v_conv FROM public.conversation cv
             WHERE cv.client_id = p_client_id AND cv.archived_at IS NULL
               AND cv.trip_id IS NOT DISTINCT FROM p_trip_id
               FOR UPDATE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'the thread could not be created';
            END IF;
        END IF;

        -- Found, or just made by the client: either way it may be filed under another advisor,
        -- and then it is not this caller's to write in.
        IF v_conv.agent_id <> p_agent_id THEN
            RETURN;
        END IF;
    END IF;

    -- The time is taken AFTER the thread is locked, not at the transaction's start: a client
    -- message that committed while this waited must not end up newer than the reply after it.
    v_now := clock_timestamp();

    INSERT INTO public.message
        (id, conversation_id, sender_user_id, sender_role, body, is_internal_note, created_at)
    VALUES (p_message_id, v_conv.id, p_actor_user_id, 'agent', v_body, p_is_internal_note, v_now);

    -- What is still unread once the advisor has written: the client messages newer than the
    -- newest they had on screen. Never MORE than before, so a caller that saw nothing changes
    -- nothing.
    SELECT least(v_conv.agent_unread_count, count(*)::integer) INTO v_unread
      FROM public.message m
     WHERE m.conversation_id = v_conv.id AND m.archived_at IS NULL AND NOT m.is_internal_note
       AND m.sender_role = 'client'
       AND (p_seen_up_to IS NULL OR m.created_at > p_seen_up_to);

    IF p_is_internal_note THEN
        -- Nothing the client can read moves: not the preview, not the time, not their count,
        -- not updated_at (also in their grant).
        UPDATE public.conversation cv
           SET agent_unread_count = v_unread
         WHERE cv.id = v_conv.id AND cv.agent_unread_count <> v_unread;
    ELSE
        UPDATE public.conversation cv
           SET last_message_at      = greatest(v_now, cv.last_message_at),
               last_message_preview = public.message_preview(v_body),
               client_unread_count  = cv.client_unread_count + 1,
               agent_unread_count   = v_unread,
               updated_at           = v_now
         WHERE cv.id = v_conv.id;
    END IF;

    RETURN QUERY SELECT 'sent'::text, v_conv.id, v_now;
END;
$$;

-- Opening a thread reads it, up to the newest message the page showed (p_seen_up_to): one
-- that arrived after the page was drawn stays unread. True when the count moved.
CREATE OR REPLACE FUNCTION public.agent_mark_conversation_read(
    p_agent_id        uuid,
    p_conversation_id uuid,
    p_seen_up_to      timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_was    integer;
    v_unread integer;
BEGIN
    IF p_seen_up_to IS NULL THEN
        RAISE EXCEPTION 'say which message was the newest on screen';
    END IF;

    SELECT cv.agent_unread_count INTO v_was
      FROM public.conversation cv
      JOIN public.client c ON c.id = cv.client_id
      LEFT JOIN public.trip t ON t.id = cv.trip_id
     WHERE cv.id = p_conversation_id
       AND cv.agent_id = p_agent_id
       AND cv.archived_at IS NULL
       AND c.status <> 'merged_into'
       AND (cv.trip_id IS NULL OR t.agent_id = p_agent_id)
       FOR UPDATE OF cv;
    IF NOT FOUND OR v_was = 0 THEN
        RETURN false;
    END IF;

    SELECT least(v_was, count(*)::integer) INTO v_unread
      FROM public.message m
     WHERE m.conversation_id = p_conversation_id AND m.archived_at IS NULL
       AND NOT m.is_internal_note AND m.sender_role = 'client'
       AND m.created_at > p_seen_up_to;
    IF v_unread = v_was THEN
        RETURN false;
    END IF;

    UPDATE public.conversation cv SET agent_unread_count = v_unread WHERE cv.id = p_conversation_id;
    RETURN true;
END;
$$;

-- Archive from (or bring back to) the inbox, one thread or up to 100. Returns how many moved.
--
-- Archiving is "done with this": it files the thread through its last_message_at (any later
-- client-visible message brings it back) and clears the advisor's count, so the worklist's
-- counts (agent_kpis, agent_trip_board, agent_inbox) stop counting a thread the inbox no longer
-- shows. Zero is exact even mid-race: `trip-message` inserts a message before it bumps the
-- thread, so one that landed during the archive is counted (and the thread brought back) by
-- that bump, after this. Bringing a thread back changes neither.
CREATE OR REPLACE FUNCTION public.agent_set_conversations_archived(
    p_agent_id         uuid,
    p_conversation_ids uuid[],
    p_archived         boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_n integer;
BEGIN
    IF cardinality(coalesce(p_conversation_ids, ARRAY[]::uuid[])) > 100 THEN
        RAISE EXCEPTION 'archive at most 100 threads at once';
    END IF;
    IF p_archived IS NULL THEN
        RAISE EXCEPTION 'say whether to archive or bring back';
    END IF;

    UPDATE public.conversation cv
       SET agent_archived_at  = CASE WHEN p_archived THEN x.last_message_at ELSE NULL END,
           agent_unread_count = CASE WHEN p_archived THEN 0 ELSE x.agent_unread_count END
      FROM public.conversation x
      JOIN public.client c ON c.id = x.client_id
      LEFT JOIN public.trip t ON t.id = x.trip_id
     WHERE cv.id = x.id
       AND x.id = ANY (p_conversation_ids)
       AND x.agent_id = p_agent_id
       AND x.archived_at IS NULL
       AND c.status <> 'merged_into'
       AND (x.trip_id IS NULL OR t.agent_id = p_agent_id)
       -- Only threads that would actually change state.
       AND (CASE WHEN p_archived
                 THEN NOT (x.agent_archived_at IS NOT NULL AND x.agent_archived_at >= x.last_message_at)
                 ELSE x.agent_archived_at IS NOT NULL END);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

-- `trip-message`'s thread update, as one statement. It used to read agent_unread_count, add one
-- in TypeScript and write it back; now that the advisor clears the count, a clear landing
-- between that read and that write was undone. And last_message_at only moves forward, so a
-- client message committing just after an advisor reply cannot pull the thread's time or
-- preview back behind it. True when a thread was updated.
CREATE OR REPLACE FUNCTION public.conversation_record_client_message(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_n integer;
BEGIN
    UPDATE public.conversation cv
       SET last_message_preview = CASE WHEN m.created_at >= cv.last_message_at
                                       THEN public.message_preview(m.body)
                                       ELSE cv.last_message_preview END,
           last_message_at      = greatest(cv.last_message_at, m.created_at),
           agent_unread_count   = cv.agent_unread_count + 1,
           updated_at           = now()
      FROM public.message m
     WHERE m.id = p_message_id
       AND m.sender_role = 'client'
       AND NOT m.is_internal_note
       AND cv.id = m.conversation_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n > 0;
END;
$$;

-- The worklist's "Recent messages" (Screen 3.2.1) and Client Detail's Messages tab (3.3.5) now
-- open these threads (§3.10.2), so they list exactly the threads that open: the same scope as
-- the inbox. Before, a thread on a trip handed to another advisor was listed and then 404'd,
-- and an inbox-archived thread stayed on the worklist with its old count.
CREATE OR REPLACE FUNCTION public.agent_inbox(p_limit integer DEFAULT 20)
RETURNS TABLE (
    conversation_id      uuid,
    client_id            uuid,
    client_display_name  text,
    trip_id              uuid,
    trip_title           text,
    subject              text,
    last_message_at      timestamptz,
    last_message_preview text,
    agent_unread_count   integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT th.conversation_id, th.client_id, th.client_display_name, th.trip_id, th.trip_title,
           th.subject, th.last_message_at, th.last_message_preview, th.agent_unread_count
      FROM public.agent_threads_for_current_agent() th
     WHERE NOT th.archived
     ORDER BY th.last_message_at DESC, th.conversation_id
     -- No ceiling, for the reason 20260919140000 gives: every caller passes its own limit.
     LIMIT coalesce(p_limit, 20);
$$;

-- Client Detail keeps inbox-archived threads: the tab is the client's history, not a to-do list.
CREATE OR REPLACE FUNCTION public.agent_client_conversations(p_client_id uuid)
RETURNS TABLE (
    conversation_id      uuid,
    trip_id              uuid,
    trip_title           text,
    subject              text,
    last_message_at      timestamptz,
    last_message_preview text,
    agent_unread_count   integer,
    message_count        integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT th.conversation_id, th.trip_id, th.trip_title, th.subject,
           th.last_message_at, th.last_message_preview, th.agent_unread_count,
           (SELECT count(*)::integer FROM public.message m
             WHERE m.conversation_id = th.conversation_id AND m.archived_at IS NULL)
      FROM public.agent_threads_for_current_agent() th
     WHERE th.client_id = p_client_id
       -- Still the caller's client, as before: a client handed to another advisor leaves
       -- this tab even if an old thread is still filed under the caller.
       AND EXISTS (SELECT 1 FROM public.client c
                    WHERE c.id = p_client_id AND c.agent_id = public.current_agent_id())
     ORDER BY th.last_message_at DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The client's read-clearing (web and mobile, when a thread opens)
-- ─────────────────────────────────────────────────────────────────────────────

-- A client clears their own unread count on their own live thread, up to the newest message
-- their screen showed (p_seen_up_to): a reply that lands after the screen was drawn stays
-- unread. Anything else changes nothing. SECURITY DEFINER because the client has no UPDATE on
-- conversation, and should not.
CREATE OR REPLACE FUNCTION public.client_mark_conversation_read(
    p_conversation_id uuid,
    p_seen_up_to      timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_was    integer;
    v_unread integer;
BEGIN
    IF p_seen_up_to IS NULL THEN
        RAISE EXCEPTION 'say which message was the newest on screen';
    END IF;

    SELECT cv.client_unread_count INTO v_was
      FROM public.conversation cv
     WHERE cv.id = p_conversation_id
       AND cv.client_id = (SELECT pu.client_id FROM public.current_platform_user() pu)
       AND cv.archived_at IS NULL
       FOR UPDATE;
    IF NOT FOUND OR v_was = 0 THEN
        RETURN false;
    END IF;

    -- The advisor's messages the client can see. Internal notes never counted toward this.
    SELECT least(v_was, count(*)::integer) INTO v_unread
      FROM public.message m
     WHERE m.conversation_id = p_conversation_id AND m.archived_at IS NULL
       AND NOT m.is_internal_note AND m.sender_role <> 'client'
       AND m.created_at > p_seen_up_to;
    IF v_unread = v_was THEN
        RETURN false;
    END IF;

    UPDATE public.conversation cv SET client_unread_count = v_unread WHERE cv.id = p_conversation_id;
    RETURN true;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Grants
-- ─────────────────────────────────────────────────────────────────────────────

-- Helpers: inside the definer functions only.
REVOKE EXECUTE ON FUNCTION public.message_preview(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.conversation_reply_due_at(timestamptz, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.agent_threads_for_current_agent() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.message_preview(text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.conversation_reply_due_at(timestamptz, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.agent_threads_for_current_agent() TO service_role;

-- The advisor's reads.
REVOKE EXECUTE ON FUNCTION public.agent_message_threads(boolean, boolean, boolean, uuid, uuid, text, integer, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.agent_message_summary() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.agent_conversation(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.agent_conversation_messages(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.agent_message_target(uuid, uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.agent_message_threads(boolean, boolean, boolean, uuid, uuid, text, integer, integer) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.agent_message_summary() TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.agent_conversation(uuid) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.agent_conversation_messages(uuid) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.agent_message_target(uuid, uuid) TO authenticated, service_role;

-- The advisor's writes, and trip-message's thread update: service_role only. p_agent_id is
-- trusted input.
REVOKE EXECUTE ON FUNCTION public.agent_send_message(uuid, uuid, uuid, text, boolean, timestamptz, uuid, uuid, uuid, uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.agent_mark_conversation_read(uuid, uuid, timestamptz) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.agent_set_conversations_archived(uuid, uuid[], boolean) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.conversation_record_client_message(uuid) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.agent_send_message(uuid, uuid, uuid, text, boolean, timestamptz, uuid, uuid, uuid, uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.agent_mark_conversation_read(uuid, uuid, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.agent_set_conversations_archived(uuid, uuid[], boolean) TO service_role;
GRANT  EXECUTE ON FUNCTION public.conversation_record_client_message(uuid) TO service_role;

-- The client's read-clearing: signed-in clients, their own threads only.
REVOKE EXECUTE ON FUNCTION public.client_mark_conversation_read(uuid, timestamptz) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.client_mark_conversation_read(uuid, timestamptz) TO authenticated, service_role;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
DECLARE leaked text;
BEGIN
    IF has_column_privilege('authenticated', 'public.conversation', 'agent_archived_at', 'SELECT') THEN
        RAISE EXCEPTION 'conversation.agent_archived_at must stay out of the client grant';
    END IF;

    SELECT string_agg(f, ', ') INTO leaked
      FROM unnest(ARRAY[
            'public.agent_send_message(uuid, uuid, uuid, text, boolean, timestamptz, uuid, uuid, uuid, uuid)',
            'public.agent_mark_conversation_read(uuid, uuid, timestamptz)',
            'public.conversation_record_client_message(uuid)',
            'public.agent_set_conversations_archived(uuid, uuid[], boolean)',
            'public.agent_threads_for_current_agent()',
            'public.message_preview(text)',
            'public.conversation_reply_due_at(timestamptz, text)']) f
     WHERE has_function_privilege('authenticated', f, 'EXECUTE')
        OR has_function_privilege('anon', f, 'EXECUTE');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'executable by a client role: %', leaked;
    END IF;

    SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO leaked
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN LATERAL (
            SELECT substr(cfg, length('search_path=') + 1) AS value
              FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
             WHERE cfg LIKE 'search\_path=%'
             LIMIT 1
           ) sp ON true
     WHERE n.nspname = 'public'
       AND p.proname IN ('message_preview', 'conversation_reply_due_at',
                         'agent_threads_for_current_agent', 'agent_message_threads',
                         'agent_message_summary', 'agent_conversation',
                         'agent_conversation_messages', 'agent_message_target',
                         'agent_send_message', 'agent_mark_conversation_read',
                         'agent_set_conversations_archived', 'client_mark_conversation_read',
                         'conversation_record_client_message', 'agent_inbox',
                         'agent_client_conversations')
       AND (sp.value IS NULL
            OR btrim((string_to_array(sp.value, ','))[
                   cardinality(string_to_array(sp.value, ','))], ' "') <> 'pg_temp');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION '§3.10 functions need a pg_temp-terminated search_path: %', leaked;
    END IF;

    -- The preview matches trip-message's on the cases it documents.
    IF public.message_preview('  two   spaces ') <> 'two spaces'
       OR length(public.message_preview(repeat('word ', 60))) > 141
       OR right(public.message_preview(repeat('word ', 60)), 1) <> '…' THEN
        RAISE EXCEPTION 'message_preview drifted from trip-message''s preview';
    END IF;
END $$;

COMMIT;
