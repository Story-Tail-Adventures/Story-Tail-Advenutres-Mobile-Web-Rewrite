-- §3.12 Agent Profile & Settings, PR 1: Profile and Availability (Screens 3.12.1, 3.12.2).
-- Rulings: docs/Screen-Inventory.md §3.12 (2026-10-17). Data-Model §7.1, §7.3, §7.5.
--
-- ── WHAT THIS ADDS ─────────────────────────────────────────────────────────────────────
--
--   1. agent.email_signature (written from PR 2) and a CHECK on agent.social_links.
--   2. agent_availability.weekly_schedule gets a declared shape and a CHECK; the seeded
--      ["09:00","17:00"] arrays are converted. response_time_hours is one of 2/4/12/24/48.
--      Every agent gets a row.
--   3. agent_time_off, one row per out-of-office block, replacing the untyped
--      time_off_blocks blob (copied across, then emptied). Overlap is an exclusion constraint.
--   4. agent_settings_self(), the page's one read.
--   5. The writes the `agent-settings` Edge Function calls, service_role only, each with its
--      audit row INSIDE the same transaction. An unchanged save writes nothing and audits
--      nothing.
--
-- ── WHAT IS NOT HERE ON PURPOSE ────────────────────────────────────────────────────────
--
-- Rest hours still come from §3.10's fixed 9pm to 7am and Sunday; working hours take that
-- over in PR 2, together with the auto-reply (whose columns are created here so PR 2 adds no
-- table change to a table with live rows). Calendar sync is deferred (§3.12.2): nothing here
-- reads or writes the calendar_sync_* columns. agent_availability_self() keeps its signature
-- (rls_agent_reads.sql pins it), so time_off_blocks stays a column that reads '[]'.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. agent: signature, social links
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.agent ADD COLUMN IF NOT EXISTS email_signature text;

ALTER TABLE public.agent ADD CONSTRAINT agent_email_signature_shape CHECK (
    email_signature IS NULL
    OR (char_length(email_signature) <= 500
        AND coalesce(array_length(string_to_array(email_signature, E'\n'), 1), 0) <= 8)
);

-- Exactly the four networks, each a full https URL. A bare handle never reaches the table:
-- the Edge Function turns "@name" into the link before it writes.
CREATE OR REPLACE FUNCTION public.agent_social_links_valid(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(jsonb_typeof(p) = 'object'
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_each(p) e
            WHERE e.key NOT IN ('instagram', 'facebook', 'linkedin', 'website')
               OR jsonb_typeof(e.value) <> 'string'
               OR char_length(e.value #>> '{}') > 300
               OR (e.value #>> '{}') !~ '^https://[^[:space:]<>"]+$'
       ), false);
$$;

-- Whatever an older writer left that is not a link is dropped rather than guessed at.
UPDATE public.agent
   SET social_links = coalesce((
           SELECT jsonb_object_agg(e.key, e.value)
             FROM jsonb_each(CASE WHEN jsonb_typeof(social_links) = 'object'
                                  THEN social_links ELSE '{}'::jsonb END) e
            WHERE public.agent_social_links_valid(jsonb_build_object(e.key, e.value))
       ), '{}'::jsonb)
 WHERE NOT public.agent_social_links_valid(social_links);

ALTER TABLE public.agent ADD CONSTRAINT agent_social_links_shape
    CHECK (public.agent_social_links_valid(social_links));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. agent_availability: working hours with a shape
-- ─────────────────────────────────────────────────────────────────────────────

-- Seven keys, each null (a day off) or {"start","end"} on the half hour, start before end.
-- "24:00" is a legal end (working until midnight); never a start.
--
-- NEVER NULL. A CHECK passes on NULL, and array_agg over no keys IS null, so without the
-- coalesces '{}' (and a day of {}) sailed through. IS NOT DISTINCT FROM and the outer
-- coalesce make every path a real true or false.
CREATE OR REPLACE FUNCTION public.agent_weekly_schedule_valid(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(jsonb_typeof(p) = 'object'
       AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p) k)
           IS NOT DISTINCT FROM ARRAY['fri', 'mon', 'sat', 'sun', 'thu', 'tue', 'wed']
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_each(p) d
            WHERE jsonb_typeof(d.value) <> 'null'
              AND NOT coalesce(
                  jsonb_typeof(d.value) = 'object'
                  AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d.value) k)
                      IS NOT DISTINCT FROM ARRAY['end', 'start']
                  AND jsonb_typeof(d.value -> 'start') = 'string'
                  AND jsonb_typeof(d.value -> 'end') = 'string'
                  AND (d.value ->> 'start') ~ '^([01][0-9]|2[0-3]):(00|30)$'
                  AND (d.value ->> 'end') ~ '^(([01][0-9]|2[0-3]):(00|30)|24:00)$'
                  AND (d.value ->> 'start') < (d.value ->> 'end')
              , false)
       ), false);
$$;

-- §3.12.2's default: today's rest hours (9pm to 7am, all Sunday) turned inside out.
CREATE OR REPLACE FUNCTION public.agent_default_weekly_schedule()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'mon', jsonb_build_object('start', '07:00', 'end', '21:00'),
        'tue', jsonb_build_object('start', '07:00', 'end', '21:00'),
        'wed', jsonb_build_object('start', '07:00', 'end', '21:00'),
        'thu', jsonb_build_object('start', '07:00', 'end', '21:00'),
        'fri', jsonb_build_object('start', '07:00', 'end', '21:00'),
        'sat', jsonb_build_object('start', '07:00', 'end', '21:00'),
        'sun', 'null'::jsonb
    );
$$;

-- The earlier seed wrote {"mon":["09:00","17:00"], "sat":[]}. Convert that shape; anything
-- that still does not parse becomes the default rather than a guess.
UPDATE public.agent_availability av
   SET weekly_schedule = (
           SELECT jsonb_object_agg(day,
                      CASE WHEN jsonb_typeof(av.weekly_schedule -> day) = 'array'
                                AND jsonb_array_length(av.weekly_schedule -> day) = 2
                           THEN jsonb_build_object('start', av.weekly_schedule -> day -> 0,
                                                   'end',   av.weekly_schedule -> day -> 1)
                           WHEN jsonb_typeof(av.weekly_schedule -> day) = 'object'
                           THEN av.weekly_schedule -> day
                           ELSE 'null'::jsonb END)
             FROM unnest(ARRAY['mon','tue','wed','thu','fri','sat','sun']) day
       )
 WHERE jsonb_typeof(av.weekly_schedule) = 'object'
   AND NOT public.agent_weekly_schedule_valid(av.weekly_schedule);

UPDATE public.agent_availability
   SET weekly_schedule = public.agent_default_weekly_schedule()
 WHERE NOT public.agent_weekly_schedule_valid(weekly_schedule);

UPDATE public.agent_availability
   SET response_time_hours = 24
 WHERE response_time_hours NOT IN (2, 4, 12, 24, 48);

ALTER TABLE public.agent_availability
    ALTER COLUMN weekly_schedule SET DEFAULT public.agent_default_weekly_schedule(),
    ADD CONSTRAINT agent_availability_weekly_schedule_shape
        CHECK (public.agent_weekly_schedule_valid(weekly_schedule)),
    ADD CONSTRAINT agent_availability_response_time_choice
        CHECK (response_time_hours IN (2, 4, 12, 24, 48));

-- Every advisor has a row, so the page never has to create one on first save.
INSERT INTO public.agent_availability (agent_id)
SELECT a.id FROM public.agent a
 WHERE NOT EXISTS (SELECT 1 FROM public.agent_availability av WHERE av.agent_id = a.id);

-- And every advisor added from now on.
CREATE OR REPLACE FUNCTION public.agent_availability_seed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.agent_availability (agent_id) VALUES (NEW.id)
    ON CONFLICT (agent_id) DO NOTHING;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_availability_seed() FROM public, anon, authenticated;

CREATE TRIGGER agent_availability_seed
    AFTER INSERT ON public.agent
    FOR EACH ROW EXECUTE FUNCTION public.agent_availability_seed();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. agent_time_off
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.agent_time_off (
    id                  uuid PRIMARY KEY,
    agent_id            uuid NOT NULL REFERENCES public.agent(id),
    starts_on           date NOT NULL,
    ends_on             date NOT NULL,
    label               text,
    auto_reply_enabled  boolean NOT NULL DEFAULT false,
    auto_reply_text     text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT agent_time_off_order CHECK (ends_on >= starts_on),
    CONSTRAINT agent_time_off_label_len CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 80),
    CONSTRAINT agent_time_off_reply_len CHECK (auto_reply_text IS NULL OR char_length(auto_reply_text) <= 600),
    CONSTRAINT agent_time_off_reply_text CHECK (NOT auto_reply_enabled OR auto_reply_text IS NOT NULL),
    CONSTRAINT agent_time_off_no_overlap EXCLUDE USING gist (
        agent_id WITH =,
        daterange(starts_on, ends_on, '[]') WITH &&
    )
);

CREATE INDEX agent_time_off_agent_ends ON public.agent_time_off (agent_id, ends_on);

COMMENT ON TABLE public.agent_time_off IS
    'Data-Model §7.5. One out-of-office block, whole days in agent.time_zone. Service-role '
    'only: read through agent_settings_self(), written through agent-settings with an audit row.';

-- Service role only. Hosted Postgres grants new tables to anon and authenticated by default
-- privileges, so the REVOKE is not decoration (hosted-vs-local privileges).
ALTER TABLE public.agent_time_off ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_time_off FROM public, anon, authenticated;
GRANT ALL ON public.agent_time_off TO service_role;

-- Copy the old blob across. Only rows that parse are kept, and a row that would overlap one
-- already copied is skipped rather than failing the migration.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT av.agent_id,
               b ->> 'starts_on' AS starts_on,
               b ->> 'ends_on'   AS ends_on,
               nullif(left(btrim(coalesce(b ->> 'label', b ->> 'reason', '')), 80), '') AS label
          FROM public.agent_availability av,
               jsonb_array_elements(CASE WHEN jsonb_typeof(av.time_off_blocks) = 'array'
                                         THEN av.time_off_blocks ELSE '[]'::jsonb END) b
         WHERE jsonb_typeof(b) = 'object'
           AND (b ->> 'starts_on') ~ '^\d{4}-\d{2}-\d{2}$'
           AND (b ->> 'ends_on')   ~ '^\d{4}-\d{2}-\d{2}$'
         ORDER BY 1, 2
    LOOP
        -- The casts are INSIDE the guarded block: "2026-13-45" passes the shape test above, and
        -- one such row must cost that row, not the whole migration on a live database.
        BEGIN
            IF r.ends_on::date >= r.starts_on::date THEN
                INSERT INTO public.agent_time_off (id, agent_id, starts_on, ends_on, label)
                VALUES (public.uuid_v7(), r.agent_id, r.starts_on::date, r.ends_on::date, r.label);
            END IF;
        EXCEPTION WHEN exclusion_violation OR datetime_field_overflow OR invalid_datetime_format THEN
            NULL;
        END;
    END LOOP;
END $$;

UPDATE public.agent_availability SET time_off_blocks = '[]'::jsonb
 WHERE time_off_blocks IS DISTINCT FROM '[]'::jsonb;

COMMENT ON COLUMN public.agent_availability.time_off_blocks IS
    'RETIRED 2026-10-17 (§3.12). Always ''[]''. Superseded by agent_time_off.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The read
-- ─────────────────────────────────────────────────────────────────────────────

-- Today in the advisor's own zone: "upcoming", "running" and "past" are all in their days.
CREATE OR REPLACE FUNCTION public.agent_local_today(p_agent_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT (now() AT TIME ZONE coalesce(
               (SELECT a.time_zone FROM public.agent a WHERE a.id = p_agent_id),
               'America/Chicago'))::date;
$$;
REVOKE ALL ON FUNCTION public.agent_local_today(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_local_today(uuid) TO service_role;

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
        'today', public.agent_local_today(a.id),
        -- Past blocks stay in the table for history; the page lists what is still ahead.
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
REVOKE ALL ON FUNCTION public.agent_settings_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_settings_snapshot(uuid) TO service_role;

-- The page's door: the snapshot for whoever is calling, NULL for anyone who is not an aal2
-- advisor (current_agent_id() is NULL for them).
CREATE OR REPLACE FUNCTION public.agent_settings_self()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.agent_settings_snapshot(public.current_agent_id())
     WHERE public.current_agent_id() IS NOT NULL;
$$;
COMMENT ON FUNCTION public.agent_settings_self() IS
    'Screens 3.12.1 / 3.12.2 for the signed-in advisor: profile, working hours and the '
    'out-of-office blocks still ahead. NULL for anyone who is not an aal2 advisor. Never the '
    'calendar refresh token.';
REVOKE ALL ON FUNCTION public.agent_settings_self() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.agent_settings_self() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Writes. Each takes the audit row's id and actor and writes it in its own transaction.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_settings_audit(
    p_audit_id      uuid,
    p_actor_user_id uuid,
    p_event_type    text,
    p_target_entity text,
    p_target_id     uuid,
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
        RAISE EXCEPTION 'settings writes owe an audit row: audit id and actor are required';
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
        (p_audit_id, p_actor_user_id, 'agent', p_event_type, p_target_entity, p_target_id,
         coalesce(p_metadata, '{}'::jsonb), v_ip, left(p_user_agent, 500));
END;
$$;

-- {field: {from, to}} for every key whose value differs. Keys are the caller's names.
CREATE OR REPLACE FUNCTION public.agent_settings_diff(p_old jsonb, p_new jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', p_old -> n.key, 'to', n.value)), '{}'::jsonb)
      FROM jsonb_each(p_new) n
     WHERE (p_old -> n.key) IS DISTINCT FROM n.value;
$$;

-- Locks the advisor's own row (FOR NO KEY UPDATE: nothing changes the key, and FOR UPDATE
-- would block every insert that references the agent). False when archived or missing.
CREATE OR REPLACE FUNCTION public.agent_settings_lock(p_agent_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM 1 FROM public.agent a
     WHERE a.id = p_agent_id AND a.status <> 'archived'
       FOR NO KEY UPDATE;
    RETURN FOUND;
END;
$$;

-- 3.12.1. Email is not here: it is the sign-in address and stays read-only (Q7).
CREATE OR REPLACE FUNCTION public.agent_settings_update_profile(
    p_agent_id      uuid,
    p_display_name  text,
    p_pronouns      text,
    p_phone         text,
    p_bio           text,
    p_social_links  jsonb,
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
    v_old  jsonb;
    v_new  jsonb;
    v_diff jsonb;
BEGIN
    IF NOT public.agent_settings_lock(p_agent_id) THEN
        RETURN 'not_found';
    END IF;

    SELECT jsonb_build_object('displayName', a.display_name, 'pronouns', a.pronouns,
                              'phone', a.phone, 'bio', a.bio, 'socialLinks', a.social_links)
      INTO v_old
      FROM public.agent a WHERE a.id = p_agent_id;

    v_new := jsonb_build_object('displayName', p_display_name, 'pronouns', p_pronouns,
                                'phone', p_phone, 'bio', p_bio,
                                'socialLinks', coalesce(p_social_links, '{}'::jsonb));
    v_diff := public.agent_settings_diff(v_old, v_new);

    IF v_diff = '{}'::jsonb THEN
        RETURN 'unchanged';
    END IF;

    UPDATE public.agent
       SET display_name = p_display_name,
           pronouns     = p_pronouns,
           phone        = p_phone,
           bio          = p_bio,
           social_links = coalesce(p_social_links, '{}'::jsonb),
           updated_at   = now()
     WHERE id = p_agent_id;

    PERFORM public.agent_settings_audit(p_audit_id, p_actor_user_id, 'agent.profile_updated',
        'agent', p_agent_id, jsonb_build_object('changes', v_diff), p_ip, p_user_agent);
    RETURN 'updated';
END;
$$;

-- 3.12.1's photo. Returns the path it replaced so the Edge Function can delete that object
-- AFTER this commits (deleting first would leave the profile pointing at nothing).
--
-- A PATH, NOT A URL: "/storage/v1/object/public/agent-avatars/<agent>/<file>". Inside the
-- function's container SUPABASE_URL is http://kong:8000 locally, a name no browser resolves,
-- so an absolute URL built there is wrong in exactly the environment nobody checks (the trap
-- _shared/trip.ts toStoragePath records). Each surface adds its own public origin.
CREATE OR REPLACE FUNCTION public.agent_settings_set_avatar(
    p_agent_id      uuid,
    p_avatar_url    text,
    p_audit_id      uuid,
    p_actor_user_id uuid,
    p_ip            text,
    p_user_agent    text
)
RETURNS TABLE (outcome text, previous_url text)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old text;
BEGIN
    -- The only URL this accepts is one in this advisor's own folder of the public bucket.
    IF p_avatar_url IS NOT NULL
       AND p_avatar_url !~ ('^/storage/v1/object/public/agent-avatars/'
                            || p_agent_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') THEN
        RAISE EXCEPTION 'avatar path is not in this advisor''s folder';
    END IF;

    IF NOT public.agent_settings_lock(p_agent_id) THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::text;
        RETURN;
    END IF;

    SELECT a.avatar_url INTO v_old FROM public.agent a WHERE a.id = p_agent_id;
    IF v_old IS NOT DISTINCT FROM p_avatar_url THEN
        RETURN QUERY SELECT 'unchanged'::text, NULL::text;
        RETURN;
    END IF;

    UPDATE public.agent SET avatar_url = p_avatar_url, updated_at = now() WHERE id = p_agent_id;

    PERFORM public.agent_settings_audit(p_audit_id, p_actor_user_id,
        CASE WHEN p_avatar_url IS NULL THEN 'agent.avatar_removed' ELSE 'agent.avatar_changed' END,
        'agent', p_agent_id,
        jsonb_build_object('changes', jsonb_build_object('avatarUrl',
            jsonb_build_object('from', v_old, 'to', p_avatar_url))),
        p_ip, p_user_agent);
    RETURN QUERY SELECT 'updated'::text, v_old;
END;
$$;

-- 3.12.2's working hours, zone and reply time, saved together (one tab, one Save).
CREATE OR REPLACE FUNCTION public.agent_settings_update_availability(
    p_agent_id            uuid,
    p_time_zone           text,
    p_weekly_schedule     jsonb,
    p_response_time_hours integer,
    p_audit_id            uuid,
    p_actor_user_id       uuid,
    p_ip                  text,
    p_user_agent          text
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old  jsonb;
    v_diff jsonb;
BEGIN
    -- The Edge Function holds the North American list; this is the backstop that the name
    -- is one Postgres can convert with at all.
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_time_zone) THEN
        RAISE EXCEPTION 'unknown time zone %', p_time_zone;
    END IF;

    IF NOT public.agent_settings_lock(p_agent_id) THEN
        RETURN 'not_found';
    END IF;

    INSERT INTO public.agent_availability (agent_id) VALUES (p_agent_id)
    ON CONFLICT (agent_id) DO NOTHING;

    SELECT jsonb_build_object('timeZone', a.time_zone, 'weeklySchedule', av.weekly_schedule,
                              'responseTimeHours', av.response_time_hours)
      INTO v_old
      FROM public.agent a JOIN public.agent_availability av ON av.agent_id = a.id
     WHERE a.id = p_agent_id
       FOR NO KEY UPDATE OF av;

    v_diff := public.agent_settings_diff(v_old, jsonb_build_object(
        'timeZone', p_time_zone, 'weeklySchedule', p_weekly_schedule,
        'responseTimeHours', p_response_time_hours));

    IF v_diff = '{}'::jsonb THEN
        RETURN 'unchanged';
    END IF;

    UPDATE public.agent SET time_zone = p_time_zone, updated_at = now()
     WHERE id = p_agent_id AND time_zone IS DISTINCT FROM p_time_zone;

    UPDATE public.agent_availability
       SET weekly_schedule = p_weekly_schedule,
           response_time_hours = p_response_time_hours,
           updated_at = now()
     WHERE agent_id = p_agent_id;

    PERFORM public.agent_settings_audit(p_audit_id, p_actor_user_id, 'agent_availability.updated',
        'agent', p_agent_id, jsonb_build_object('changes', v_diff), p_ip, p_user_agent);
    RETURN 'updated';
END;
$$;

-- 3.12.2's out-of-office: create, or edit one that has not started (Q22). A running block can
-- only be ended early (agent_settings_end_time_off).
CREATE OR REPLACE FUNCTION public.agent_settings_save_time_off(
    p_id            uuid,
    p_agent_id      uuid,
    p_is_new        boolean,
    p_starts_on     date,
    p_ends_on       date,
    p_label         text,
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
    v_today  date;
    v_row    public.agent_time_off;
    v_exists boolean;
    v_diff   jsonb;
BEGIN
    IF p_starts_on IS NULL OR p_ends_on IS NULL OR p_ends_on < p_starts_on THEN
        RETURN 'bad_dates';
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

    -- Only a caller that said "new" may create, because only then did the Edge Function check
    -- the id is a recent v7 (Data-Model §21.6). An edit of a row that is not there is a 404,
    -- never a quiet insert under an id nobody vetted.
    IF NOT v_exists AND NOT coalesce(p_is_new, false) THEN
        RETURN 'not_found';
    END IF;

    -- A block already under way can only be ended early. Checked before the date rule, so
    -- editing a running block says so rather than "time away can start today or later".
    IF v_exists AND v_row.starts_on <= v_today THEN
        RETURN 'started';
    END IF;

    IF p_starts_on < v_today THEN
        RETURN 'starts_in_past';
    END IF;

    IF NOT v_exists THEN
        BEGIN
            INSERT INTO public.agent_time_off (id, agent_id, starts_on, ends_on, label)
            VALUES (p_id, p_agent_id, p_starts_on, p_ends_on, p_label);
        EXCEPTION WHEN exclusion_violation THEN
            RETURN 'overlap';
        END;
        PERFORM public.agent_settings_audit(p_audit_id, p_actor_user_id, 'agent_time_off.created',
            'agent_time_off', p_id,
            jsonb_build_object('startsOn', p_starts_on, 'endsOn', p_ends_on, 'label', p_label),
            p_ip, p_user_agent);
        RETURN 'created';
    END IF;

    v_diff := public.agent_settings_diff(
        jsonb_build_object('startsOn', v_row.starts_on, 'endsOn', v_row.ends_on, 'label', v_row.label),
        jsonb_build_object('startsOn', p_starts_on, 'endsOn', p_ends_on, 'label', p_label));
    IF v_diff = '{}'::jsonb THEN
        RETURN 'unchanged';
    END IF;

    BEGIN
        UPDATE public.agent_time_off
           SET starts_on = p_starts_on, ends_on = p_ends_on, label = p_label, updated_at = now()
         WHERE id = p_id;
    EXCEPTION WHEN exclusion_violation THEN
        RETURN 'overlap';
    END;
    PERFORM public.agent_settings_audit(p_audit_id, p_actor_user_id, 'agent_time_off.updated',
        'agent_time_off', p_id, jsonb_build_object('changes', v_diff), p_ip, p_user_agent);
    RETURN 'updated';
END;
$$;

-- Delete an upcoming block, or end a running one early ("I'm back"): its last day becomes
-- yesterday, or it goes entirely if it began today. A past block is left alone.
CREATE OR REPLACE FUNCTION public.agent_settings_end_time_off(
    p_id            uuid,
    p_agent_id      uuid,
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
    v_today date;
    v_row   public.agent_time_off;
BEGIN
    IF NOT public.agent_settings_lock(p_agent_id) THEN
        RETURN 'not_found';
    END IF;
    v_today := public.agent_local_today(p_agent_id);

    SELECT * INTO v_row FROM public.agent_time_off
     WHERE id = p_id AND agent_id = p_agent_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;

    IF v_row.ends_on < v_today THEN
        RETURN 'past';
    END IF;

    IF v_row.starts_on >= v_today THEN
        DELETE FROM public.agent_time_off WHERE id = p_id;
        PERFORM public.agent_settings_audit(p_audit_id, p_actor_user_id, 'agent_time_off.deleted',
            'agent_time_off', p_id,
            jsonb_build_object('startsOn', v_row.starts_on, 'endsOn', v_row.ends_on,
                               'label', v_row.label, 'wasRunning', v_row.starts_on = v_today),
            p_ip, p_user_agent);
        RETURN 'deleted';
    END IF;

    UPDATE public.agent_time_off SET ends_on = v_today - 1, updated_at = now() WHERE id = p_id;
    PERFORM public.agent_settings_audit(p_audit_id, p_actor_user_id, 'agent_time_off.ended',
        'agent_time_off', p_id,
        jsonb_build_object('changes', jsonb_build_object('endsOn',
            jsonb_build_object('from', v_row.ends_on, 'to', v_today - 1))),
        p_ip, p_user_agent);
    RETURN 'ended';
END;
$$;

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.agent_settings_audit(uuid, uuid, text, text, uuid, jsonb, text, text)',
        'public.agent_settings_diff(jsonb, jsonb)',
        'public.agent_settings_lock(uuid)',
        'public.agent_settings_update_profile(uuid, text, text, text, text, jsonb, uuid, uuid, text, text)',
        'public.agent_settings_set_avatar(uuid, text, uuid, uuid, text, text)',
        'public.agent_settings_update_availability(uuid, text, jsonb, integer, uuid, uuid, text, text)',
        'public.agent_settings_save_time_off(uuid, uuid, boolean, date, date, text, uuid, uuid, text, text)',
        'public.agent_settings_end_time_off(uuid, uuid, uuid, uuid, text, text)'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

-- The validators are pure and harmless, but nothing outside the database calls them.
REVOKE ALL ON FUNCTION public.agent_social_links_valid(jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_weekly_schedule_valid(jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_default_weekly_schedule() FROM public, anon, authenticated;
-- Named, not inherited: the CHECKs, the column default and the service_role writes all call
-- these as the caller, and a hosted default-privilege difference would otherwise fail every
-- save with "permission denied for function".
GRANT EXECUTE ON FUNCTION public.agent_social_links_valid(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_weekly_schedule_valid(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_default_weekly_schedule() TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_availability_seed() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Storage: the public photo bucket
-- ─────────────────────────────────────────────────────────────────────────────

-- Public because the photo goes into email, which has no session. Only the service role
-- writes it (no storage.objects policy for any client role): the Edge Function picks the key
-- under the advisor's own folder. 1 MiB is plenty for a 400×400 image the browser made.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('agent-avatars', 'agent-avatars', true, 1048576,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
   SET public = EXCLUDED.public,
       file_size_limit = EXCLUDED.file_size_limit,
       allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
