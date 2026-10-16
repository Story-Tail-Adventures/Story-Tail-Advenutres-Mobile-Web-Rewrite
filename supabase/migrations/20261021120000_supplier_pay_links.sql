-- §3.6 Supplier pay links, and the end of client card storage (P1).
--
-- Ruled by Gyasi on 2026-10-16 (§3.6 grilling). Data-Model §9 and §9.5 were amended first;
-- this migration follows that text.
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────────────────────
--
--   1. The app never holds a card. The four card tables (`payment_card`,
--      `card_authorization`, `authorization_request`, `card_use_event`) and their three
--      enums are dropped. Stripe could never show a full card number for a stored card, so
--      the planned reveal could not exist, and a vault that can costs more than the business
--      can carry. Production was checked read-only on 2026-10-16: all four tables held 0
--      rows. The guard below still refuses to drop a table that holds anything.
--   2. Clients pay suppliers through links. `payment_milestone` gains `pay_url` (one link per
--      milestone), plus `paid_reference` and `paid_note` for the advisor's Mark Paid.
--   3. Every link change and every paid mark writes its `audit_event` row INSIDE the same SQL
--      transaction as the write (Data-Model §9.5's table). A swapped link could send a
--      client's money to the wrong place, so the link is audited like money.
--   4. Two reads change shape to drop the card (`agent_trip_overview`) and the card sweep
--      (`sweep_dated_promises`). One read widens (`agent_trip_payments`), one is new
--      (`agent_trip_payment_history`), and the template merge gains `{{payment.link}}`.
--
-- ── NO CARD NUMBERS, EVER ───────────────────────────────────────────────────────────────
--
-- `pay_url`, `paid_reference` and `paid_note` are REFUSED, not masked, if they hold a
-- 13 to 19 digit run that passes the Luhn check. Here the advisor is typing, so the right
-- answer is to say no. The Edge Function says it first in English; the CHECK is the last
-- line of defense.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The template merge fields (kept FIRST in this file on purpose)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- web/lib/agent/templateMerge.test.ts reads the list below out of this file with a regex that
-- takes the first function definition it finds, so this stays the first one here.
-- `_shared/messageTemplate.ts` and the web's merge list carry the same nine names.

CREATE OR REPLACE FUNCTION public.message_template_fields()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT ARRAY[
        'client.firstName', 'trip.name', 'trip.destination', 'trip.dates', 'agent.firstName',
        'payment.label', 'payment.amount', 'payment.dueDate', 'payment.link'
    ]::text[];
$$;

REVOKE ALL ON FUNCTION public.message_template_fields() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.message_template_fields() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Retire the card tables
-- ─────────────────────────────────────────────────────────────────────────────

-- LOUD, NOT SILENT. Production held 0 rows in all four on 2026-10-16. If any database this
-- runs on holds even one, stop and make a person decide, rather than drop data quietly.
DO $$
DECLARE
    t text;
    n bigint;
BEGIN
    FOREACH t IN ARRAY ARRAY['card_use_event', 'authorization_request',
                             'card_authorization', 'payment_card']
    LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
            IF n > 0 THEN
                RAISE EXCEPTION
                    'public.% holds % row(s). §3.6 drops the card tables on the ruling that '
                    'they are empty (checked in production 2026-10-16). Export or remove '
                    'these rows on purpose first; this migration will not drop data.', t, n;
            END IF;
        END IF;
    END LOOP;
END $$;

-- The two functions that read these tables go first. A plpgsql or sql body holds no
-- dependency on a table, so a DROP TABLE would succeed and leave them failing at call time.
-- Both are recreated below without the card.
DROP FUNCTION IF EXISTS public.agent_trip_overview(uuid);
DROP FUNCTION IF EXISTS public.sweep_dated_promises();

-- Children first, so no CASCADE is needed and nothing else can be taken by surprise.
DROP TABLE public.card_use_event;
DROP TABLE public.authorization_request;
DROP TABLE public.card_authorization;
DROP TABLE public.payment_card;

DROP TYPE public.card_status;
DROP TYPE public.card_auth_status;
DROP TYPE public.auth_request_status;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 20260917090000's lockdown, restated over the two tables still standing
-- ─────────────────────────────────────────────────────────────────────────────
--
-- That migration revoked every client-role privilege on six tables and asserted it. Four of
-- the six are gone; `audit_event` and `commission` remain, and the posture still has to
-- hold for them. A DO block only sees the catalog of its own day, so it is said again here.

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['audit_event', 'commission']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
END $$;

DO $$
DECLARE leaked text;
BEGIN
    SELECT string_agg(DISTINCT table_name || ' (' || grantee || ')', ', ') INTO leaked
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND grantee IN ('anon', 'authenticated')
       AND table_name IN ('audit_event', 'commission');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'audit_event / commission grant privileges to a client role: %', leaked;
    END IF;

    SELECT string_agg(DISTINCT table_name || '.' || column_name || ' (' || grantee || ')', ', ')
      INTO leaked
      FROM information_schema.column_privileges
     WHERE table_schema = 'public'
       AND grantee IN ('anon', 'authenticated')
       AND table_name IN ('audit_event', 'commission');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'audit_event / commission columns granted to a client role: %', leaked;
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Helpers: the card-number guard, and the host a client is shown
-- ─────────────────────────────────────────────────────────────────────────────

-- True when the text holds a card number: any span of whole digit groups that joins to 13 to
-- 19 digits AND passes Luhn. A run is ASCII digit groups joined by up to three spaces, dots,
-- dashes or no-break / thin spaces (the ways people write a card). Every starting group is
-- tried, so a short number in front ("Paid 12 4111...") cannot swallow the card, and letters
-- or underscores touching the digits end a run without hiding one. [0-9], never \d: a
-- fullwidth digit must not reach the ::int cast. `_shared/payLink.ts` and web
-- `lib/trips/payLink.ts` carry the same rule. The Luhn step lets a long supplier reference
-- through when it is not a card number; a mistyped card that fails Luhn is not caught.
CREATE OR REPLACE FUNCTION public.text_has_card_digits(p_text text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_run    text[];
    v_groups text[];
    v_digits text;
    v_sum    int;
    v_d      int;
    i        int;
    j        int;
    k        int;
BEGIN
    IF p_text IS NULL THEN
        RETURN false;
    END IF;
    FOR v_run IN
        SELECT regexp_matches(p_text, '[0-9]+(?:[ .\u00a0\u2009\u202f-]{1,3}[0-9]+)*', 'g')
    LOOP
        v_groups := regexp_split_to_array(v_run[1], '[^0-9]+');
        FOR i IN 1 .. array_length(v_groups, 1) LOOP
            v_digits := '';
            FOR j IN i .. array_length(v_groups, 1) LOOP
                v_digits := v_digits || v_groups[j];
                EXIT WHEN length(v_digits) > 19;
                IF length(v_digits) >= 13 THEN
                    v_sum := 0;
                    FOR k IN 1 .. length(v_digits) LOOP
                        v_d := substr(v_digits, length(v_digits) - k + 1, 1)::int;
                        IF k % 2 = 0 THEN
                            v_d := v_d * 2;
                            IF v_d > 9 THEN v_d := v_d - 9; END IF;
                        END IF;
                        v_sum := v_sum + v_d;
                    END LOOP;
                    IF v_sum % 10 = 0 THEN
                        RETURN true;
                    END IF;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
    RETURN false;
END;
$$;

COMMENT ON FUNCTION public.text_has_card_digits(text) IS
    'True when the text holds a 13 to 19 digit card-shaped run that passes Luhn. Used by the '
    'payment_milestone CHECKs (Data-Model §9.5): a card number is refused, never stored.';

-- The site name a client sees, worked out from the link itself (Data-Model §9.5): the host
-- in lower case with a leading `www.` removed. The Edge Function stores `new URL(...).href`,
-- whose host is already ASCII (punycode), so a look-alike domain cannot pass as the real one.
CREATE OR REPLACE FUNCTION public.pay_url_host(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
    SELECT nullif(regexp_replace(lower(substring(p_url FROM '^https://([^/?#:@]+)')), '^www\.', ''), '');
$$;

COMMENT ON FUNCTION public.pay_url_host(text) IS
    'The host of a pay link, lower case, leading www. removed. What Screen 2.2.3 and Payment '
    'History show as the site name.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. payment_milestone gains the link and the paid record (Data-Model §9.5)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.payment_milestone
    ADD COLUMN pay_url        text,
    ADD COLUMN paid_reference text,
    ADD COLUMN paid_note      text,

    -- https only, a host with no user:password@ part, no spaces or control characters.
    ADD CONSTRAINT payment_milestone_pay_url_https CHECK (
        pay_url IS NULL OR (
            char_length(pay_url) <= 2048
            AND pay_url ~ '^https://[^/?#@[:space:]]+([/?#].*)?$'
            AND pay_url !~ '[[:space:][:cntrl:]]'
            -- A named host: the client is shown the host as the trust signal, so no IP
            -- literal, no bare word, no localhost.
            AND public.pay_url_host(pay_url) ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'
            AND public.pay_url_host(pay_url) !~ '^[0-9.]+$'
            AND public.pay_url_host(pay_url) !~ '\.localhost$'
        )
    ),
    ADD CONSTRAINT payment_milestone_paid_reference_shape CHECK (
        paid_reference IS NULL OR (
            char_length(paid_reference) BETWEEN 1 AND 100
            AND paid_reference = btrim(paid_reference)
        )
    ),
    ADD CONSTRAINT payment_milestone_paid_note_shape CHECK (
        paid_note IS NULL OR (
            char_length(paid_note) BETWEEN 1 AND 1000
            AND paid_note = btrim(paid_note)
        )
    ),
    ADD CONSTRAINT payment_milestone_no_card_digits CHECK (
        NOT public.text_has_card_digits(pay_url)
        AND NOT public.text_has_card_digits(paid_reference)
        AND NOT public.text_has_card_digits(paid_note)
    );

COMMENT ON COLUMN public.payment_milestone.pay_url IS
    'The one pay link for this milestone: the supplier''s own payment page, or a Travefy '
    'invoice that passes along supplier cost only (BRD §10.5). https only. Advisor writes '
    '(agent_set_milestone_pay_url, audited), client reads. NULL means no link yet.';
COMMENT ON COLUMN public.payment_milestone.paid_reference IS
    'The supplier''s confirmation or reference number, set with Mark Paid. Client-visible.';
COMMENT ON COLUMN public.payment_milestone.paid_note IS
    'The advisor''s own note on the payment. INTERNAL: outside the client column grant, and '
    'never copied into audit metadata (only whether one exists).';

-- The client grant widens by two columns. paid_note stays out.
GRANT SELECT (pay_url, paid_reference) ON public.payment_milestone TO authenticated;

COMMENT ON POLICY payment_milestone_self_select ON public.payment_milestone IS
    'A client reads the payment schedule for their own trips. NOT every column is theirs any '
    'more (2026-10-16): the column grant names what they see, pay_url and paid_reference '
    'included, and leaves out paid_note, the advisor''s internal note. The policy picks the '
    'rows; the grant picks the columns.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The audit row, written inside the caller's transaction
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The commission writes' shape (20261011120000's commission_audit), with one difference: the
-- actor may be left out, and is then the advisor's own platform_user (platform_user_agent is
-- unique on agent_id, so there is exactly one). That keeps a SQL test or a future caller from
-- writing a row with no "who", which Payment History would show as a blank.

CREATE OR REPLACE FUNCTION public.payment_milestone_audit(
    p_agent_id      uuid,
    p_actor_user_id uuid,
    p_event_type    text,
    p_milestone_id  uuid,
    p_metadata      jsonb,
    p_ip            text,
    p_user_agent    text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor uuid := p_actor_user_id;
    v_ip    inet;
BEGIN
    IF v_actor IS NULL THEN
        SELECT pu.id INTO v_actor
          FROM public.platform_user pu
         WHERE pu.agent_id = p_agent_id AND pu.role = 'agent';
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
        (public.uuid_v7(), v_actor, 'agent', p_event_type, 'payment_milestone', p_milestone_id,
         coalesce(p_metadata, '{}'::jsonb), v_ip, left(p_user_agent, 500));
END;
$$;

COMMENT ON FUNCTION public.payment_milestone_audit(uuid, uuid, text, uuid, jsonb, text, text) IS
    'Writes one payment_milestone audit_event inside the calling transaction, so a link or '
    'paid change and its record land together (Data-Model §9.5). Not executable by any client '
    'role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Set, change or remove a pay link (Screen 3.6.1 / A361b Edit pay link)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.agent_set_milestone_pay_url(
    p_trip_id       uuid,
    p_agent_id      uuid,
    p_milestone_id  uuid,
    p_pay_url       text,
    p_actor_user_id uuid DEFAULT NULL,
    p_ip            text DEFAULT NULL,
    p_user_agent    text DEFAULT NULL
)
RETURNS TABLE (
    outcome      text,   -- 'set' | 'changed' | 'removed' | 'noop'
    milestone_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_existing public.payment_milestone%ROWTYPE;
    v_new      text := nullif(btrim(coalesce(p_pay_url, '')), '');
    v_event    text;
    v_meta     jsonb;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived'
    ) THEN
        RETURN;
    END IF;

    SELECT pm.* INTO v_existing
      FROM public.payment_milestone pm
      JOIN public.trip t ON t.id = pm.trip_id
     WHERE pm.id = p_milestone_id
       AND pm.trip_id = p_trip_id
       AND t.agent_id = p_agent_id
       AND t.archived_at IS NULL
     FOR UPDATE OF pm;

    IF NOT FOUND THEN
        RETURN;   -- "no such milestone" and "not yours" are the same answer.
    END IF;

    -- Same value: nothing changes and nothing is written, the audit row included.
    IF v_existing.pay_url IS NOT DISTINCT FROM v_new THEN
        RETURN QUERY SELECT 'noop'::text, v_existing.id;
        RETURN;
    END IF;

    -- The CHECKs refuse a bad link or a card number here, and the whole call goes with them.
    UPDATE public.payment_milestone
       SET pay_url = v_new,
           updated_at = now()
     WHERE id = v_existing.id;

    IF v_existing.pay_url IS NULL THEN
        v_event := 'set';
        v_meta := jsonb_build_object(
            'trip_id', p_trip_id, 'label', v_existing.label,
            'pay_url', v_new, 'host', public.pay_url_host(v_new));
    ELSIF v_new IS NULL THEN
        v_event := 'removed';
        v_meta := jsonb_build_object(
            'trip_id', p_trip_id, 'label', v_existing.label,
            'old_pay_url', v_existing.pay_url, 'old_host', public.pay_url_host(v_existing.pay_url));
    ELSE
        v_event := 'changed';
        v_meta := jsonb_build_object(
            'trip_id', p_trip_id, 'label', v_existing.label,
            'old_pay_url', v_existing.pay_url, 'old_host', public.pay_url_host(v_existing.pay_url),
            'new_pay_url', v_new, 'new_host', public.pay_url_host(v_new));
    END IF;

    PERFORM public.payment_milestone_audit(
        p_agent_id, p_actor_user_id, 'payment_milestone.link_' || v_event,
        v_existing.id, v_meta, p_ip, p_user_agent);

    RETURN QUERY SELECT v_event, v_existing.id;
END;
$$;

COMMENT ON FUNCTION public.agent_set_milestone_pay_url(uuid, uuid, uuid, text, uuid, text, text) IS
    'Screen 3.6.1''s add / edit / remove pay link. NULL or blank removes. Writes '
    'payment_milestone.link_set / link_changed / link_removed to audit_event in the same '
    'transaction; a no-op writes nothing. service_role only (p_agent_id is trusted input).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Mark paid, widened (Screen 3.6.5)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- DROP + CREATE: new parameters make a new signature, and CREATE OR REPLACE would leave the
-- old five-argument one standing beside it with its own grant.
--
-- `p_paid_reference` / `p_paid_note`: NULL KEEPS what is stored, and a blank string clears
-- it. So §3.4.15's status toggle, which sends neither, cannot wipe a confirmation number the
-- advisor typed on Mark Paid. Both are cleared whenever the status goes back to `scheduled`
-- (or `overdue`, which is a scheduled row past its date).
--
-- `p_paid_on`: the date the money landed (Mark Paid's "Date paid"). NULL keeps the stored
-- `paid_at`, or stamps now() on a first mark, as before. A date is stored as noon in the
-- advisor's own time zone, so it reads back as the same calendar date wherever it is shown;
-- today's date stamps now(). A future date is refused.
--
-- AUDIT, written here rather than by the Edge Function, so there is one row per change:
--   paid                          → payment_milestone.marked_paid
--   waived                        → payment_milestone.marked_waived
--   paid/waived → scheduled/overdue → payment_milestone.payment_cleared
--   scheduled ↔ overdue           → payment_milestone.status_changed (no money moved)

DROP FUNCTION IF EXISTS public.agent_set_milestone_paid(uuid, uuid, uuid, payment_milestone_status, bigint);

CREATE FUNCTION public.agent_set_milestone_paid(
    p_trip_id        uuid,
    p_agent_id       uuid,
    p_milestone_id   uuid,
    p_status         payment_milestone_status,
    p_paid_cents     bigint DEFAULT NULL,
    p_paid_reference text DEFAULT NULL,
    p_paid_note      text DEFAULT NULL,
    p_paid_on        date DEFAULT NULL,
    p_actor_user_id  uuid DEFAULT NULL,
    p_ip             text DEFAULT NULL,
    p_user_agent     text DEFAULT NULL
)
RETURNS TABLE (
    outcome      text,   -- 'changed' | 'noop'
    milestone_id uuid,
    paid_cents   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
    v_existing public.payment_milestone%ROWTYPE;
    v_tz       text;
    v_today    date;
    v_paid     bigint;
    v_paid_at  timestamptz;
    v_ref      text;
    v_note     text;
    v_event    text;
    v_meta     jsonb;
BEGIN
    SELECT a.time_zone INTO v_tz
      FROM public.agent a WHERE a.id = p_agent_id AND a.status <> 'archived';
    IF NOT FOUND THEN
        RETURN;
    END IF;
    v_today := (now() AT TIME ZONE v_tz)::date;

    SELECT pm.* INTO v_existing
      FROM public.payment_milestone pm
      JOIN public.trip t ON t.id = pm.trip_id
     WHERE pm.id = p_milestone_id
       AND pm.trip_id = p_trip_id
       AND t.agent_id = p_agent_id
       AND t.archived_at IS NULL
     FOR UPDATE OF pm;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF p_paid_on IS NOT NULL AND p_paid_on > v_today THEN
        RAISE EXCEPTION 'the date paid cannot be in the future'
              USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- THE MONEY COLUMNS ARE DERIVED FROM THE STATUS, as before (20260929110000's matrix):
    -- paid takes the full amount unless a partial was named; everything else holds nothing.
    IF p_status = 'paid' THEN
        v_paid := coalesce(p_paid_cents, v_existing.amount_cents);
        IF v_paid < 0 THEN
            RAISE EXCEPTION 'a payment cannot be negative';
        END IF;
        IF p_paid_on IS NULL THEN
            -- Kept rather than re-stamped, so marking a row paid twice does not rewrite when
            -- the money actually landed.
            v_paid_at := coalesce(v_existing.paid_at, now());
        ELSIF v_existing.paid_at IS NOT NULL
              AND (v_existing.paid_at AT TIME ZONE v_tz)::date = p_paid_on THEN
            v_paid_at := v_existing.paid_at;   -- same day as stored: not a change
        ELSIF p_paid_on = v_today THEN
            v_paid_at := now();
        ELSE
            v_paid_at := (p_paid_on + time '12:00') AT TIME ZONE v_tz;
        END IF;
    ELSE
        v_paid := 0;
        v_paid_at := NULL;
    END IF;

    IF p_status IN ('paid', 'waived') THEN
        v_ref  := CASE WHEN p_paid_reference IS NULL THEN v_existing.paid_reference
                       ELSE nullif(btrim(p_paid_reference), '') END;
        v_note := CASE WHEN p_paid_note IS NULL THEN v_existing.paid_note
                       ELSE nullif(btrim(p_paid_note), '') END;
    ELSE
        v_ref  := NULL;
        v_note := NULL;
    END IF;

    IF (v_existing.status, v_existing.paid_cents, v_existing.paid_at,
        v_existing.paid_reference, v_existing.paid_note)
       IS NOT DISTINCT FROM (p_status, v_paid, v_paid_at, v_ref, v_note)
    THEN
        RETURN QUERY SELECT 'noop'::text, v_existing.id, v_existing.paid_cents::text;
        RETURN;
    END IF;

    UPDATE public.payment_milestone
       SET status = p_status,
           paid_cents = v_paid,
           paid_at = v_paid_at,
           paid_reference = v_ref,
           paid_note = v_note,
           updated_at = now()
     WHERE id = v_existing.id;

    -- `trip.total_paid_cents` is NOT written here. 20260929100000's trigger recomputes it
    -- from this UPDATE.

    IF p_status = 'paid' THEN
        v_event := 'marked_paid';
    ELSIF p_status = 'waived' THEN
        v_event := 'marked_waived';
    ELSIF v_existing.status IN ('paid', 'waived') THEN
        v_event := 'payment_cleared';
    ELSE
        v_event := 'status_changed';
    END IF;

    -- paid_note itself is never copied here, only whether one exists. The reference is
    -- client-visible already and is what Payment History shows ("conf. SRB-220119-MID").
    v_meta := jsonb_build_object(
        'trip_id',          p_trip_id,
        'label',            v_existing.label,
        'prior_status',     v_existing.status,
        'status',           p_status,
        'old_paid_cents',   v_existing.paid_cents::text,
        'new_paid_cents',   v_paid::text,
        'paid_at',          v_paid_at,
        'paid_reference',   v_ref,
        'has_reference',    v_ref IS NOT NULL,
        'has_note',         v_note IS NOT NULL
    );

    PERFORM public.payment_milestone_audit(
        p_agent_id, p_actor_user_id, 'payment_milestone.' || v_event,
        v_existing.id, v_meta, p_ip, p_user_agent);

    RETURN QUERY SELECT 'changed'::text, v_existing.id, v_paid::text;
END;
$$;

COMMENT ON FUNCTION public.agent_set_milestone_paid(
    uuid, uuid, uuid, payment_milestone_status, bigint, text, text, date, uuid, text, text) IS
    'Screens 3.4.15 and 3.6.5. Moves status, paid_cents and paid_at together, plus the '
    'confirmation number and internal note (NULL keeps, blank clears; both cleared on a return '
    'to scheduled/overdue). Writes its own audit_event (marked_paid / marked_waived / '
    'payment_cleared / status_changed). service_role only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. The schedule read, widened (Screen 3.6.1)
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.agent_trip_payments(uuid);

CREATE FUNCTION public.agent_trip_payments(p_trip_id uuid)
RETURNS TABLE (
    milestone_id   uuid,
    kind           payment_milestone_kind,
    label          text,
    amount_cents   text,
    paid_cents     text,
    currency       char(3),
    due_date       date,
    paid_at        timestamptz,
    status         payment_milestone_status,
    order_index    integer,
    pay_url        text,
    paid_reference text,
    -- Internal. This is the ADVISOR's read (current_agent_id()), never the client's.
    paid_note      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT pm.id, pm.kind, pm.label, pm.amount_cents::text, pm.paid_cents::text,
           pm.currency, pm.due_date, pm.paid_at, pm.status, pm.order_index,
           pm.pay_url, pm.paid_reference, pm.paid_note
      FROM public.payment_milestone pm
      JOIN public.trip t
        ON t.id = pm.trip_id
       AND t.agent_id = public.current_agent_id()
       AND t.archived_at IS NULL
     WHERE pm.trip_id = p_trip_id
     ORDER BY pm.due_date NULLS LAST, pm.order_index;
$$;

COMMENT ON FUNCTION public.agent_trip_payments(uuid) IS
    'Every milestone for the trip, in DUE-DATE order. Serves the Overview sidebar, §3.4.15''s '
    'editor and §3.6.1 Trip Payments. pay_url, paid_reference and paid_note added 2026-10-16; '
    'paid_note is internal and only an advisor accessor returns it.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Payment History (Screen 3.6.6)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Read from audit_event, which every link change and paid mark writes; no new table. Keyed
-- by `metadata.trip_id` rather than a join to payment_milestone, so a milestone deleted later
-- keeps its history (its label comes from the row's metadata then). The milestone writes
-- before 2026-10-16 were audited by the Edge Function and carry trip_id too.
--
-- `ip_address` and `user_agent` are not returned, as in agent_client_activity: forensic
-- columns, not a payments screen's business.

CREATE OR REPLACE FUNCTION public.agent_trip_payment_history(p_trip_id uuid)
RETURNS TABLE (
    event_id        uuid,
    occurred_at     timestamptz,
    event_type      text,
    milestone_id    uuid,
    milestone_label text,
    actor_name      text,
    metadata        jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT ae.id, ae.created_at, ae.event_type, ae.target_id,
           coalesce(pm.label, ae.metadata->>'label'),
           pu.display_name,
           ae.metadata
      FROM public.trip t
      JOIN public.audit_event ae
        ON ae.target_entity = 'payment_milestone'
       AND ae.metadata->>'trip_id' = t.id::text
       AND ae.event_type IN (
           'payment_milestone.link_set', 'payment_milestone.link_changed',
           'payment_milestone.link_removed', 'payment_milestone.marked_paid',
           'payment_milestone.marked_waived', 'payment_milestone.payment_cleared',
           'payment_milestone.status_changed')
      LEFT JOIN public.payment_milestone pm ON pm.id = ae.target_id
      LEFT JOIN public.platform_user pu ON pu.id = ae.actor_user_id
     WHERE t.id = p_trip_id
       AND t.agent_id = public.current_agent_id()
       AND t.archived_at IS NULL
     ORDER BY ae.created_at DESC, ae.id DESC;
$$;

COMMENT ON FUNCTION public.agent_trip_payment_history(uuid) IS
    'Screen 3.6.6. Every paid mark and pay link change on one of the caller''s trips, newest '
    'first, from audit_event. milestone_label is the current label, or the one recorded in the '
    'event if the milestone was deleted. Zero rows for a trip that is not the caller''s.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Templates: {{payment.link}} in the merge context and the starter
-- ─────────────────────────────────────────────────────────────────────────────

-- DROP + CREATE: a new output column changes the result type.
DROP FUNCTION IF EXISTS public.agent_message_merge_context(uuid, uuid, uuid);

CREATE FUNCTION public.agent_message_merge_context(
    p_client_id    uuid,
    p_trip_id      uuid DEFAULT NULL,
    p_milestone_id uuid DEFAULT NULL
)
RETURNS TABLE (
    client_first_name  text,
    agent_first_name   text,
    trip_title         text,
    trip_destinations  text[],
    trip_start_date    date,
    trip_end_date      date,
    payment_label      text,
    payment_owed_cents text,
    payment_currency   text,
    payment_due_date   date,
    -- The milestone's pay_url, as stored. NULL when there is none, so `{{payment.link}}`
    -- stays unfilled and the picker flags it (Data-Model §12.4).
    payment_link       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT coalesce(c.preferred_name, c.first_name),
           nullif(split_part(btrim(a.display_name), ' ', 1), ''),
           t.title, t.destinations, t.start_date, t.end_date,
           pm.label,
           CASE WHEN pm.id IS NULL THEN NULL ELSE greatest(pm.amount_cents - pm.paid_cents, 0)::text END,
           pm.currency::text,
           pm.due_date,
           pm.pay_url
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
    'trip''s payment milestones. payment_owed_cents is amount less paid; payment_link is the '
    'milestone''s pay_url (§3.6.2 Send Payment Link). Zero rows when anything named is not '
    'the caller''s.';

-- The starter, for agents seeded from now on. Only the payment reminder changes: one line
-- carrying the link, after the line that says the money goes to the supplier.
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

You can pay it on their own secure site here: {{payment.link}}

If you've already taken care of it, thank you, and you can ignore this. If you have questions, or want me to check anything with them, just reply here.

{{agent.firstName}}$body$)
      ) AS s(category, name, body);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Existing copies: ONLY where the advisor's copy is still byte-identical to the original
-- starter (Data-Model §12.4: a template an advisor already edited is never rewritten).
UPDATE public.message_template t
   SET body_markdown = replace(
           t.body_markdown,
           E'That payment goes to the supplier, not to Story-Tail.\n\n',
           E'That payment goes to the supplier, not to Story-Tail.\n\n'
           || E'You can pay it on their own secure site here: {{payment.link}}\n\n'),
       updated_at = now()
 WHERE t.category = 'payment_reminder'
   AND t.body_markdown = $body$Hi {{client.firstName}},

A quick note on {{trip.name}}. Your next supplier payment is {{payment.amount}} ({{payment.label}}), with a due date of {{payment.dueDate}}. That payment goes to the supplier, not to Story-Tail.

If you've already taken care of it, thank you, and you can ignore this. If you have questions, or want me to check anything with them, just reply here.

{{agent.firstName}}$body$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. agent_trip_overview, without the card (Screen 3.4.2)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 20261001100000's definition with the `card` CTE and its three columns (card_last4,
-- card_brand, card_spending_limit_cents) taken out. Dropped in section 2.

CREATE FUNCTION public.agent_trip_overview(p_trip_id uuid)
RETURNS TABLE (
    trip_id                   uuid,
    client_id                 uuid,
    client_display_name       text,
    title                     text,
    trip_type                 trip_type,
    status                    trip_status,
    status_changed_at         timestamptz,
    start_date                date,
    end_date                  date,
    destinations              text[],
    traveler_count            integer,
    traveler_breakdown        jsonb,
    total_value_cents         text,
    total_paid_cents          text,
    total_commission_cents    text,
    currency                  char(3),
    cancellation_reason       text,
    refund_status             text,
    refund_detail             text,
    notes                     text,
    version                   integer,
    last_activity_at          timestamptz,
    component_count           integer,
    manual_component_count    integer,
    api_component_count       integer,
    as_of_date                date,
    next_unpaid_due_date      date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT t.*
          FROM public.trip t
         WHERE t.id = p_trip_id
           AND t.agent_id = public.current_agent_id()
           AND t.archived_at IS NULL
    ),
    client_row AS (
        SELECT coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name AS name
          FROM public.client c, me
         WHERE c.id = me.client_id
    ),
    -- "Last activity" is the later of a stage change or a message on this trip's live
    -- (unarchived) threads. See 20261001100000 for why archived threads do not count.
    activity AS (
        SELECT greatest(
                   (SELECT max(h.changed_at) FROM public.trip_status_history h
                     WHERE h.trip_id = p_trip_id),
                   (SELECT max(cv.last_message_at) FROM public.conversation cv
                     WHERE cv.trip_id = p_trip_id AND cv.archived_at IS NULL)
               ) AS at
    ),
    comps AS (
        SELECT count(*)::integer AS n,
               count(*) FILTER (WHERE api_source IS NULL)::integer     AS manual_n,
               count(*) FILTER (WHERE api_source IS NOT NULL)::integer AS api_n
          FROM public.trip_component
         WHERE trip_id = p_trip_id AND archived_at IS NULL
    ),
    -- The agent's OWN today, for tripStatusPresentation's "Final payment due" label.
    due AS (
        SELECT (now() AT TIME ZONE a.time_zone)::date AS today,
               (SELECT min(pm.due_date)
                  FROM public.payment_milestone pm
                 WHERE pm.trip_id = p_trip_id
                   AND pm.status IN ('scheduled', 'overdue')
                   AND pm.due_date IS NOT NULL) AS next_unpaid
          FROM public.agent a, me
         WHERE a.id = me.agent_id
    )
    SELECT
        me.id, me.client_id, client_row.name, me.title, me.trip_type, me.status,
        me.status_changed_at, me.start_date, me.end_date, me.destinations,
        me.traveler_count, me.traveler_breakdown,
        me.total_value_cents::text, me.total_paid_cents::text, me.total_commission_cents::text,
        me.currency, me.cancellation_reason, me.refund_status, me.refund_detail,
        me.notes, me.version,
        activity.at,
        comps.n, comps.manual_n, comps.api_n,
        due.today, due.next_unpaid
      FROM me, client_row, activity, comps, due;
$$;

COMMENT ON FUNCTION public.agent_trip_overview(uuid) IS
    'Screen 3.4.2''s header, at-a-glance grid, and the two sidebar cards'' underlying figures. '
    'No card columns since 2026-10-16: the app holds no card (§3.6). '
    'total_commission_cents and notes are both Internal (outside the client grant) and are '
    'exactly why this is an accessor rather than a plain select.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. The sweep, without the card branch
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Dropped in section 2 (its result type loses `authorizations_expired`). The cron job's
-- command is `SELECT public.sweep_dated_promises();`, which resolves by name at run time,
-- so the job keeps working without being rescheduled. That is asserted below.

CREATE FUNCTION public.sweep_dated_promises()
RETURNS TABLE (milestones_marked_overdue integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_milestones integer;
BEGIN
    -- `due_date < current_date`, not `<=`: a milestone due today is due today, not late.
    -- Only from `scheduled`, so `paid` and `waived` are untouchable and a date the advisor
    -- has already moved forward simply does not match.
    UPDATE public.payment_milestone
       SET status     = 'overdue',
           updated_at = now()
     WHERE status = 'scheduled'
       AND due_date IS NOT NULL
       AND due_date < current_date;
    GET DIAGNOSTICS v_milestones = ROW_COUNT;

    RETURN QUERY SELECT v_milestones;
END $$;

COMMENT ON FUNCTION public.sweep_dated_promises() IS
    'Daily. Promotes payment_milestone scheduled -> overdue once due_date has passed '
    '(Data-Model §9.5). Promotes only: suppression is expressed by moving the date. The card '
    'authorization branch went with the card tables on 2026-10-16.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    -- Helpers and writes: service_role only. The writes take p_agent_id as trusted input, so
    -- a client grant would be an act-as-any-advisor primitive.
    FOREACH f IN ARRAY ARRAY[
        'public.text_has_card_digits(text)',
        'public.pay_url_host(text)',
        'public.payment_milestone_audit(uuid, uuid, text, uuid, jsonb, text, text)',
        'public.agent_set_milestone_pay_url(uuid, uuid, uuid, text, uuid, text, text)',
        'public.agent_set_milestone_paid(uuid, uuid, uuid, payment_milestone_status, bigint, text, text, date, uuid, text, text)',
        'public.seed_starter_message_templates(uuid)'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;

    -- Advisor reads, through current_agent_id(). `anon` by name: Supabase grants EXECUTE on
    -- new public functions to anon by name, so `FROM public` alone leaves it standing.
    FOREACH f IN ARRAY ARRAY[
        'public.agent_trip_payments(uuid)',
        'public.agent_trip_payment_history(uuid)',
        'public.agent_message_merge_context(uuid, uuid, uuid)',
        'public.agent_trip_overview(uuid)'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;

    -- The sweep: owner and cron only.
    EXECUTE 'REVOKE ALL ON FUNCTION public.sweep_dated_promises() FROM public, anon, authenticated';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. Assertions
-- ─────────────────────────────────────────────────────────────────────────────

-- The card is gone: tables and enums.
DO $$
DECLARE left_over text;
BEGIN
    SELECT string_agg(c.relname, ', ') INTO left_over
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('payment_card', 'card_authorization', 'authorization_request',
                         'card_use_event');
    IF left_over IS NOT NULL THEN
        RAISE EXCEPTION 'card tables still exist: %', left_over;
    END IF;

    SELECT string_agg(t.typname, ', ') INTO left_over
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
       AND t.typname IN ('card_status', 'card_auth_status', 'auth_request_status');
    IF left_over IS NOT NULL THEN
        RAISE EXCEPTION 'card enums still exist: %', left_over;
    END IF;

    -- No function anywhere in public still names one of them.
    SELECT string_agg(p.oid::regprocedure::text, ', ') INTO left_over
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosrc ~ '\m(payment_card|card_authorization|authorization_request|card_use_event)\M';
    IF left_over IS NOT NULL THEN
        RAISE EXCEPTION 'functions still read a dropped card table: %', left_over;
    END IF;

    IF pg_get_function_result('public.agent_trip_overview(uuid)'::regprocedure) ~ 'card_' THEN
        RAISE EXCEPTION 'agent_trip_overview() still returns a card column';
    END IF;
END $$;

-- The client reads pay_url and paid_reference, never paid_note, and writes nothing.
DO $$
BEGIN
    IF NOT has_column_privilege('authenticated', 'public.payment_milestone', 'pay_url', 'SELECT')
       OR NOT has_column_privilege('authenticated', 'public.payment_milestone', 'paid_reference', 'SELECT') THEN
        RAISE EXCEPTION 'the client cannot read pay_url / paid_reference';
    END IF;
    IF has_column_privilege('authenticated', 'public.payment_milestone', 'paid_note', 'SELECT') THEN
        RAISE EXCEPTION 'paid_note is in the client grant; it is Internal (Data-Model §9.5)';
    END IF;
    IF has_table_privilege('authenticated', 'public.payment_milestone', 'INSERT, UPDATE, DELETE')
       OR has_column_privilege('authenticated', 'public.payment_milestone', 'pay_url', 'UPDATE')
       OR has_table_privilege('anon', 'public.payment_milestone', 'SELECT') THEN
        RAISE EXCEPTION 'a client role can write payment_milestone, or anon can read it';
    END IF;
END $$;

-- Writes and helpers are service_role only; reads are not anon's; every one pins search_path.
DO $$
DECLARE
    writes text[] := ARRAY['agent_set_milestone_pay_url', 'agent_set_milestone_paid',
                           'payment_milestone_audit', 'text_has_card_digits', 'pay_url_host',
                           'sweep_dated_promises', 'message_template_fields',
                           'seed_starter_message_templates'];
    reads  text[] := ARRAY['agent_trip_payments', 'agent_trip_payment_history',
                           'agent_message_merge_context', 'agent_trip_overview'];
    bad    text;
BEGIN
    SELECT string_agg(p.proname, ', ') INTO bad
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (writes)
       AND (has_function_privilege('anon', p.oid, 'EXECUTE')
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'a client role can execute a §3.6 write or helper: %', bad;
    END IF;

    SELECT string_agg(p.proname, ', ') INTO bad
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (reads)
       AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'anon can execute a §3.6 read: %', bad;
    END IF;

    SELECT string_agg(p.proname, ', ') INTO bad
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (writes || reads)
       AND NOT EXISTS (
         SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS c
          WHERE c = 'search_path=public, pg_temp');
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION 'search_path not pinned to "public, pg_temp" on: %', bad;
    END IF;

    -- Exactly one agent_set_milestone_paid: the old five-argument one must not survive.
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'agent_set_milestone_paid') <> 1 THEN
        RAISE EXCEPTION 'more than one agent_set_milestone_paid signature exists';
    END IF;
END $$;

-- The cron job still points at a function that exists.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dated-promises-sweep'
                     AND command ~ 'sweep_dated_promises') THEN
        RAISE EXCEPTION 'the dated-promises sweep is no longer scheduled';
    END IF;
END $$;

-- The guard bites, on values built at run time (no card number is written in this file).
DO $$
DECLARE
    v_base   text := '411111111111111';   -- 15 digits; the check digit is computed below
    v_digits text;
    k        int;
BEGIN
    FOR k IN 0..9 LOOP
        v_digits := v_base || k::text;
        EXIT WHEN public.text_has_card_digits(v_digits);
    END LOOP;
    IF NOT public.text_has_card_digits('https://pay.example.com/x/' || v_digits) THEN
        RAISE EXCEPTION 'text_has_card_digits missed a Luhn-valid 16-digit run in a link';
    END IF;
    IF public.text_has_card_digits('SRB-220119-FINAL') OR public.text_has_card_digits(NULL) THEN
        RAISE EXCEPTION 'text_has_card_digits refused an ordinary reference';
    END IF;
    IF public.pay_url_host('https://WWW.Sandals.com/pay?x=1') <> 'sandals.com' THEN
        RAISE EXCEPTION 'pay_url_host did not lower-case and drop www.';
    END IF;
END $$;

-- Every starter still uses only known fields.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.message_template t
                WHERE cardinality(public.message_template_unknown_tokens(t.body_markdown)) > 0
                  AND 'Starter' = ANY (t.tags)) THEN
        RAISE EXCEPTION 'a starter template uses an unknown merge field';
    END IF;
END $$;

COMMIT;
