-- §3.10 Stage 2: message templates (Screens 3.10.3 Picker, 3.10.4 Library, 3.10.5 Editor).
--
-- `message_template` has existed since the initial migration with RLS on, a place in the
-- agent-domain lockdown, no write path and no rows. This gives it a producer, a reader, the
-- picker's merge data, and seven starters.
--
-- ── WHAT GYASI RULED (2026-10-14, Stage 2 grilling) ─────────────────────────────────────
--
--   * PLAIN TEXT with `{{tokens}}`. The column keeps its `body_markdown` name; rich text is
--     settled with email in Stage 4. The subject column stays and nothing writes it yet.
--   * A FIXED SET OF MERGE FIELDS (Data-Model §12.4). An unknown token is refused on save,
--     here and in the Edge Function, so `{{client.firstname}}` never reaches a picker.
--   * NO AUDIT ROWS. A template holds no client data, so it is outside Rule 3's tables.
--   * NOTHING LINKS A MESSAGE TO ITS TEMPLATE, so there is no use count and editing a
--     template never changes a message already sent.
--   * ARCHIVE ONLY (Data-Model §20.1), with Restore, and Duplicate.
--   * SEVEN STARTERS for every agent that exists now; a later agent's copy waits for P3.
--
-- ── IDS ARE V7 (Data-Model §21.6) ───────────────────────────────────────────────────────
--
-- Create and duplicate take an id the browser minted, which also makes a double-click land
-- once. The starters are minted here, by `uuid_v7()`, because nobody's browser is involved.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A v7 id from SQL
-- ─────────────────────────────────────────────────────────────────────────────

-- Postgres 17 has no uuidv7() (18 does). The 48-bit Unix millisecond timestamp goes over the
-- first six bytes of a random v4, and the version nibble moves from 4 (0100) to 7 (0111) by
-- setting bits 52 and 53. The variant bits are already right, since v4 sets them too.
CREATE OR REPLACE FUNCTION public.uuid_v7()
RETURNS uuid
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
    SELECT encode(
             set_bit(set_bit(
               overlay(uuid_send(gen_random_uuid())
                       PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
                       FROM 1 FOR 6),
               52, 1), 53, 1),
             'hex')::uuid;
$$;

COMMENT ON FUNCTION public.uuid_v7() IS
    'A time-ordered v7 uuid (Data-Model §21.6) for rows SQL mints itself, such as the starter '
    'templates. Postgres 17 has no uuidv7(); drop this for the built-in on 18.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The table's rules
-- ─────────────────────────────────────────────────────────────────────────────

-- Nothing has ever written this table, so no row can fail these.
ALTER TABLE public.message_template
    ADD CONSTRAINT message_template_category CHECK (category IN (
        'lead_response', 'proposal', 'booking_confirmation', 'pre_trip', 'post_trip',
        'payment_reminder', 'other')),
    ADD CONSTRAINT message_template_name CHECK (
        name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
    -- One message's ceiling (agent-message's MAX_MESSAGE_BODY), so an inserted template can
    -- never be too long to send.
    ADD CONSTRAINT message_template_body CHECK (
        btrim(body_markdown) <> '' AND char_length(body_markdown) <= 8000),
    ADD CONSTRAINT message_template_tags CHECK (cardinality(tags) <= 10);

CREATE INDEX message_template_agent_live ON public.message_template (agent_id) WHERE archived_at IS NULL;

-- The merge fields, in one place SQL can check. `_shared/messageTemplate.ts` and
-- `web/lib/agent/templates/merge.ts` carry the same list, and a test on each side reads this
-- function's body to prove they agree.
CREATE OR REPLACE FUNCTION public.message_template_fields()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT ARRAY[
        'client.firstName', 'trip.name', 'trip.destination', 'trip.dates', 'agent.firstName',
        'payment.label', 'payment.amount', 'payment.dueDate'
    ]::text[];
$$;

-- Every `{{ ... }}` in a body whose inside is not one of the fields, in order, once each. The
-- inside is trimmed of ALL whitespace (tabs and newlines too), as TypeScript's trim() does:
-- btrim() alone strips only spaces, so `{{client.firstName\n}}` would pass the Edge Function
-- and then raise here as a 500.
CREATE OR REPLACE FUNCTION public.message_template_unknown_tokens(p_body text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(array_agg(tok ORDER BY first_at), ARRAY[]::text[])
      FROM (
            SELECT regexp_replace(m[1], '^\s+|\s+$', '', 'g') AS tok, min(ord) AS first_at
              FROM regexp_matches(coalesce(p_body, ''), '\{\{([^{}]*)\}\}', 'g') WITH ORDINALITY AS r(m, ord)
             GROUP BY 1
           ) found
     WHERE NOT (tok = ANY (public.message_template_fields()));
$$;

-- Tags as the editor means them: trimmed, no blanks, no repeats (ignoring case, first
-- spelling wins), each at most 30 characters, at most 10.
CREATE OR REPLACE FUNCTION public.message_template_clean_tags(p_tags text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(array_agg(tag ORDER BY first_at), ARRAY[]::text[])
      FROM (
            SELECT DISTINCT ON (lower(btrim(t))) btrim(t) AS tag, ord AS first_at
              FROM unnest(coalesce(p_tags, ARRAY[]::text[])) WITH ORDINALITY AS u(t, ord)
             WHERE btrim(t) <> ''
             ORDER BY lower(btrim(t)), ord
           ) d;
$$;

-- The one check every write runs, raising in English the Edge Function has already said.
CREATE OR REPLACE FUNCTION public.message_template_check(
    p_category text, p_name text, p_body text, p_tags text[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_unknown text[] := public.message_template_unknown_tokens(p_body);
BEGIN
    IF p_category IS NULL OR p_category NOT IN ('lead_response', 'proposal', 'booking_confirmation',
            'pre_trip', 'post_trip', 'payment_reminder', 'other') THEN
        RAISE EXCEPTION 'unknown template category %', p_category;
    END IF;
    IF char_length(btrim(coalesce(p_name, ''))) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION 'a template name is 1 to 80 characters';
    END IF;
    IF btrim(coalesce(p_body, '')) = '' OR char_length(p_body) > 8000 THEN
        RAISE EXCEPTION 'a template body is 1 to 8000 characters';
    END IF;
    IF cardinality(v_unknown) > 0 THEN
        RAISE EXCEPTION 'unknown merge fields: %', array_to_string(v_unknown, ', ');
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(public.message_template_clean_tags(p_tags)) t WHERE char_length(t) > 30)
       OR cardinality(public.message_template_clean_tags(p_tags)) > 10 THEN
        RAISE EXCEPTION 'at most 10 tags of at most 30 characters';
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Reads
-- ─────────────────────────────────────────────────────────────────────────────

-- The library AND the picker. Both need the body (the picker previews it and searches it),
-- and an advisor's templates are a few dozen rows, so one read serves both.
CREATE OR REPLACE FUNCTION public.agent_message_templates(p_archived boolean DEFAULT false)
RETURNS TABLE (
    template_id uuid,
    category    text,
    name        text,
    body        text,
    tags        text[],
    archived    boolean,
    updated_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT t.id, t.category, t.name, t.body_markdown, t.tags, t.archived_at IS NOT NULL, t.updated_at
      FROM public.message_template t
     WHERE t.agent_id = public.current_agent_id()
       AND (t.archived_at IS NOT NULL) = coalesce(p_archived, false)
     ORDER BY t.category, lower(t.name), t.id;
$$;

COMMENT ON FUNCTION public.agent_message_templates(boolean) IS
    'Screens 3.10.3 and 3.10.4: the advisor''s live templates, or (true) the archived ones. '
    'Ordered by category then name, the order both screens group them in.';

-- One template, for the editor. Zero rows for "no such template" and "not yours" alike.
CREATE OR REPLACE FUNCTION public.agent_message_template(p_template_id uuid)
RETURNS TABLE (
    template_id uuid,
    category    text,
    name        text,
    body        text,
    tags        text[],
    archived    boolean,
    updated_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT t.id, t.category, t.name, t.body_markdown, t.tags, t.archived_at IS NOT NULL, t.updated_at
      FROM public.message_template t
     WHERE t.id = p_template_id
       AND t.agent_id = public.current_agent_id();
$$;

-- What the picker merges: the client, the trip when there is one, the advisor, and a payment
-- milestone when the picker was opened from one. Raw values; the formatting (the joined
-- destinations, the date range, the money) happens in one TypeScript function the tests pin.
--
-- Zero rows when the client is not the caller's, or a trip or milestone is named that does
-- not belong to them, so nothing can be probed. Archived and merged clients drop out, as they
-- do for agent_message_target.
CREATE OR REPLACE FUNCTION public.agent_message_merge_context(
    p_client_id    uuid,
    p_trip_id      uuid DEFAULT NULL,
    p_milestone_id uuid DEFAULT NULL
)
RETURNS TABLE (
    client_first_name text,
    agent_first_name  text,
    trip_title        text,
    trip_destinations text[],
    trip_start_date   date,
    trip_end_date     date,
    payment_label     text,
    -- What is still OWED on the milestone, a digit string like every money column here.
    payment_owed_cents text,
    payment_currency  text,
    payment_due_date  date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(c.preferred_name, c.first_name),
           -- NULL rather than '' for a blank name, so the sign-off reads as missing.
           nullif(split_part(btrim(a.display_name), ' ', 1), ''),
           t.title, t.destinations, t.start_date, t.end_date,
           pm.label,
           CASE WHEN pm.id IS NULL THEN NULL ELSE greatest(pm.amount_cents - pm.paid_cents, 0)::text END,
           pm.currency::text,
           pm.due_date
      FROM public.client c
      JOIN public.agent a ON a.id = c.agent_id
      LEFT JOIN public.trip t ON t.id = p_trip_id
      LEFT JOIN public.payment_milestone pm ON pm.id = p_milestone_id
     WHERE c.id = p_client_id
       AND c.agent_id = public.current_agent_id()
       AND c.archived_at IS NULL
       AND c.status <> 'merged_into'
       AND (p_trip_id IS NULL
            OR (t.id IS NOT NULL AND t.client_id = c.id AND t.agent_id = c.agent_id AND t.archived_at IS NULL))
       AND (p_milestone_id IS NULL
            OR (p_trip_id IS NOT NULL AND pm.id IS NOT NULL AND pm.trip_id = p_trip_id));
$$;

COMMENT ON FUNCTION public.agent_message_merge_context(uuid, uuid, uuid) IS
    'Screen 3.10.3''s merge data for one client, optionally one of their trips and one of that '
    'trip''s payment milestones. payment_owed_cents is amount less paid, the number a reminder '
    'is about. Zero rows when anything named is not the caller''s.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Writes (service_role, through the agent-message-template Edge Function)
-- ─────────────────────────────────────────────────────────────────────────────

-- Create with the browser's id. 'exists' when that id is already this agent's (a double
-- click or a retry); 'conflict' when it is someone else's, which only a forged id reaches.
CREATE OR REPLACE FUNCTION public.agent_create_message_template(
    p_template_id uuid,
    p_agent_id    uuid,
    p_category    text,
    p_name        text,
    p_body        text,
    p_tags        text[]
)
RETURNS TABLE (outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner uuid;
BEGIN
    PERFORM public.message_template_check(p_category, p_name, p_body, p_tags);

    INSERT INTO public.message_template (id, agent_id, category, name, body_markdown, tags)
    VALUES (p_template_id, p_agent_id, p_category, btrim(p_name), p_body,
            public.message_template_clean_tags(p_tags))
    ON CONFLICT (id) DO NOTHING;

    IF FOUND THEN
        RETURN QUERY SELECT 'created'::text;
        RETURN;
    END IF;

    SELECT t.agent_id INTO v_owner FROM public.message_template t WHERE t.id = p_template_id;
    RETURN QUERY SELECT CASE WHEN v_owner = p_agent_id THEN 'exists' ELSE 'conflict' END::text;
END;
$$;

-- Edit a live template. 'noop' when nothing differs, so updated_at ("Last edited") does not
-- move for a Save that changed nothing.
CREATE OR REPLACE FUNCTION public.agent_update_message_template(
    p_template_id uuid,
    p_agent_id    uuid,
    p_category    text,
    p_name        text,
    p_body        text,
    p_tags        text[]
)
RETURNS TABLE (outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_name text := btrim(coalesce(p_name, ''));
    v_tags text[] := public.message_template_clean_tags(p_tags);
    v_hit  boolean;
BEGIN
    PERFORM public.message_template_check(p_category, p_name, p_body, p_tags);

    UPDATE public.message_template t
       SET category = p_category, name = v_name, body_markdown = p_body, tags = v_tags,
           updated_at = now()
     WHERE t.id = p_template_id AND t.agent_id = p_agent_id AND t.archived_at IS NULL
       AND (t.category, t.name, t.body_markdown, t.tags)
           IS DISTINCT FROM (p_category, v_name, p_body, v_tags);

    IF FOUND THEN
        RETURN QUERY SELECT 'changed'::text;
        RETURN;
    END IF;

    SELECT true INTO v_hit FROM public.message_template t
     WHERE t.id = p_template_id AND t.agent_id = p_agent_id AND t.archived_at IS NULL;
    RETURN QUERY SELECT CASE WHEN v_hit THEN 'noop' ELSE 'not_found' END::text;
END;
$$;

-- "Copy of …" in the same category, with the browser's id for the copy. The name is cut to
-- fit 80 characters rather than refused: the advisor asked for a copy, not for a rename.
CREATE OR REPLACE FUNCTION public.agent_duplicate_message_template(
    p_source_id uuid,
    p_new_id    uuid,
    p_agent_id  uuid
)
RETURNS TABLE (outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_owner uuid;
BEGIN
    INSERT INTO public.message_template (id, agent_id, category, name, body_markdown, tags)
    SELECT p_new_id, s.agent_id, s.category,
           btrim(left('Copy of ' || s.name, 80)), s.body_markdown, s.tags
      FROM public.message_template s
     WHERE s.id = p_source_id AND s.agent_id = p_agent_id AND s.archived_at IS NULL
    ON CONFLICT (id) DO NOTHING;

    IF FOUND THEN
        RETURN QUERY SELECT 'created'::text;
        RETURN;
    END IF;

    SELECT t.agent_id INTO v_owner FROM public.message_template t WHERE t.id = p_new_id;
    IF v_owner IS NOT NULL THEN
        RETURN QUERY SELECT CASE WHEN v_owner = p_agent_id THEN 'exists' ELSE 'conflict' END::text;
        RETURN;
    END IF;
    RETURN QUERY SELECT 'not_found'::text;
END;
$$;

-- Archive or restore. 'noop' when it is already where it was asked to go.
CREATE OR REPLACE FUNCTION public.agent_set_message_template_archived(
    p_template_id uuid,
    p_agent_id    uuid,
    p_archived    boolean
)
RETURNS TABLE (outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_hit boolean;
BEGIN
    UPDATE public.message_template t
       SET archived_at = CASE WHEN p_archived THEN now() ELSE NULL END,
           updated_at  = now()
     WHERE t.id = p_template_id AND t.agent_id = p_agent_id
       AND (t.archived_at IS NOT NULL) <> p_archived;

    IF FOUND THEN
        RETURN QUERY SELECT 'changed'::text;
        RETURN;
    END IF;

    SELECT true INTO v_hit FROM public.message_template t
     WHERE t.id = p_template_id AND t.agent_id = p_agent_id;
    RETURN QUERY SELECT CASE WHEN v_hit THEN 'noop' ELSE 'not_found' END::text;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The seven starters
-- ─────────────────────────────────────────────────────────────────────────────

-- Drafted for Gyasi to edit in review (Design-System §2): a friend who has done this a
-- hundred times, room for rest, nothing pushy, welcoming whatever a client believes. The
-- payment reminder is about paying the SUPPLIER; Story-Tail never bills a client (BRD §10.5).
--
-- Writes NOTHING for an agent who already has any template, live or archived, so running it
-- twice, or after an advisor has started their own library, never adds a second set. Returns
-- how many it wrote.
CREATE OR REPLACE FUNCTION public.seed_starter_message_templates(p_agent_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.agent a WHERE a.id = p_agent_id) THEN
        RAISE EXCEPTION 'no agent %', p_agent_id;
    END IF;
    IF EXISTS (SELECT 1 FROM public.message_template t WHERE t.agent_id = p_agent_id) THEN
        RETURN 0;
    END IF;

    INSERT INTO public.message_template (id, agent_id, category, name, body_markdown, tags)
    SELECT public.uuid_v7(), p_agent_id, s.category, s.name, s.body, ARRAY['Starter']
      FROM (VALUES
        ('lead_response', 'Lead response',
$body$Hi {{client.firstName}},

Thanks so much for reaching out about {{trip.destination}}. I'd love to help you plan it.

Give me a little time to pull together a couple of options I'd actually pick for you. If anything comes to mind in the meantime (who's coming, the pace you're hoping for, a must-do), just reply here.

Talk soon,
{{agent.firstName}}$body$),

        ('proposal', 'Proposal · options ready',
$body$Hi {{client.firstName}},

Your options for {{trip.destination}} ({{trip.dates}}) are ready to look over. I picked each one with you in mind.

Take your time with them. When one feels right, or you'd like something changed, let me know and I'll take it from there.

{{agent.firstName}}$body$),

        ('booking_confirmation', 'Booking confirmation',
$body$Hi {{client.firstName}},

Good news: {{trip.name}} is booked! You're all set for {{trip.destination}}, {{trip.dates}}.

I'll keep your itinerary and documents up to date here in the app, so everything lives in one place. The planning is in good hands. All that's left is looking forward to it.

{{agent.firstName}}$body$),

        ('pre_trip', 'Pre-trip · 14 days',
$body$Hi {{client.firstName}},

Two weeks until {{trip.destination}}! A few things worth a look this week:

- Passports or IDs for everyone, valid well past your return date
- Your itinerary in the app, so nothing surprises you
- Anything you'd like to add, like a dinner reservation or an excursion

If anything comes up, just reply here. I'm glad to help.

{{agent.firstName}}$body$),

        ('pre_trip', 'Pre-trip · 7 days',
$body$Hi {{client.firstName}},

One week from now, you'll be in {{trip.destination}}. Soon you get to slow down, rest, and take it all in.

Your full itinerary is in the app. Give it one last look, and let me know if anything needs to change before you go.

Safe travels,
{{agent.firstName}}$body$),

        ('post_trip', 'Post-trip · welcome home',
$body$Hi {{client.firstName}},

Welcome home! I hope you came back from {{trip.destination}} rested, with a little new wonder.

I'd love to hear how it went: the best moment, and anything I could do better next time. No rush at all. Reply whenever you're ready.

{{agent.firstName}}$body$),

        ('payment_reminder', 'Payment reminder',
$body$Hi {{client.firstName}},

A quick note on {{trip.name}}. Your next supplier payment is {{payment.amount}} ({{payment.label}}), with a due date of {{payment.dueDate}}. That payment goes to the supplier, not to Story-Tail.

If you've already taken care of it, thank you, and you can ignore this. If you have questions, or want me to check anything with them, just reply here.

{{agent.firstName}}$body$)
      ) AS s(category, name, body);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.seed_starter_message_templates(uuid) IS
    'The seven §3.10 starters for one agent. Writes nothing for an agent who already has any '
    'template. Run for every existing agent by this migration and for the local advisor by '
    'seed.sql (which runs AFTER migrations, so the migration alone seeds nothing locally).';

SELECT public.seed_starter_message_templates(a.id) FROM public.agent a WHERE a.status <> 'archived';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    -- Helpers and the seeder: inside definer functions and migrations only.
    FOREACH f IN ARRAY ARRAY[
        'public.uuid_v7()',
        'public.message_template_fields()',
        'public.message_template_unknown_tokens(text)',
        'public.message_template_clean_tags(text[])',
        'public.message_template_check(text, text, text, text[])',
        'public.seed_starter_message_templates(uuid)'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;

    -- Reads: the agent, through current_agent_id().
    FOREACH f IN ARRAY ARRAY[
        'public.agent_message_templates(boolean)',
        'public.agent_message_template(uuid)',
        'public.agent_message_merge_context(uuid, uuid, uuid)'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;

    -- Writes: service_role only. Each takes p_agent_id as trusted input, so an
    -- `authenticated` grant would let any signed-in user write as any advisor.
    FOREACH f IN ARRAY ARRAY[
        'public.agent_create_message_template(uuid, uuid, text, text, text, text[])',
        'public.agent_update_message_template(uuid, uuid, text, text, text, text[])',
        'public.agent_duplicate_message_template(uuid, uuid, uuid)',
        'public.agent_set_message_template_archived(uuid, uuid, boolean)'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;
END $$;

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

DO $$
DECLARE
    writes text[] := ARRAY['agent_create_message_template', 'agent_update_message_template',
                           'agent_duplicate_message_template', 'agent_set_message_template_archived',
                           'seed_starter_message_templates', 'uuid_v7'];
    reads  text[] := ARRAY['agent_message_templates', 'agent_message_template',
                           'agent_message_merge_context'];
    leaked text;
    v_id   uuid := public.uuid_v7();
BEGIN
    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (reads || writes)
       AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'anon can execute §3.10 Stage 2 functions: %', leaked;
    END IF;

    SELECT string_agg(p.proname, ', ') INTO leaked
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (writes)
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'authenticated can execute §3.10 Stage 2 WRITE functions: %. Each takes '
            'p_agent_id as trusted input.', leaked;
    END IF;

    -- The id really is a v7: version nibble 7, variant 10.
    IF substr(v_id::text, 15, 1) <> '7' OR substr(v_id::text, 20, 1) NOT IN ('8', '9', 'a', 'b') THEN
        RAISE EXCEPTION 'uuid_v7() minted %, which is not a v7', v_id;
    END IF;

    -- Every starter uses only known fields: a typo here would block the advisor's own Save.
    IF EXISTS (SELECT 1 FROM public.message_template t
                WHERE cardinality(public.message_template_unknown_tokens(t.body_markdown)) > 0) THEN
        RAISE EXCEPTION 'a starter template uses an unknown merge field';
    END IF;
END $$;

COMMIT;
