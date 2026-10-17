-- §3.9 Login Support, PR 2: merge duplicate client records (Screens 3.9.7 / 3.3.11).
-- Rulings: docs/Screen-Inventory.md §3.9, "Merge (PR 2), ruled now" (2026-10-16).
-- Data-Model §6.1 (client.status / merged_into_client_id), §15 (audit).
--
-- ── WHAT THIS ADDS ─────────────────────────────────────────────────────────────────────
--
--   1. client_merge_fields(): the one list of fields the picker offers, and the default rule
--      (the kept value, or the retired one when the kept one is empty).
--   2. client_merge_preview(): what the confirm step shows and what the Edge Function decides
--      from: both records, every field with its default, what moves, and the sign-in plan.
--   3. agent_client_merge_view(): the page's authenticated, aal2-gated read (preview plus the
--      likely duplicates to pick from).
--   4. account_admin_merge_clients(): the write, with both audit rows inside its transaction.
--
-- ── THE RULES, IN THE ORDER THE WRITE APPLIES THEM ─────────────────────────────────────
--
--   * The advisor picks the record to KEEP. The other becomes `merged_into`, pointing at it,
--     and is NEVER deleted. Records already merged into the retired one are re-pointed, so a
--     chain is always one hop.
--   * EVERYTHING attached moves: trips (commission rows hang off trip, so they ride along),
--     conversations, client_note, companion (both client_id and linked_client_id), document,
--     travel_document, testimonial and client_invite. The card tables the ruling names were
--     dropped by §3.6 (20261021120000), so there is nothing of theirs left to move.
--   * ONE general thread. Both records' live no-trip threads would break
--     conversation_one_live_general_thread, so the retired thread's messages move into the
--     kept thread (they keep their own created_at, so the thread reads in time order) and the
--     emptied thread is closed (archived) before it moves.
--   * Sign-ins. platform_user.client_id is unique. Only the retired record has one: it moves.
--     Both have one: the kept one stays, the other is locked "Merged into <name>" through
--     account_admin_set_lock (its own audit row, sessions ended). The GoTrue ban is the Edge
--     Function's, BEFORE this runs, and it passes the account it banned so a sign-in that
--     appeared in between is refused as stale rather than left unlocked.
--   * Fields default to the kept value, fall back to the retired value when the kept one is
--     empty, and can be flipped. travel_preference is one row per client, so the same picker
--     applies to its fields. The email is pinned to the surviving sign-in's address.
--   * No undo. The audit row keeps both records' every value from before, both preference
--     rows, and the id of every row that moved, so a mistake can be put right by hand.
--   * No email to the client. Closing the retired thread clears its pending reply email (the
--     outbox trigger does that when the unread count drops to 0), and a locked sign-in's
--     pending reply emails are cleared too. The kept thread's client count is not raised, so
--     nothing new is queued. The advisor's own unread count IS carried over (a client message
--     they had not read should still look unread), and the push that raising it would queue is
--     taken back, so the merge notifies nobody.
--
-- ── LOCKS ──────────────────────────────────────────────────────────────────────────────
--
-- Both client rows FOR NO KEY UPDATE, in id order so two merges of the same pair in opposite
-- directions cannot deadlock. NO KEY, because every row being moved references the client and
-- takes FOR KEY SHARE on it (see account_admin_lock_client and §3.7's deadlock note).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The fields
-- ─────────────────────────────────────────────────────────────────────────────

-- Empty means "nothing to keep": null, blank text, an empty array or object.
CREATE OR REPLACE FUNCTION public.client_merge_is_empty(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT p_value IS NULL
        OR p_value = 'null'::jsonb
        OR p_value = '[]'::jsonb
        OR p_value = '{}'::jsonb
        OR (jsonb_typeof(p_value) = 'string' AND btrim(p_value #>> '{}') = '');
$$;

-- The picker's rows, in the order the page draws them. `source` says which row the column
-- lives on. The ids and bookkeeping columns (status, version, lifetime_value_cents, which no
-- reader uses) are not offered.
CREATE OR REPLACE FUNCTION public.client_merge_field_list()
RETURNS TABLE (field text, source text, ord integer)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT f.field, f.source, f.ord::integer
      FROM (VALUES
          ('first_name',             'client',     1),
          ('last_name',              'client',     2),
          ('preferred_name',         'client',     3),
          ('email',                  'client',     4),
          ('phone',                  'client',     5),
          ('date_of_birth',          'client',     6),
          ('mailing_address_id',     'client',     7),
          ('emergency_contact',      'client',     8),
          ('important_dates',        'client',     9),
          ('tags',                   'client',    10),
          ('notes',                  'client',    11),
          ('preferred_destinations', 'preference', 12),
          ('travel_styles',          'preference', 13),
          ('budget_band',            'preference', 14),
          ('dietary_restrictions',   'preference', 15),
          ('dietary_notes',          'preference', 16),
          ('accessibility_needs',    'preference', 17),
          ('accessibility_notes',    'preference', 18),
          ('loyalty_programs',       'preference', 19),
          ('favorite_past_trips',    'preference', 20)
      ) AS f(field, source, ord);
$$;

-- Every field with both values, its default, and whether it is pinned. The preview shows this
-- and the write recomputes it, so the two cannot disagree about a default.
CREATE OR REPLACE FUNCTION public.client_merge_fields(
    p_keep          jsonb,
    p_retire        jsonb,
    p_keep_pref     jsonb,
    p_retire_pref   jsonb,
    p_pinned_email  text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'field',       f.field,
               'source',      f.source,
               'keepValue',   v.kv,
               'retireValue', v.rv,
               'default',     CASE WHEN f.field = 'email' AND p_pinned_email IS NOT NULL THEN
                                       CASE WHEN v.kv #>> '{}' = p_pinned_email THEN 'keep' ELSE 'retire' END
                                   WHEN public.client_merge_is_empty(v.kv)
                                    AND NOT public.client_merge_is_empty(v.rv) THEN 'retire'
                                   ELSE 'keep' END,
               'pinned',      f.field = 'email' AND p_pinned_email IS NOT NULL,
               'same',        coalesce(v.kv = v.rv, v.kv IS NULL AND v.rv IS NULL)
           ) ORDER BY f.ord), '[]'::jsonb)
      FROM public.client_merge_field_list() f
      CROSS JOIN LATERAL (
          SELECT CASE f.source WHEN 'client' THEN p_keep -> f.field ELSE p_keep_pref -> f.field END AS kv,
                 CASE f.source WHEN 'client' THEN p_retire -> f.field ELSE p_retire_pref -> f.field END AS rv
      ) v;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The preview
--
-- NULL when either record is not p_agent_id's, is merged away, or they are the same record:
-- callers answer that as not-found, as account_admin_target does.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.client_merge_summary(p_client public.client)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'clientId',   p_client.id,
        'firstName',  p_client.first_name,
        'lastName',   p_client.last_name,
        'email',      p_client.email,
        'createdAt',  p_client.created_at,
        'archived',   p_client.archived_at IS NOT NULL,
        'version',    p_client.version,
        'address',    (SELECT concat_ws(', ', ad.line1, ad.line2, ad.city, ad.region, ad.postal_code)
                         FROM public.address ad WHERE ad.id = p_client.mailing_address_id),
        'counts', jsonb_build_object(
            'trips',          (SELECT count(*) FROM public.trip t WHERE t.client_id = p_client.id),
            'conversations',  (SELECT count(*) FROM public.conversation cv WHERE cv.client_id = p_client.id),
            'notes',          (SELECT count(*) FROM public.client_note n
                                WHERE n.client_id = p_client.id AND n.archived_at IS NULL),
            'companions',     (SELECT count(*) FROM public.companion cp
                                WHERE cp.client_id = p_client.id AND cp.archived_at IS NULL),
            'documents',      (SELECT count(*) FROM public.document d WHERE d.client_id = p_client.id),
            'travelDocuments',(SELECT count(*) FROM public.travel_document td WHERE td.client_id = p_client.id),
            'commissions',    (SELECT count(*) FROM public.commission cm
                                 JOIN public.trip t ON t.id = cm.trip_id
                                WHERE t.client_id = p_client.id)
        ),
        'signIn', (
            SELECT jsonb_build_object(
                       'accountId', pu.account_id,
                       'email',     u.email,
                       'locked',    a.locked_at IS NOT NULL)
              FROM public.platform_user pu
              JOIN auth.users u ON u.id = pu.account_id
              LEFT JOIN public.account a ON a.id = pu.account_id
             WHERE pu.client_id = p_client.id AND pu.role = 'client'
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.client_merge_preview(
    p_agent_id  uuid,
    p_keep_id   uuid,
    p_retire_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_keep      public.client%ROWTYPE;
    v_retire    public.client%ROWTYPE;
    v_ks        jsonb;
    v_rs        jsonb;
    v_pinned    text;
    v_plan      text;
    v_companions integer;
    v_blocked   text;
BEGIN
    IF p_keep_id = p_retire_id THEN
        RETURN NULL;
    END IF;

    SELECT c.* INTO v_keep
      FROM public.client c
      JOIN public.agent a ON a.id = c.agent_id AND a.status <> 'archived'
     WHERE c.id = p_keep_id AND c.agent_id = p_agent_id AND c.status <> 'merged_into';
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT c.* INTO v_retire
      FROM public.client c
     WHERE c.id = p_retire_id AND c.agent_id = p_agent_id AND c.status <> 'merged_into';
    IF NOT FOUND THEN RETURN NULL; END IF;

    v_ks := public.client_merge_summary(v_keep);
    v_rs := public.client_merge_summary(v_retire);

    v_plan := CASE
        WHEN v_ks -> 'signIn' <> 'null'::jsonb AND v_rs -> 'signIn' <> 'null'::jsonb THEN 'lock_retired'
        WHEN v_rs -> 'signIn' <> 'null'::jsonb THEN 'move'
        WHEN v_ks -> 'signIn' <> 'null'::jsonb THEN 'keep'
        ELSE 'none' END;
    v_pinned := coalesce(v_ks #>> '{signIn,email}', v_rs #>> '{signIn,email}');

    -- enforce_companion_cap() allows 12 live companions. A companion that IS the other record
    -- (a link between the two) is closed by the merge, so it does not count.
    SELECT count(*)::integer INTO v_companions
      FROM public.companion cp
     WHERE cp.client_id IN (p_keep_id, p_retire_id)
       AND cp.archived_at IS NULL
       AND cp.linked_client_id IS DISTINCT FROM p_keep_id
       AND cp.linked_client_id IS DISTINCT FROM p_retire_id;

    v_blocked := CASE
        WHEN v_keep.archived_at IS NOT NULL THEN 'kept_archived'
        WHEN v_companions > 12 THEN 'companion_cap'
        ELSE NULL END;

    RETURN jsonb_build_object(
        'keep',          v_ks,
        'retire',        v_rs,
        'signInPlan',    v_plan,
        'pinnedEmail',   v_pinned,
        'companionsAfter', v_companions,
        'blocked',       v_blocked,
        'fields',        public.client_merge_fields(
                             to_jsonb(v_keep), to_jsonb(v_retire),
                             (SELECT to_jsonb(tp) FROM public.travel_preference tp WHERE tp.client_id = p_keep_id),
                             (SELECT to_jsonb(tp) FROM public.travel_preference tp WHERE tp.client_id = p_retire_id),
                             v_pinned)
    );
END;
$$;

COMMENT ON FUNCTION public.client_merge_preview(uuid, uuid, uuid) IS
    'Screen 3.9.7 / 3.3.11: both records, every field with its default, what moves and the '
    'sign-in plan. NULL unless both are p_agent_id''s live records. Service-role only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The page's read
--
-- Without p_other_id: the record and the likeliest duplicates in the same book (same email,
-- same phone digits, same or similar name), or a search. With it: the preview, keeping
-- p_client_id. "Keep the other one" is the other record's own merge page.
--
-- aal2 is checked here from the verified JWT, as agent_client_account_admin does.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_client_merge_view(
    p_client_id uuid,
    p_other_id  uuid DEFAULT NULL,
    p_search    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_agent  uuid := public.current_agent_id();
    v_client public.client%ROWTYPE;
    v_search text := nullif(btrim(left(p_search, 100)), '');
    v_digits text;
BEGIN
    IF v_agent IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT c.* INTO v_client
      FROM public.client c
     WHERE c.id = p_client_id AND c.agent_id = v_agent AND c.status <> 'merged_into';
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
        RETURN jsonb_build_object(
            'needsMfa',       true,
            'agentHasFactor', EXISTS (
                SELECT 1 FROM auth.mfa_factors f
                 WHERE f.user_id = auth.uid() AND f.status = 'verified'
            )
        );
    END IF;

    IF p_other_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'needsMfa', false,
            'client',   public.client_merge_summary(v_client),
            'preview',  public.client_merge_preview(v_agent, p_client_id, p_other_id)
        );
    END IF;

    v_digits := nullif(regexp_replace(coalesce(v_client.phone, ''), '\D', '', 'g'), '');

    RETURN jsonb_build_object(
        'needsMfa',   false,
        'client',     public.client_merge_summary(v_client),
        'candidates', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                       'clientId',  x.id,
                       'firstName', x.first_name,
                       'lastName',  x.last_name,
                       'email',     x.email,
                       'archived',  x.archived_at IS NOT NULL,
                       'trips',     (SELECT count(*) FROM public.trip t WHERE t.client_id = x.id),
                       'createdAt', x.created_at,
                       'reason',    x.reason
                   ) ORDER BY x.score DESC, x.created_at)
              FROM (
                  SELECT o.*,
                         CASE
                             WHEN v_search IS NOT NULL THEN 'search'
                             WHEN o.email = v_client.email THEN 'email'
                             WHEN v_digits IS NOT NULL
                              AND regexp_replace(coalesce(o.phone, ''), '\D', '', 'g') = v_digits THEN 'phone'
                             ELSE 'name'
                         END AS reason,
                         (CASE WHEN o.email = v_client.email THEN 3 ELSE 0 END)
                         + (CASE WHEN v_digits IS NOT NULL
                                  AND regexp_replace(coalesce(o.phone, ''), '\D', '', 'g') = v_digits THEN 2 ELSE 0 END)
                         + similarity(o.first_name || ' ' || o.last_name,
                                      v_client.first_name || ' ' || v_client.last_name) AS score
                    FROM public.client o
                   WHERE o.agent_id = v_agent
                     AND o.id <> v_client.id
                     AND o.status <> 'merged_into'
                     AND CASE
                           WHEN v_search IS NOT NULL THEN
                               (o.first_name || ' ' || o.last_name) ILIKE '%' || v_search || '%'
                               OR o.email::text ILIKE '%' || v_search || '%'
                           ELSE
                               o.email = v_client.email
                               OR (v_digits IS NOT NULL
                                   AND regexp_replace(coalesce(o.phone, ''), '\D', '', 'g') = v_digits)
                               OR similarity(o.first_name || ' ' || o.last_name,
                                             v_client.first_name || ' ' || v_client.last_name) >= 0.45
                         END
                   ORDER BY score DESC, o.created_at
                   LIMIT 8
              ) x
        ), '[]'::jsonb)
    );
END;
$$;

COMMENT ON FUNCTION public.agent_client_merge_view(uuid, uuid, text) IS
    'Screen 3.9.7 / 3.3.11 for the signed-in advisor: likely duplicates, or the merge preview '
    'keeping p_client_id. NULL when the record is not theirs; {needsMfa: true} until aal2.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The write
--
-- 'merged' | 'not_found' | 'stale' | 'refused' (with `reason`), as `outcome` in the jsonb.
-- p_choices: {"<field>": "keep" | "retire"} for the fields the advisor flipped; anything not
-- named takes its default. p_expect_lock_account: the retired sign-in the Edge Function banned
-- (NULL when it banned nothing); a mismatch is 'stale' and the function lifts the ban.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.account_admin_merge_clients(
    p_agent_id             uuid,
    p_actor_user_id        uuid,
    p_audit_id             uuid,
    p_keep_id              uuid,
    p_retire_id            uuid,
    p_keep_version         integer,
    p_retire_version       integer,
    p_choices              jsonb,
    p_expect_lock_account  uuid,
    p_ip                   text DEFAULT NULL,
    p_user_agent           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_choices      jsonb := coalesce(p_choices, '{}'::jsonb);
    v_bad          text;
    v_keep         public.client%ROWTYPE;
    v_retire       public.client%ROWTYPE;
    v_preview      jsonb;
    v_plan         text;
    v_pinned       text;
    v_lock_account uuid;
    v_lock_pu      uuid;
    v_keep_pref    public.travel_preference%ROWTYPE;
    v_retire_pref  public.travel_preference%ROWTYPE;
    v_before_keep_pref   jsonb;
    v_before_retire_pref jsonb;
    v_client_patch jsonb := '{}'::jsonb;
    v_pref_patch   jsonb := '{}'::jsonb;
    v_final        public.client%ROWTYPE;
    v_name         text;
    v_kg           public.conversation%ROWTYPE;
    v_rg           public.conversation%ROWTYPE;
    v_moved        jsonb;
    v_messages     integer := 0;
    v_f            jsonb;
    v_pick         text;
    v_lock_audit   uuid;
BEGIN
    -- ── Validate the choices before taking a lock ──────────────────────────────
    IF jsonb_typeof(v_choices) <> 'object' THEN
        RAISE EXCEPTION 'choices must be an object' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT string_agg(k, ', ') INTO v_bad
      FROM jsonb_each_text(v_choices) AS e(k, v)
     WHERE k NOT IN (SELECT field FROM public.client_merge_field_list())
        OR v NOT IN ('keep', 'retire');
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'unknown merge choice: %', v_bad USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_keep_id = p_retire_id THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    -- ── Lock both, in id order ────────────────────────────────────────────────
    PERFORM 1
       FROM public.client c
       JOIN public.agent a ON a.id = c.agent_id AND a.status <> 'archived'
      WHERE c.id IN (p_keep_id, p_retire_id)
        AND c.agent_id = p_agent_id
        AND c.status <> 'merged_into'
      ORDER BY c.id
        FOR NO KEY UPDATE OF c;

    SELECT * INTO v_keep FROM public.client
     WHERE id = p_keep_id AND agent_id = p_agent_id AND status <> 'merged_into';
    IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
    SELECT * INTO v_retire FROM public.client
     WHERE id = p_retire_id AND agent_id = p_agent_id AND status <> 'merged_into';
    IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;

    IF v_keep.version <> p_keep_version OR v_retire.version <> p_retire_version THEN
        RETURN jsonb_build_object('outcome', 'stale');
    END IF;

    -- Computed under the locks, so it is the state the moves below act on.
    v_preview := public.client_merge_preview(p_agent_id, p_keep_id, p_retire_id);
    IF v_preview ->> 'blocked' IS NOT NULL THEN
        RETURN jsonb_build_object('outcome', 'refused', 'reason', v_preview ->> 'blocked');
    END IF;

    v_plan   := v_preview ->> 'signInPlan';
    v_pinned := v_preview ->> 'pinnedEmail';
    IF v_plan = 'lock_retired' THEN
        v_lock_account := (v_preview #>> '{retire,signIn,accountId}')::uuid;
    END IF;
    IF v_lock_account IS DISTINCT FROM p_expect_lock_account THEN
        RETURN jsonb_build_object('outcome', 'stale');
    END IF;

    SELECT * INTO v_keep_pref   FROM public.travel_preference WHERE client_id = p_keep_id   FOR UPDATE;
    SELECT * INTO v_retire_pref FROM public.travel_preference WHERE client_id = p_retire_id FOR UPDATE;
    v_before_keep_pref   := CASE WHEN v_keep_pref.id IS NULL THEN NULL ELSE to_jsonb(v_keep_pref) END;
    v_before_retire_pref := CASE WHEN v_retire_pref.id IS NULL THEN NULL ELSE to_jsonb(v_retire_pref) END;

    -- ── The ids of everything that moves, for the audit row ─────────────────────
    v_moved := jsonb_build_object(
        'trips',           (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]') FROM public.trip WHERE client_id = p_retire_id),
        'conversations',   (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]') FROM public.conversation WHERE client_id = p_retire_id),
        'notes',           (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]') FROM public.client_note WHERE client_id = p_retire_id),
        'companions',      (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]') FROM public.companion WHERE client_id = p_retire_id),
        'linkedCompanions',(SELECT coalesce(jsonb_agg(id ORDER BY id), '[]') FROM public.companion WHERE linked_client_id = p_retire_id),
        'documents',       (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]') FROM public.document WHERE client_id = p_retire_id),
        'travelDocuments', (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]') FROM public.travel_document WHERE client_id = p_retire_id),
        'testimonials',    (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]') FROM public.testimonial WHERE client_id = p_retire_id),
        'invites',         (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]') FROM public.client_invite WHERE client_id = p_retire_id),
        'mergedEarlier',   (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]') FROM public.client WHERE merged_into_client_id = p_retire_id)
    );

    -- ── The final values ──────────────────────────────────────────────────────
    FOR v_f IN SELECT jsonb_array_elements(v_preview -> 'fields') LOOP
        v_pick := CASE WHEN (v_f ->> 'pinned')::boolean THEN 'pinned'
                       ELSE coalesce(v_choices ->> (v_f ->> 'field'), v_f ->> 'default') END;
        IF v_f ->> 'source' = 'client' THEN
            v_client_patch := v_client_patch || jsonb_build_object(
                v_f ->> 'field',
                CASE v_pick WHEN 'pinned' THEN to_jsonb(v_pinned)
                            WHEN 'retire' THEN v_f -> 'retireValue'
                            ELSE v_f -> 'keepValue' END);
        ELSE
            v_pref_patch := v_pref_patch || jsonb_build_object(
                v_f ->> 'field',
                CASE v_pick WHEN 'retire' THEN v_f -> 'retireValue' ELSE v_f -> 'keepValue' END);
        END IF;
    END LOOP;

    -- A key with a JSON null sets that column to NULL; the NOT NULL arrays are coalesced to
    -- their defaults in the UPDATE below.
    v_final := jsonb_populate_record(v_keep, v_client_patch);
    IF btrim(coalesce(v_final.first_name, '')) = '' OR btrim(coalesce(v_final.last_name, '')) = '' THEN
        RETURN jsonb_build_object('outcome', 'refused', 'reason', 'name_required');
    END IF;
    v_name := trim(v_final.first_name || ' ' || v_final.last_name);

    -- ── 1. Sign-ins. Lock first: account_admin_set_lock refuses a merged record. ──
    IF v_plan = 'lock_retired' THEN
        v_lock_audit := public.uuid_v7();
        IF public.account_admin_set_lock(
               p_agent_id, p_actor_user_id, v_lock_audit, p_retire_id, true,
               left('Merged into ' || v_name, 500), p_ip, p_user_agent) IS NULL THEN
            RETURN jsonb_build_object('outcome', 'stale');
        END IF;
        SELECT pu.id INTO v_lock_pu FROM public.platform_user pu WHERE pu.account_id = v_lock_account;
        -- Replies queued for the locked sign-in would go to an address that is no longer theirs.
        UPDATE public.email_outbox SET state = 'cleared'
         WHERE client_user_id = v_lock_pu AND state = 'pending';
    ELSIF v_plan = 'move' THEN
        UPDATE public.platform_user
           SET client_id = p_keep_id, display_name = v_name, updated_at = now()
         WHERE client_id = p_retire_id AND role = 'client';
        -- An advisor-invite marker (raw_app_meta_data.invited_client_id) may still name the
        -- retired record. It is left alone: GoTrue owns auth.users, and its one reader,
        -- handle_user_email_confirmed(), tests only that the key exists.
    ELSIF v_plan = 'keep' THEN
        UPDATE public.platform_user
           SET display_name = v_name, updated_at = now()
         WHERE client_id = p_keep_id AND role = 'client';
    END IF;

    -- ── 2. One general thread ─────────────────────────────────────────────────
    SELECT * INTO v_kg FROM public.conversation
     WHERE client_id = p_keep_id AND trip_id IS NULL AND archived_at IS NULL FOR UPDATE;
    SELECT * INTO v_rg FROM public.conversation
     WHERE client_id = p_retire_id AND trip_id IS NULL AND archived_at IS NULL FOR UPDATE;

    IF v_kg.id IS NOT NULL AND v_rg.id IS NOT NULL THEN
        -- Close it first (its counts to 0 clear any pending push or email for it), so it can
        -- move without a second live general thread on the kept record.
        UPDATE public.conversation
           SET archived_at = now(), agent_unread_count = 0, client_unread_count = 0, updated_at = now()
         WHERE id = v_rg.id;

        UPDATE public.message SET conversation_id = v_kg.id WHERE conversation_id = v_rg.id;
        GET DIAGNOSTICS v_messages = ROW_COUNT;

        UPDATE public.conversation
           SET last_message_at      = greatest(v_kg.last_message_at, v_rg.last_message_at),
               last_message_preview = CASE WHEN v_rg.last_message_at > v_kg.last_message_at
                                           THEN v_rg.last_message_preview
                                           ELSE v_kg.last_message_preview END,
               agent_unread_count   = v_kg.agent_unread_count + v_rg.agent_unread_count,
               -- A client message the advisor has not read brings an archived thread back,
               -- as the client's next message would.
               agent_archived_at    = CASE WHEN v_rg.agent_unread_count > 0 THEN NULL
                                           ELSE v_kg.agent_archived_at END,
               updated_at           = now()
         WHERE id = v_kg.id;

        -- Raising the count fires conversation_push_outbox, which would announce messages the
        -- advisor was already told about (the retired thread's push was cleared or dismissed
        -- above). Take back exactly what this merge added, so the merge itself notifies nobody.
        IF v_rg.agent_unread_count > 0 THEN
            IF v_kg.agent_unread_count = 0 THEN
                UPDATE public.push_outbox SET state = 'cleared'
                 WHERE conversation_id = v_kg.id AND state = 'pending';
            ELSE
                UPDATE public.push_outbox
                   SET message_count = greatest(message_count - v_rg.agent_unread_count, 1)
                 WHERE conversation_id = v_kg.id AND state = 'pending';
            END IF;
        END IF;
    END IF;

    -- ── 3. Everything else moves ──────────────────────────────────────────────
    UPDATE public.trip         SET client_id = p_keep_id, updated_at = now() WHERE client_id = p_retire_id;
    UPDATE public.conversation SET client_id = p_keep_id, updated_at = now() WHERE client_id = p_retire_id;
    UPDATE public.client_note  SET client_id = p_keep_id WHERE client_id = p_retire_id;
    UPDATE public.document     SET client_id = p_keep_id WHERE client_id = p_retire_id;
    UPDATE public.travel_document SET client_id = p_keep_id WHERE client_id = p_retire_id;
    UPDATE public.testimonial  SET client_id = p_keep_id, updated_at = now() WHERE client_id = p_retire_id;

    -- An invite to the retired record would bind a sign-in to a record that is now merged.
    UPDATE public.client_invite SET revoked_at = now()
     WHERE client_id = p_retire_id AND accepted_at IS NULL AND revoked_at IS NULL;
    UPDATE public.client_invite SET client_id = p_keep_id WHERE client_id = p_retire_id;

    -- A companion that is one of the pair would become the kept record's companion of itself.
    -- Closed first, so the cap trigger never counts it on the way in.
    UPDATE public.companion SET archived_at = now(), updated_at = now()
     WHERE client_id IN (p_keep_id, p_retire_id)
       AND linked_client_id IN (p_keep_id, p_retire_id)
       AND archived_at IS NULL;
    UPDATE public.companion SET client_id = p_keep_id, updated_at = now() WHERE client_id = p_retire_id;
    UPDATE public.companion SET linked_client_id = p_keep_id, updated_at = now() WHERE linked_client_id = p_retire_id;

    -- One hop, always.
    UPDATE public.client SET merged_into_client_id = p_keep_id, updated_at = now()
     WHERE merged_into_client_id = p_retire_id;

    -- ── 4. travel_preference: one row per client ──────────────────────────────
    IF v_keep_pref.id IS NOT NULL OR v_retire_pref.id IS NOT NULL THEN
        IF v_keep_pref.id IS NULL THEN
            -- Only the retired record has one: it moves, then takes the picks.
            UPDATE public.travel_preference SET client_id = p_keep_id WHERE id = v_retire_pref.id;
            v_keep_pref := v_retire_pref;
            v_keep_pref.client_id := p_keep_id;
        END IF;
        -- When both have one, the retired row stays on the retired record, unchanged.
        v_keep_pref := jsonb_populate_record(v_keep_pref, v_pref_patch);
        UPDATE public.travel_preference SET
            preferred_destinations = coalesce(v_keep_pref.preferred_destinations, '{}'),
            travel_styles          = coalesce(v_keep_pref.travel_styles, '{}'),
            dietary_restrictions   = coalesce(v_keep_pref.dietary_restrictions, '{}'),
            accessibility_needs    = coalesce(v_keep_pref.accessibility_needs, '{}'),
            loyalty_programs       = coalesce(v_keep_pref.loyalty_programs, '[]'::jsonb),
            budget_band            = v_keep_pref.budget_band,
            favorite_past_trips    = v_keep_pref.favorite_past_trips,
            dietary_notes          = v_keep_pref.dietary_notes,
            accessibility_notes    = v_keep_pref.accessibility_notes,
            updated_at             = now()
         WHERE id = v_keep_pref.id;
    END IF;

    -- ── 5. The two records ────────────────────────────────────────────────────
    UPDATE public.client SET
        first_name         = v_final.first_name,
        last_name          = v_final.last_name,
        preferred_name     = v_final.preferred_name,
        email              = v_final.email,
        phone              = v_final.phone,
        date_of_birth      = v_final.date_of_birth,
        mailing_address_id = v_final.mailing_address_id,
        emergency_contact  = v_final.emergency_contact,
        important_dates    = coalesce(v_final.important_dates, '[]'::jsonb),
        tags               = coalesce(v_final.tags, '{}'),
        notes              = v_final.notes,
        version            = version + 1,
        updated_at         = now()
     WHERE id = p_keep_id;

    UPDATE public.client SET
        status                = 'merged_into',
        merged_into_client_id = p_keep_id,
        version               = version + 1,
        updated_at            = now()
     WHERE id = p_retire_id;

    -- ── 6. The audit rows ─────────────────────────────────────────────────────
    PERFORM public.account_admin_audit(
        p_audit_id, p_actor_user_id, 'client.merged', p_keep_id,
        jsonb_build_object(
            'retiredClientId',  p_retire_id,
            'before', jsonb_build_object(
                'kept',             to_jsonb(v_keep),
                'retired',          to_jsonb(v_retire),
                'keptPreference',   v_before_keep_pref,
                'retiredPreference', v_before_retire_pref,
                'keptGeneralThreadId',    v_kg.id,
                'retiredGeneralThreadId', v_rg.id,
                'keptGeneralThreadUnread',    CASE WHEN v_kg.id IS NULL THEN NULL ELSE
                    jsonb_build_object('agent', v_kg.agent_unread_count, 'client', v_kg.client_unread_count) END,
                'retiredGeneralThreadUnread', CASE WHEN v_rg.id IS NULL THEN NULL ELSE
                    jsonb_build_object('agent', v_rg.agent_unread_count, 'client', v_rg.client_unread_count) END
            ),
            'choices',          v_choices,
            'moved',            v_moved,
            'messagesMoved',    v_messages,
            'signInPlan',       v_plan,
            'retiredSignInAccountId', v_preview #>> '{retire,signIn,accountId}',
            'retiredSignInEmail',     v_preview #>> '{retire,signIn,email}',
            'lockAuditId',            v_lock_audit
        ),
        p_ip, p_user_agent);

    PERFORM public.account_admin_audit(
        public.uuid_v7(), p_actor_user_id, 'client.merged_away', p_retire_id,
        jsonb_build_object('keptClientId', p_keep_id, 'mergeAuditId', p_audit_id),
        p_ip, p_user_agent);

    RETURN jsonb_build_object(
        'outcome',        'merged',
        'keptClientId',   p_keep_id,
        'signInPlan',     v_plan,
        'lockedAccountId', v_lock_account,
        'messagesMoved',  v_messages,
        'counts', jsonb_build_object(
            'trips',          jsonb_array_length(v_moved -> 'trips'),
            'conversations',  jsonb_array_length(v_moved -> 'conversations'),
            'notes',          jsonb_array_length(v_moved -> 'notes'),
            'companions',     jsonb_array_length(v_moved -> 'companions'),
            'documents',      jsonb_array_length(v_moved -> 'documents'),
            'travelDocuments', jsonb_array_length(v_moved -> 'travelDocuments')
        )
    );
END;
$$;

COMMENT ON FUNCTION public.account_admin_merge_clients(uuid, uuid, uuid, uuid, uuid, integer, integer, jsonb, uuid, text, text) IS
    'Merges p_retire_id into p_keep_id (Screen 3.9.7 / 3.3.11): everything attached moves, the '
    'retired record becomes merged_into and is kept, and the audit row holds every value from '
    'before. Service-role only; the account-admin Edge Function bans a second sign-in first.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    FOREACH f IN ARRAY ARRAY[
        'public.client_merge_is_empty(jsonb)',
        'public.client_merge_field_list()',
        'public.client_merge_fields(jsonb, jsonb, jsonb, jsonb, text)',
        'public.client_merge_summary(public.client)',
        'public.client_merge_preview(uuid, uuid, uuid)',
        'public.account_admin_merge_clients(uuid, uuid, uuid, uuid, uuid, integer, integer, jsonb, uuid, text, text)'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.agent_client_merge_view(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.agent_client_merge_view(uuid, uuid, text) TO authenticated, service_role;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
DECLARE
    leaked  text;
    missing text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'client\_merge\_%' OR p.proname = 'account_admin_merge_clients')
       AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR has_function_privilege('anon', p.oid, 'EXECUTE'));
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'merge functions executable by a client role: %', leaked;
    END IF;

    IF has_function_privilege('anon', 'public.agent_client_merge_view(uuid, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon can execute agent_client_merge_view';
    END IF;

    -- Every field the picker offers is a real column on the row it names. A renamed column
    -- would otherwise turn into a field that silently never merges.
    SELECT string_agg(f.field, ', ') INTO missing
      FROM public.client_merge_field_list() f
     WHERE NOT EXISTS (
         SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.table_name = CASE f.source WHEN 'client' THEN 'client' ELSE 'travel_preference' END
            AND c.column_name = f.field);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'merge fields with no column: %', missing;
    END IF;

    -- Every table that points at client is one the write moves (or platform_user, which it
    -- handles by the sign-in rule, or client itself). A new one would be left on the retired
    -- record without this check failing the migration.
    SELECT string_agg(DISTINCT c.conrelid::regclass::text, ', ') INTO missing
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.client'::regclass
       AND c.conrelid::regclass::text NOT IN (
           'client', 'platform_user', 'travel_preference', 'trip', 'conversation', 'client_note',
           'companion', 'document', 'travel_document', 'testimonial', 'client_invite');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'tables referencing client that the merge does not move: %', missing;
    END IF;
END $$;

COMMIT;
