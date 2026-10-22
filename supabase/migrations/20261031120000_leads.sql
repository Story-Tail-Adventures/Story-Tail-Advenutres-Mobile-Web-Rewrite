-- §3.8 Leads, revived 2026-10-21 in a smaller shape (P2). Rulings: docs/BRD.md §6.5
-- (2026-10-21), Data-Model §11, Screen Inventory §3.8, 2.0.12, 3.11.9.
--
-- Gyasi's rule: anyone who asks for a quote is a client (a trip in `inquiry`, unchanged);
-- anyone who only messages him without an account is a LEAD. Before this, that message was an
-- email link the platform never saw.
--
-- ── WHAT THIS ADDS ─────────────────────────────────────────────────────────────────────
--
--   1. lead, lead_message, and the form's throttle (hashed addresses, a salt made fresh each
--      day). Every table is service-role only.
--   2. lead_submit(): what the anonymous `lead-message` function calls. Throttle, then: an
--      email already on a client record is saved as "Already a client" (converted at once, not
--      a new lead); an email on an open lead adds to it; anything else is a new lead. Each
--      message alerts the advisor.
--   3. lead_link_client(): open leads with a client's email become converted. Fired when a
--      client row is inserted (unless a sign-up for that address is still unconfirmed) and
--      when a sign-up's address is confirmed.
--   4. The advisor's writes (agent_lead_create, agent_lead_write) for the `agent-lead`
--      function, and the reads (agent_leads, agent_lead, agent_lead_messages,
--      agent_client_lead_origin) on current_agent_id(), like the rest of the read surface.
--   5. 3.11.9 Lead Sources (report_lead_sources, report_lead_campaigns and their wrappers).
--   6. Alerts: push_outbox and agent_alert_email learn `lead_message`, sharing the
--      `quote_requests` switch. The claim functions hand out the lead's name, never the words.
--   7. A daily sweep: closed leads 24 months after closing, and the throttle after a day.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Types and tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'converted', 'closed');
CREATE TYPE public.lead_source AS ENUM ('website', 'email', 'phone', 'referral', 'social', 'other');
CREATE TYPE public.lead_close_reason AS ENUM ('not_a_fit', 'no_reply', 'went_elsewhere', 'other');

CREATE TABLE public.lead (
    id                 uuid PRIMARY KEY DEFAULT public.uuid_v7(),
    agent_id           uuid NOT NULL REFERENCES public.agent(id),
    client_id          uuid REFERENCES public.client(id),
    email              citext NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
    first_name         text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 80),
    last_name          text CHECK (last_name IS NULL OR length(btrim(last_name)) BETWEEN 1 AND 80),
    phone              text CHECK (phone IS NULL OR length(btrim(phone)) BETWEEN 1 AND 40),
    source             public.lead_source NOT NULL,
    status             public.lead_status NOT NULL DEFAULT 'new',
    already_client     boolean NOT NULL DEFAULT false,
    utm_source         text CHECK (utm_source IS NULL OR length(utm_source) <= 100),
    utm_medium         text CHECK (utm_medium IS NULL OR length(utm_medium) <= 100),
    utm_campaign       text CHECK (utm_campaign IS NULL OR length(utm_campaign) <= 100),
    first_contacted_at timestamptz,
    converted_at       timestamptz,
    closed_at          timestamptz,
    close_reason       public.lead_close_reason,
    close_note         text CHECK (close_note IS NULL OR length(close_note) <= 500),
    -- CLAUDE.md rule 1 / Data-Model §18.1a: a card-shaped number is REFUSED in the text a
    -- stranger or the advisor types here, the guard's rule, not masked afterwards.
    CONSTRAINT lead_no_card_digits CHECK (
        NOT public.text_has_card_digits(close_note) AND NOT public.text_has_card_digits(phone)
    ),
    last_message_at    timestamptz NOT NULL DEFAULT now(),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lead_converted_shape CHECK (
        (status = 'converted') = (converted_at IS NOT NULL)
        AND (status <> 'converted' OR client_id IS NOT NULL)
    ),
    CONSTRAINT lead_closed_shape CHECK (
        (status = 'closed') = (closed_at IS NOT NULL)
        AND (status = 'closed') = (close_reason IS NOT NULL)
        AND (status = 'closed' OR close_note IS NULL)
    ),
    CONSTRAINT lead_already_client_shape CHECK (NOT already_client OR status = 'converted')
);

-- One OPEN lead per email: a second message joins it; after converted or closed, a new lead.
CREATE UNIQUE INDEX lead_one_open_per_email ON public.lead (agent_id, email)
    WHERE status IN ('new', 'contacted');
CREATE INDEX lead_agent_recent ON public.lead (agent_id, last_message_at DESC);
CREATE INDEX lead_client ON public.lead (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX lead_closed_at ON public.lead (closed_at) WHERE status = 'closed';

CREATE TABLE public.lead_message (
    id               uuid PRIMARY KEY DEFAULT public.uuid_v7(),
    lead_id          uuid NOT NULL REFERENCES public.lead(id) ON DELETE CASCADE,
    body             text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
    entered_by_agent boolean NOT NULL DEFAULT false,
    page             text CHECK (page IN ('landing', 'how-it-works', 'about', 'topic', 'results',
                                          'detail', 'join', 'app')),
    about_kind       text CHECK (about_kind IN ('trip', 'topic')),
    about_slug       text CHECK (about_slug IS NULL OR length(about_slug) <= 120),
    about_label      text CHECK (about_label IS NULL OR length(about_label) <= 120),
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lead_message_about_shape CHECK ((about_kind IS NULL) = (about_slug IS NULL)),
    CONSTRAINT lead_message_no_card_digits CHECK (NOT public.text_has_card_digits(body))
);
CREATE INDEX lead_message_lead ON public.lead_message (lead_id, created_at);

-- The form's per-address limit. Never the address: SHA-256 of it with the day's salt.
CREATE TABLE public.lead_submit_throttle (
    ip_hash    bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_submit_throttle_hash ON public.lead_submit_throttle (ip_hash, created_at);

CREATE TABLE public.lead_throttle_salt (
    day  date PRIMARY KEY,
    salt bytea NOT NULL
);

ALTER TABLE public.lead ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_submit_throttle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_throttle_salt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead, public.lead_message, public.lead_submit_throttle,
              public.lead_throttle_salt FROM public, anon, authenticated;
GRANT ALL ON public.lead, public.lead_message, public.lead_submit_throttle,
             public.lead_throttle_salt TO service_role;

COMMENT ON TABLE public.lead IS
    'Data-Model §11.1: somebody without an account who messaged the advisor, or whom he added '
    'by hand (BRD §6.5, 2026-10-21). Service role only; the advisor reads through agent_lead*.';
COMMENT ON TABLE public.lead_message IS
    'Data-Model §11.2: what a lead wrote (or the advisor noted on Add lead), with the page and '
    'the trip or topic they were viewing. Service role only.';
COMMENT ON TABLE public.lead_submit_throttle IS
    'Data-Model §11.3: one row per accepted or refused form send, keyed by a salted hash of the '
    'network address. Emptied after a day by lead_retention_sweep().';
COMMENT ON TABLE public.lead_throttle_salt IS
    'Data-Model §11.3: the day''s random salt for lead_submit_throttle. Deleted after a day, so '
    'old hashes cannot be matched to anything.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The public form
-- ─────────────────────────────────────────────────────────────────────────────

-- The one active advisor, or NULL. The same rule handle_new_user() uses for a sign-up with no
-- agent in its metadata: several active advisors is P3's routing problem, not a guess here.
CREATE OR REPLACE FUNCTION public.lead_active_agent()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE WHEN count(*) = 1 THEN min(a.id::text)::uuid END
      FROM public.agent a
     WHERE a.status = 'active';
$$;

-- True when this address may send now (and records the try); false past five in an hour.
-- A missing address shares one bucket rather than skipping the limit.
CREATE OR REPLACE FUNCTION public.lead_throttle_check(p_ip text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_day  date := (now() AT TIME ZONE 'UTC')::date;
    v_salt bytea;
    v_hash bytea;
BEGIN
    INSERT INTO public.lead_throttle_salt (day, salt)
    VALUES (v_day, extensions.gen_random_bytes(32))
    ON CONFLICT (day) DO NOTHING;
    SELECT s.salt INTO v_salt FROM public.lead_throttle_salt s WHERE s.day = v_day;

    v_hash := extensions.digest(convert_to(coalesce(nullif(btrim(p_ip), ''), 'unknown'), 'UTF8') || v_salt,
                                'sha256');

    IF (SELECT count(*) FROM public.lead_submit_throttle t
         WHERE t.ip_hash = v_hash AND t.created_at > now() - interval '1 hour') >= 5 THEN
        RETURN false;
    END IF;

    INSERT INTO public.lead_submit_throttle (ip_hash) VALUES (v_hash);
    RETURN true;
END;
$$;

-- The advisor's alert for one lead message: the push (switch on, a device to tell, held
-- through rest hours) and the alert email (switch on). The `quote_requests` switch, renamed
-- "New inquiries and messages" (Screen Inventory 3.12.3, 2026-10-21). Never the words.
CREATE OR REPLACE FUNCTION public.alert_lead_message(p_lead_id uuid)
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
    SELECT l.agent_id INTO v_agent
      FROM public.lead l JOIN public.agent a ON a.id = l.agent_id
     WHERE l.id = p_lead_id AND a.status <> 'archived';
    IF v_agent IS NULL THEN
        RETURN 'none';
    END IF;

    IF public.agent_alert_on(v_agent, 'quote_requests', 'email') THEN
        INSERT INTO public.agent_alert_email (agent_id, kind, lead_id)
        VALUES (v_agent, 'lead_message', p_lead_id);
        v_out := v_out || 'email ';
    END IF;

    IF public.agent_alert_on(v_agent, 'quote_requests', 'push')
       AND EXISTS (SELECT 1 FROM public.push_device d
                     JOIN public.platform_user pu ON pu.id = d.platform_user_id
                    WHERE pu.agent_id = v_agent AND pu.role = 'agent') THEN
        SELECT r.due_at, r.reason INTO v_due, v_reason FROM public.agent_rest_until(v_agent, now()) r;
        INSERT INTO public.push_outbox (agent_id, kind, lead_id, message_count, due_at, held, hold_reason)
        VALUES (v_agent, 'lead_message', p_lead_id, 1, v_due, v_due > now(),
                CASE WHEN v_due > now() THEN v_reason END);
        v_out := v_out || 'push';
    END IF;
    RETURN coalesce(nullif(btrim(v_out), ''), 'none');
END;
$$;

-- What `lead-message` calls (service role), after its own checks (hidden field, too fast,
-- shape). Outcomes:
--   throttled       five sends from this address in the last hour; nothing written
--   no_advisor      no single active advisor to own it; nothing written
--   already_client  the email is on a client record: saved, linked, converted at once
--   added           joined this email's open lead
--   created         a new lead
-- The visitor sees the same thank-you for the last three, so the form never says whether an
-- address belongs to a client.
CREATE OR REPLACE FUNCTION public.lead_submit(
    p_ip           text,
    p_first_name   text,
    p_last_name    text,
    p_email        text,
    p_phone        text,
    p_body         text,
    p_page         text,
    p_about_kind   text,
    p_about_slug   text,
    p_about_label  text,
    p_utm_source   text,
    p_utm_medium   text,
    p_utm_campaign text
)
RETURNS TABLE (outcome text, lead_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_agent   uuid;
    v_client  uuid;
    v_lead    uuid;
    v_outcome text;
BEGIN
    IF NOT public.lead_throttle_check(p_ip) THEN
        RETURN QUERY SELECT 'throttled'::text, NULL::uuid;
        RETURN;
    END IF;

    v_agent := public.lead_active_agent();
    IF v_agent IS NULL THEN
        RETURN QUERY SELECT 'no_advisor'::text, NULL::uuid;
        RETURN;
    END IF;

    SELECT c.id INTO v_client
      FROM public.client c
     WHERE c.agent_id = v_agent AND c.email = p_email::citext
       AND c.status = 'active' AND c.archived_at IS NULL
     ORDER BY c.created_at
     LIMIT 1;

    IF v_client IS NOT NULL THEN
        INSERT INTO public.lead (agent_id, client_id, email, first_name, last_name, phone, source,
                                 status, already_client, converted_at,
                                 utm_source, utm_medium, utm_campaign)
        VALUES (v_agent, v_client, p_email, btrim(p_first_name), nullif(btrim(p_last_name), ''),
                nullif(btrim(p_phone), ''), 'website', 'converted', true, now(),
                p_utm_source, p_utm_medium, p_utm_campaign)
        RETURNING id INTO v_lead;
        v_outcome := 'already_client';
    ELSE
        SELECT l.id INTO v_lead
          FROM public.lead l
         WHERE l.agent_id = v_agent AND l.email = p_email::citext
           AND l.status IN ('new', 'contacted')
         FOR UPDATE;

        IF v_lead IS NOT NULL THEN
            v_outcome := 'added';
        ELSE
            BEGIN
                INSERT INTO public.lead (agent_id, email, first_name, last_name, phone, source,
                                         utm_source, utm_medium, utm_campaign)
                VALUES (v_agent, p_email, btrim(p_first_name), nullif(btrim(p_last_name), ''),
                        nullif(btrim(p_phone), ''), 'website',
                        p_utm_source, p_utm_medium, p_utm_campaign)
                RETURNING id INTO v_lead;
                v_outcome := 'created';
            EXCEPTION WHEN unique_violation THEN
                -- The same email's other send won the race: join it.
                SELECT l.id INTO v_lead
                  FROM public.lead l
                 WHERE l.agent_id = v_agent AND l.email = p_email::citext
                   AND l.status IN ('new', 'contacted')
                 FOR UPDATE;
                v_outcome := 'added';
            END;
        END IF;

        IF v_outcome = 'added' THEN
            -- Fill what the lead did not give before; never overwrite what they did.
            UPDATE public.lead l
               SET last_name = coalesce(l.last_name, nullif(btrim(p_last_name), '')),
                   phone = coalesce(l.phone, nullif(btrim(p_phone), '')),
                   last_message_at = now(),
                   updated_at = now()
             WHERE l.id = v_lead;
        END IF;
    END IF;

    INSERT INTO public.lead_message (lead_id, body, page, about_kind, about_slug, about_label)
    VALUES (v_lead, btrim(p_body), p_page, p_about_kind, p_about_slug, p_about_label);

    PERFORM public.alert_lead_message(v_lead);

    RETURN QUERY SELECT v_outcome, v_lead;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Linking a lead to the client they became
-- ─────────────────────────────────────────────────────────────────────────────

-- Open leads with this client's email, for this client's advisor, become converted. Returns
-- how many. A merged-away or archived client links nothing.
CREATE OR REPLACE FUNCTION public.lead_link_client(p_client_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE public.lead l
       SET status = 'converted', client_id = c.id, converted_at = now(), updated_at = now()
      FROM public.client c
     WHERE c.id = p_client_id
       AND c.email IS NOT NULL
       AND c.status = 'active' AND c.archived_at IS NULL
       AND l.agent_id = c.agent_id
       AND l.email = c.email
       AND l.status IN ('new', 'contacted');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- A new client row: the advisor's "Create client" or §3.8.3 invite (no sign-in yet), or a
-- sign-up whose address is already confirmed (Google). NOT a sign-up still waiting on its
-- confirmation email: anybody can type somebody else's address into a sign-up form, and that
-- one links when the address is proved (the next trigger).
CREATE OR REPLACE FUNCTION public.lead_link_on_client_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.email IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM auth.users u
         WHERE u.email::citext = NEW.email AND u.email_confirmed_at IS NULL
    ) THEN
        PERFORM public.lead_link_client(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER lead_link_on_client_insert
    AFTER INSERT ON public.client
    FOR EACH ROW EXECUTE FUNCTION public.lead_link_on_client_insert();

-- A sign-up's address is confirmed. Named to sort AFTER on_auth_user_email_confirmed (same
-- event, alphabetical order), so handle_user_email_confirmed() has already decided which
-- client record this account keeps.
CREATE OR REPLACE FUNCTION public.lead_link_on_email_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client uuid;
BEGIN
    SELECT pu.client_id INTO v_client
      FROM public.platform_user pu
     WHERE pu.account_id = NEW.id AND pu.role = 'client' AND pu.client_id IS NOT NULL;
    IF v_client IS NOT NULL THEN
        PERFORM public.lead_link_client(v_client);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_email_confirmed_lead
    AFTER UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW
    WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
    EXECUTE FUNCTION public.lead_link_on_email_confirmed();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The advisor's writes (the `agent-lead` function; it writes the audit rows)
-- ─────────────────────────────────────────────────────────────────────────────

-- 3.8.5 Add lead. Outcomes: created / added (joined this email's open lead) / client_exists
-- (nothing written; the screen offers "Open client"). No alert: the advisor is the one adding.
CREATE OR REPLACE FUNCTION public.agent_lead_create(
    p_agent_id   uuid,
    p_first_name text,
    p_last_name  text,
    p_email      text,
    p_phone      text,
    p_source     public.lead_source,
    p_body       text
)
RETURNS TABLE (outcome text, lead_id uuid, client_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client uuid;
    v_lead   uuid;
    v_out    text;
BEGIN
    IF p_source = 'website' THEN
        RAISE EXCEPTION 'website leads come from the form' USING ERRCODE = '22023';
    END IF;

    SELECT c.id INTO v_client
      FROM public.client c
     WHERE c.agent_id = p_agent_id AND c.email = p_email::citext
       AND c.status = 'active' AND c.archived_at IS NULL
     ORDER BY c.created_at
     LIMIT 1;
    IF v_client IS NOT NULL THEN
        RETURN QUERY SELECT 'client_exists'::text, NULL::uuid, v_client;
        RETURN;
    END IF;

    SELECT l.id INTO v_lead
      FROM public.lead l
     WHERE l.agent_id = p_agent_id AND l.email = p_email::citext
       AND l.status IN ('new', 'contacted')
     FOR UPDATE;

    IF v_lead IS NULL THEN
        INSERT INTO public.lead (agent_id, email, first_name, last_name, phone, source)
        VALUES (p_agent_id, p_email, btrim(p_first_name), nullif(btrim(p_last_name), ''),
                nullif(btrim(p_phone), ''), p_source)
        RETURNING id INTO v_lead;
        v_out := 'created';
    ELSE
        UPDATE public.lead l
           SET last_name = coalesce(l.last_name, nullif(btrim(p_last_name), '')),
               phone = coalesce(l.phone, nullif(btrim(p_phone), '')),
               last_message_at = now(), updated_at = now()
         WHERE l.id = v_lead;
        v_out := 'added';
    END IF;

    INSERT INTO public.lead_message (lead_id, body, entered_by_agent)
    VALUES (v_lead, btrim(p_body), true);

    RETURN QUERY SELECT v_out, v_lead, NULL::uuid;
END;
$$;

-- One action on one lead. Zero rows = no such lead, or not this advisor's (one answer, so ids
-- cannot be probed). Outcomes: changed / noop / refused (not allowed from this state) /
-- conflict (reopening would make a second open lead for the email) / deleted.
--   mark_contacted  new -> contacted; sets first_contacted_at once
--   close           new or contacted -> closed with a reason; on a closed lead, a new reason or
--                   note is a correction
--   reopen          closed -> contacted if it ever was, else new
--   convert         any lead not converted -> converted, linked to p_client_id (this advisor's
--                   active client); the same client again is a noop
--   delete_spam     deletes a lead that is not converted (a converted lead is client history)
CREATE OR REPLACE FUNCTION public.agent_lead_write(
    p_agent_id     uuid,
    p_lead_id      uuid,
    p_op           text,
    p_close_reason public.lead_close_reason,
    p_close_note   text,
    p_client_id    uuid
)
RETURNS TABLE (outcome text, status public.lead_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lead public.lead;
    v_note text := nullif(btrim(p_close_note), '');
BEGIN
    SELECT * INTO v_lead FROM public.lead l
     WHERE l.id = p_lead_id AND l.agent_id = p_agent_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF p_op = 'mark_contacted' THEN
        IF v_lead.status = 'contacted' THEN
            RETURN QUERY SELECT 'noop'::text, v_lead.status;
        ELSIF v_lead.status = 'new' THEN
            UPDATE public.lead l
               SET status = 'contacted', first_contacted_at = coalesce(l.first_contacted_at, now()),
                   updated_at = now()
             WHERE l.id = v_lead.id;
            RETURN QUERY SELECT 'changed'::text, 'contacted'::public.lead_status;
        ELSE
            RETURN QUERY SELECT 'refused'::text, v_lead.status;
        END IF;

    ELSIF p_op = 'close' THEN
        IF p_close_reason IS NULL THEN
            RAISE EXCEPTION 'a close needs a reason' USING ERRCODE = '22023';
        END IF;
        IF v_lead.status IN ('new', 'contacted') THEN
            UPDATE public.lead l
               SET status = 'closed', closed_at = now(), close_reason = p_close_reason,
                   close_note = v_note, updated_at = now()
             WHERE l.id = v_lead.id;
            RETURN QUERY SELECT 'changed'::text, 'closed'::public.lead_status;
        ELSIF v_lead.status = 'closed' THEN
            IF v_lead.close_reason = p_close_reason AND v_lead.close_note IS NOT DISTINCT FROM v_note THEN
                RETURN QUERY SELECT 'noop'::text, v_lead.status;
            ELSE
                UPDATE public.lead l
                   SET close_reason = p_close_reason, close_note = v_note, updated_at = now()
                 WHERE l.id = v_lead.id;
                RETURN QUERY SELECT 'changed'::text, v_lead.status;
            END IF;
        ELSE
            RETURN QUERY SELECT 'refused'::text, v_lead.status;
        END IF;

    ELSIF p_op = 'reopen' THEN
        IF v_lead.status <> 'closed' THEN
            RETURN QUERY SELECT 'refused'::text, v_lead.status;
            RETURN;
        END IF;
        BEGIN
            UPDATE public.lead l
               SET status = CASE WHEN l.first_contacted_at IS NULL THEN 'new'::public.lead_status
                                 ELSE 'contacted'::public.lead_status END,
                   closed_at = NULL, close_reason = NULL, close_note = NULL, updated_at = now()
             WHERE l.id = v_lead.id;
        EXCEPTION WHEN unique_violation THEN
            RETURN QUERY SELECT 'conflict'::text, v_lead.status;
            RETURN;
        END;
        RETURN QUERY SELECT 'changed'::text, l.status FROM public.lead l WHERE l.id = v_lead.id;

    ELSIF p_op = 'convert' THEN
        IF p_client_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.client c
             WHERE c.id = p_client_id AND c.agent_id = p_agent_id
               AND c.status = 'active' AND c.archived_at IS NULL
        ) THEN
            RETURN;
        END IF;
        IF v_lead.status = 'converted' THEN
            RETURN QUERY SELECT CASE WHEN v_lead.client_id = p_client_id THEN 'noop' ELSE 'refused' END,
                                v_lead.status;
            RETURN;
        END IF;
        UPDATE public.lead l
           SET status = 'converted', client_id = p_client_id, converted_at = now(),
               closed_at = NULL, close_reason = NULL, close_note = NULL, updated_at = now()
         WHERE l.id = v_lead.id;
        RETURN QUERY SELECT 'changed'::text, 'converted'::public.lead_status;

    ELSIF p_op = 'delete_spam' THEN
        IF v_lead.status = 'converted' THEN
            RETURN QUERY SELECT 'refused'::text, v_lead.status;
            RETURN;
        END IF;
        DELETE FROM public.lead l WHERE l.id = v_lead.id;
        RETURN QUERY SELECT 'deleted'::text, v_lead.status;

    ELSE
        RAISE EXCEPTION 'unknown lead op %', p_op USING ERRCODE = '22023';
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The advisor's reads (current_agent_id(): an aal2 advisor who is not archived)
-- ─────────────────────────────────────────────────────────────────────────────

-- 3.8.1 and the worklist's "New leads": every lead, newest message first. A solo advisor's
-- list; the page filters by status.
CREATE OR REPLACE FUNCTION public.agent_leads()
RETURNS TABLE (
    id                 uuid,
    first_name         text,
    last_name          text,
    email              text,
    source             public.lead_source,
    status             public.lead_status,
    already_client     boolean,
    client_id          uuid,
    message_count      integer,
    latest_preview     text,
    first_message_at   timestamptz,
    last_message_at    timestamptz,
    first_contacted_at timestamptz,
    converted_at       timestamptz,
    closed_at          timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT l.id, l.first_name, l.last_name, l.email::text, l.source, l.status, l.already_client,
           l.client_id,
           (SELECT count(*)::integer FROM public.lead_message m WHERE m.lead_id = l.id),
           (SELECT left(regexp_replace(m.body, '\s+', ' ', 'g'), 140)
              FROM public.lead_message m WHERE m.lead_id = l.id
             ORDER BY m.created_at DESC LIMIT 1),
           l.created_at, l.last_message_at, l.first_contacted_at, l.converted_at, l.closed_at
      FROM public.lead l
     WHERE l.agent_id = public.current_agent_id()
     ORDER BY l.last_message_at DESC, l.id;
$$;

-- 3.8.2's header. Zero rows for somebody else's lead or no lead.
CREATE OR REPLACE FUNCTION public.agent_lead(p_lead_id uuid)
RETURNS TABLE (
    id                 uuid,
    first_name         text,
    last_name          text,
    email              text,
    phone              text,
    source             public.lead_source,
    status             public.lead_status,
    already_client     boolean,
    client_id          uuid,
    utm_source         text,
    utm_medium         text,
    utm_campaign       text,
    first_contacted_at timestamptz,
    converted_at       timestamptz,
    closed_at          timestamptz,
    close_reason       public.lead_close_reason,
    close_note         text,
    created_at         timestamptz,
    last_message_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT l.id, l.first_name, l.last_name, l.email::text, l.phone, l.source, l.status,
           l.already_client, l.client_id, l.utm_source, l.utm_medium, l.utm_campaign,
           l.first_contacted_at, l.converted_at, l.closed_at, l.close_reason, l.close_note,
           l.created_at, l.last_message_at
      FROM public.lead l
     WHERE l.id = p_lead_id AND l.agent_id = public.current_agent_id();
$$;

-- 3.8.2's messages, oldest first.
CREATE OR REPLACE FUNCTION public.agent_lead_messages(p_lead_id uuid)
RETURNS TABLE (
    id               uuid,
    body             text,
    entered_by_agent boolean,
    page             text,
    about_kind       text,
    about_slug       text,
    about_label      text,
    created_at       timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT m.id, m.body, m.entered_by_agent, m.page, m.about_kind, m.about_slug, m.about_label,
           m.created_at
      FROM public.lead_message m
      JOIN public.lead l ON l.id = m.lead_id
     WHERE m.lead_id = p_lead_id AND l.agent_id = public.current_agent_id()
     ORDER BY m.created_at, m.id;
$$;

-- 3.3.2's "First reached out as a lead on [date]": the earliest lead linked to this client, or
-- to a client record merged into it. An "Already a client" message is not how they first
-- reached out, so it does not count.
CREATE OR REPLACE FUNCTION public.agent_client_lead_origin(p_client_id uuid)
RETURNS TABLE (lead_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT l.id, l.created_at
      FROM public.lead l
      JOIN public.client c ON c.id = l.client_id
     WHERE l.agent_id = public.current_agent_id()
       AND NOT l.already_client
       AND (c.id = p_client_id OR c.merged_into_client_id = p_client_id)
     ORDER BY l.created_at, l.id
     LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 3.11.9 Lead Sources
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Leads CREATED in the period (in the advisor's time zone), by source: how many, how many
-- became clients, how many are still open, how many were closed. "Already a client" messages
-- were never leads and are left out. Every source appears, zero or not, in the enum's order.

CREATE OR REPLACE FUNCTION public.report_lead_sources(p_agent_id uuid, p_period text)
RETURNS TABLE (
    source          public.lead_source,
    lead_count      integer,
    converted_count integer,
    open_count      integer,
    closed_count    integer
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT r.agent_id, r.time_zone, b.*
          FROM public.report_agent_today(p_agent_id) r,
               public.report_period_bounds(p_period, r.today) b
    ),
    cohort AS (
        SELECT l.source, l.status
          FROM me
          JOIN public.lead l ON l.agent_id = me.agent_id AND NOT l.already_client
         WHERE (l.created_at AT TIME ZONE me.time_zone)::date BETWEEN me.from_date AND me.to_date
    )
    SELECT s.source,
           (count(c.source))::integer,
           (count(c.source) FILTER (WHERE c.status = 'converted'))::integer,
           (count(c.source) FILTER (WHERE c.status IN ('new', 'contacted')))::integer,
           (count(c.source) FILTER (WHERE c.status = 'closed'))::integer
      FROM unnest(enum_range(NULL::public.lead_source)) AS s(source)
      LEFT JOIN cohort c ON c.source = s.source
     WHERE EXISTS (SELECT 1 FROM me)
     GROUP BY s.source
     ORDER BY s.source;
$$;

-- The same cohort's website leads by campaign tag (utm_source), largest first. No tag, no row.
CREATE OR REPLACE FUNCTION public.report_lead_campaigns(p_agent_id uuid, p_period text)
RETURNS TABLE (
    utm_source      text,
    lead_count      integer,
    converted_count integer
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    WITH me AS (
        SELECT r.agent_id, r.time_zone, b.*
          FROM public.report_agent_today(p_agent_id) r,
               public.report_period_bounds(p_period, r.today) b
    )
    SELECT l.utm_source,
           count(*)::integer,
           (count(*) FILTER (WHERE l.status = 'converted'))::integer
      FROM me
      JOIN public.lead l ON l.agent_id = me.agent_id AND NOT l.already_client
     WHERE (l.created_at AT TIME ZONE me.time_zone)::date BETWEEN me.from_date AND me.to_date
       AND l.utm_source IS NOT NULL
     GROUP BY l.utm_source
     ORDER BY count(*) DESC, l.utm_source;
$$;

CREATE OR REPLACE FUNCTION public.agent_report_lead_sources(p_period text)
RETURNS TABLE (
    source          public.lead_source,
    lead_count      integer,
    converted_count integer,
    open_count      integer,
    closed_count    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT * FROM public.report_lead_sources(public.current_agent_id(), p_period);
$$;

CREATE OR REPLACE FUNCTION public.agent_report_lead_campaigns(p_period text)
RETURNS TABLE (
    utm_source      text,
    lead_count      integer,
    converted_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT * FROM public.report_lead_campaigns(public.current_agent_id(), p_period);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Alerts learn a third kind
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.push_outbox DROP CONSTRAINT push_outbox_kind_check;
ALTER TABLE public.push_outbox DROP CONSTRAINT push_outbox_kind_target;
ALTER TABLE public.push_outbox
    ADD COLUMN lead_id uuid REFERENCES public.lead(id) ON DELETE CASCADE,
    ADD CONSTRAINT push_outbox_kind_check CHECK (kind IN ('message', 'quote_request', 'lead_message')),
    ADD CONSTRAINT push_outbox_kind_target CHECK (
        (kind = 'message' AND conversation_id IS NOT NULL AND latest_message_id IS NOT NULL
             AND trip_id IS NULL AND lead_id IS NULL)
        OR (kind = 'quote_request' AND trip_id IS NOT NULL AND conversation_id IS NULL
             AND latest_message_id IS NULL AND lead_id IS NULL)
        OR (kind = 'lead_message' AND lead_id IS NOT NULL AND conversation_id IS NULL
             AND latest_message_id IS NULL AND trip_id IS NULL)
    );

ALTER TABLE public.agent_alert_email DROP CONSTRAINT agent_alert_email_kind_check;
ALTER TABLE public.agent_alert_email DROP CONSTRAINT agent_alert_email_target;
ALTER TABLE public.agent_alert_email
    ADD COLUMN lead_id uuid REFERENCES public.lead(id) ON DELETE CASCADE,
    ADD CONSTRAINT agent_alert_email_kind_check
        CHECK (kind IN ('client_message', 'quote_request', 'lead_message')),
    ADD CONSTRAINT agent_alert_email_target CHECK (
        (kind = 'client_message' AND conversation_id IS NOT NULL AND trip_id IS NULL AND lead_id IS NULL)
        OR (kind = 'quote_request' AND trip_id IS NOT NULL AND conversation_id IS NULL AND lead_id IS NULL)
        OR (kind = 'lead_message' AND lead_id IS NOT NULL AND conversation_id IS NULL AND trip_id IS NULL)
    );

-- push_claim_due hands out the lead too. Its result changes, so it is dropped and made again.
-- Everything else is the §3.12 body unchanged; a lead's "client_name" is the lead's name.
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
    end_date          date,
    lead_id           uuid
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
           CASE WHEN c.kind = 'lead_message'
                THEN btrim(ld.first_name || ' ' || coalesce(ld.last_name, ''))
                ELSE coalesce(cl.preferred_name, cl.first_name) || ' ' || cl.last_name END,
           t.title,
           CASE WHEN c.kind = 'message' THEN public.message_preview(m.body) END,
           coalesce(m.created_at, c.created_at),
           CASE WHEN c.kind = 'quote_request' THEN nullif(array_to_string(t.destinations, ', '), '') END,
           CASE WHEN c.kind = 'quote_request' THEN t.start_date END,
           CASE WHEN c.kind = 'quote_request' THEN t.end_date END,
           c.lead_id
      FROM claimed c
      LEFT JOIN public.conversation cv ON cv.id = c.conversation_id
      LEFT JOIN public.trip t ON t.id = coalesce(c.trip_id, cv.trip_id)
      LEFT JOIN public.client cl ON cl.id = coalesce(cv.client_id, t.client_id)
      LEFT JOIN public.message m ON m.id = c.latest_message_id
      LEFT JOIN public.lead ld ON ld.id = c.lead_id;
END;
$$;

DROP FUNCTION public.agent_alert_email_claim(integer);

CREATE FUNCTION public.agent_alert_email_claim(p_limit integer DEFAULT 25)
RETURNS TABLE (
    alert_id         uuid,
    kind             text,
    recipient        text,
    agent_first_name text,
    client_name      text,
    trip_title       text,
    conversation_id  uuid,
    trip_id          uuid,
    lead_id          uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
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
           CASE WHEN c.kind = 'lead_message'
                THEN btrim(ld.first_name || ' ' || coalesce(ld.last_name, ''))
                ELSE coalesce(cl.preferred_name, cl.first_name) || ' ' || cl.last_name END,
           t.title,
           c.conversation_id,
           c.trip_id,
           c.lead_id
      FROM claimed c
      JOIN public.agent ag ON ag.id = c.agent_id
      LEFT JOIN public.conversation cv ON cv.id = c.conversation_id
      LEFT JOIN public.trip t ON t.id = coalesce(c.trip_id, cv.trip_id)
      LEFT JOIN public.client cl ON cl.id = coalesce(cv.client_id, t.client_id)
      LEFT JOIN public.lead ld ON ld.id = c.lead_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. The daily sweep
-- ─────────────────────────────────────────────────────────────────────────────

-- Closed leads 24 months after closing (their messages, and any alert rows, go with them by
-- cascade); the throttle and its salts after a day. Returns how many leads went.
CREATE OR REPLACE FUNCTION public.lead_retention_sweep()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count integer;
BEGIN
    DELETE FROM public.lead l
     WHERE l.status = 'closed' AND l.closed_at < now() - interval '24 months';
    GET DIAGNOSTICS v_count = ROW_COUNT;

    DELETE FROM public.lead_submit_throttle t WHERE t.created_at < now() - interval '1 day';
    DELETE FROM public.lead_throttle_salt s WHERE s.day < (now() AT TIME ZONE 'UTC')::date - 1;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.lead_retention_sweep() IS
    'Daily. Data-Model §11: deletes closed leads 24 months after closed_at (BRD §6.5, '
    '2026-10-21), and the form''s throttle rows and salts after a day.';

DO $$
BEGIN
    PERFORM cron.unschedule('lead-retention-sweep')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lead-retention-sweep');

    PERFORM cron.schedule('lead-retention-sweep', '25 6 * * *', 'SELECT public.lead_retention_sweep();');
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Grants
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
    -- The service role's: the public form, the advisor's writes (through `agent-lead`, which
    -- checks the advisor first), the alerts, the sweep, the report bodies, and the trigger
    -- functions and helpers (the service role writes rows that fire them).
    FOREACH f IN ARRAY ARRAY[
        'public.lead_active_agent()',
        'public.lead_throttle_check(text)',
        'public.alert_lead_message(uuid)',
        'public.lead_submit(text, text, text, text, text, text, text, text, text, text, text, text, text)',
        'public.lead_link_client(uuid)',
        'public.lead_link_on_client_insert()',
        'public.lead_link_on_email_confirmed()',
        'public.agent_lead_create(uuid, text, text, text, text, public.lead_source, text)',
        'public.agent_lead_write(uuid, uuid, text, public.lead_close_reason, text, uuid)',
        'public.report_lead_sources(uuid, text)',
        'public.report_lead_campaigns(uuid, text)',
        'public.push_claim_due(integer)',
        'public.agent_alert_email_claim(integer)',
        'public.lead_retention_sweep()'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END LOOP;

    -- The advisor's reads, on current_agent_id().
    FOREACH f IN ARRAY ARRAY[
        'public.agent_leads()',
        'public.agent_lead(uuid)',
        'public.agent_lead_messages(uuid)',
        'public.agent_client_lead_origin(uuid)',
        'public.agent_report_lead_sources(text)',
        'public.agent_report_lead_campaigns(text)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END LOOP;
END $$;

COMMIT;
