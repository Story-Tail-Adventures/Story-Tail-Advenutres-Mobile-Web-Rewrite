-- Story-Tail Adventures — schema for Screen Inventory §2.1 onboarding
--
-- Source of truth: docs/Data-Model.md §5.1.1, §5.2, §6.1, §6.4, §6.7, §19.1.
-- Those sections were updated first; this migration follows them.
--
-- Four things the onboarding wizard (Screens 2.1.9–2.1.14) cannot be built without:
--
--   1. client.emergency_contact          — 2.1.10 asks for it; nowhere to put it
--   2. platform_user.onboarding_completed_at — how a first sign-in routes to 2.1.9
--   3. travel_document.document_id nullable  — 2.1.10 takes passport details, no scan
--   4. client_invite                     — 2.1.13's code path
--
-- Plus the fix that makes 2.1.13's *other* path work at all: handle_new_user() currently
-- always inserts a fresh client row, so a traveler Gyasi pre-created gets a duplicate on
-- sign-up and never sees the trips already planned for them.
--
-- Read access only. Every write to these tables goes through an Edge Function running as
-- the service role, because three of them cannot be written correctly from a client:
-- `client` is a sensitive table under CLAUDE.md rule 3 and needs an audit_event;
-- travel_document and companion carry column-encrypted passport numbers whose DEK is
-- backend-only (Data-Model §18.2); and platform_user carries `role`, which a self-service
-- UPDATE policy would let a client rewrite to 'agent'.

BEGIN;

-- ============================================================
-- 1. New columns
-- ============================================================

ALTER TABLE public.platform_user
    ADD COLUMN onboarding_completed_at timestamptz;

COMMENT ON COLUMN public.platform_user.onboarding_completed_at IS
    'Null until the client finishes or skips through the 2.1.9-2.1.14 wizard. Set even '
    'when every optional step was skipped — "wizard done" is not "profile complete", and '
    'conflating them traps people in the wizard. Data-Model §5.2.';

ALTER TABLE public.client
    ADD COLUMN emergency_contact jsonb;

COMMENT ON COLUMN public.client.emergency_contact IS
    '{name, phone, relationship}. Captured at Screen 2.1.10, edited at 2.5.2, surfaced on '
    'the itinerary and at 2.7.3 Emergency Contacts. Data-Model §6.1.';

-- Screen 2.1.10 collects a passport number, expiry and issuing country with no file
-- upload — the scan arrives later from the mobile camera flow. The structured metadata is
-- what drives expiration reminders, so it has to stand on its own.
ALTER TABLE public.travel_document
    ALTER COLUMN document_id DROP NOT NULL;

COMMENT ON COLUMN public.travel_document.document_id IS
    'FK to the file blob. Null means "we have the details, not the scan" — the 2.1.10 '
    'onboarding case. Data-Model §6.4.';

-- ============================================================
-- 2. ClientInvite (Data-Model §6.7)
-- ============================================================
--
-- Only the hash is stored, for the reason a password is not stored in plaintext: a leaked
-- client_invite table would otherwise be a working key to a named traveler's itinerary,
-- passport details and payment authorizations. The code is short enough to read over the
-- phone (STA-7HX2J9), which makes it low-entropy — so redemption must be rate limited and
-- audited, in the Edge Function.

CREATE TABLE public.client_invite (
    id                  uuid PRIMARY KEY,
    client_id           uuid NOT NULL REFERENCES public.client (id),
    code_hash           text NOT NULL,
    issued_by_user_id   uuid NOT NULL REFERENCES public.platform_user (id),
    expires_at          timestamptz NOT NULL,
    accepted_at         timestamptz,
    accepted_account_id uuid REFERENCES public.account (id),
    revoked_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),

    -- An accepted invite must record who accepted it, and vice versa. Without this the
    -- "single-use" property is unverifiable after the fact.
    CONSTRAINT client_invite_accepted_together CHECK (
        (accepted_at IS NULL) = (accepted_account_id IS NULL)
    ),

    -- Redeemed and cancelled are contradictory states. The redemption path will not create
    -- one, but "the code path won't do that" is a weaker guarantee than the database
    -- refusing to store it — and this row decides who can see whose trips.
    CONSTRAINT client_invite_not_both CHECK (
        accepted_at IS NULL OR revoked_at IS NULL
    )
);

COMMENT ON TABLE public.client_invite IS
    'Single-use code binding a pre-created client record to whichever account redeems it. '
    'Backs Screen 2.1.13. Distinct from agent_invitation (P3), which provisions an '
    'advisor — this provisions nothing. Data-Model §6.7.';

CREATE UNIQUE INDEX client_invite_code ON public.client_invite (code_hash);
CREATE INDEX client_invite_client ON public.client_invite (client_id);

-- At most one live invite per client at a time. Reissuing means revoking the old one,
-- which is what makes "single-use" enforceable rather than aspirational.
CREATE UNIQUE INDEX client_invite_one_live
    ON public.client_invite (client_id)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX client_invite_expiry
    ON public.client_invite (expires_at)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.client_invite ENABLE ROW LEVEL SECURITY;
-- Deliberately no policy. Redemption runs as the service role inside an Edge Function
-- because it rewrites platform_user.client_id — it changes what an account can see.

-- Normalisation and hashing live here, in one IMMUTABLE function, rather than being
-- reimplemented in Deno. Two implementations of "what counts as the same code" is exactly
-- the kind of drift that turns into "the code from my email doesn't work" — the traveler
-- reads STA-7HX2J9 off a phone call and types "sta 7hx2j9", and both must hash alike.
CREATE OR REPLACE FUNCTION public.client_invite_code_hash(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, extensions
AS $$
    SELECT encode(
        extensions.digest(
            upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')),
            'sha256'
        ),
        'hex'
    );
$$;

COMMENT ON FUNCTION public.client_invite_code_hash(text) IS
    'Canonical hash for a 2.1.13 invite code: strip everything but letters and digits, '
    'uppercase, sha256, hex. The only place this transformation is defined.';

-- A hash function is not a secret, but nothing on the client surface has a use for it,
-- and leaving it callable by `authenticated` would invite someone to build redemption on
-- the client where the rate limiting and the audit_event are not.
REVOKE EXECUTE ON FUNCTION public.client_invite_code_hash(text) FROM public;
GRANT EXECUTE ON FUNCTION public.client_invite_code_hash(text) TO service_role;

-- ============================================================
-- 3. A CONFIRMED sign-up claims an existing Client
-- ============================================================
--
-- The agent routinely creates a Client and starts planning against it before the traveler
-- has an account (Data-Model §6.1). The previous version of this function always INSERTed,
-- so those travelers signed up into an empty second record and Screen 2.1.13's promise —
-- "we'll find them automatically by email" — could never be kept.
--
-- WHEN the claim happens is the whole security question, and it is not at sign-up.
--
-- `handle_new_user()` fires on a raw INSERT into auth.users, which happens the instant
-- someone types an address into a form. Nobody has proved they can read mail sent there.
-- Claiming at that moment means anyone who knows a traveler's email address inherits their
-- name, phone, tags and trips — and, because platform_user_client is unique, the real
-- traveler's later sign-up finds nothing to claim and lands in a blank record while the
-- stranger keeps theirs. That is true even with email confirmations ON: the attacker never
-- gets a session, but the binding is already made and the rightful owner is locked out of
-- their own history.
--
-- So provisioning and claiming are split:
--
--   INSERT  → handle_new_user()             creates account, a FRESH client, platform_user
--   CONFIRM → handle_user_email_confirmed() repoints that platform_user at the pre-created
--                                           client, and disposes of the fresh one
--
-- The confirm trigger fires on the NULL → NOT NULL transition of email_confirmed_at, which
-- only GoTrue performs, and only after the link it mailed has been opened. That is the
-- first moment anything about mailbox ownership has been demonstrated.
--
-- Two further rules keep the match itself safe:
--
--   * Exact citext email equality, never a fuzzy name match. Attaching a stranger's trips
--     to an account is far worse than making somebody type an invite code.
--   * The Client must be UNCLAIMED — no platform_user points at it — so a second sign-up
--     on a shared address cannot steal a record already bound to someone's account.
--
-- And when two or more unclaimed rows match, nothing is claimed. Duplicate client rows with
-- one email are a real state (Screen 3.9.7 exists to merge them); picking arbitrarily
-- between them would silently show one traveler another's trips. The invite-code path
-- (§6.7) resolves that case deliberately instead.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_agent_id    uuid;
    v_requested   text;
    v_first_name  text;
    v_last_name   text;
    v_client_id   uuid;
    v_provider    auth_provider;
BEGIN
    v_provider := COALESCE(
        NULLIF(NEW.raw_app_meta_data ->> 'provider', ''),
        'email'
    )::auth_provider;

    v_first_name := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'first_name', ''), 'New');
    v_last_name  := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'last_name', ''), 'Traveler');

    INSERT INTO public.account (id, email, email_verified_at, auth_provider, auth_provider_id)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.email_confirmed_at,
        v_provider,
        CASE WHEN v_provider = 'email' THEN NULL ELSE NEW.raw_user_meta_data ->> 'sub' END
    );

    -- Always a fresh client. Adopting an existing one is handle_user_email_confirmed()'s
    -- job, and it does not run until the address has been proved. See the note above.
    --
    -- client.agent_id is NOT NULL, so an owner must be chosen. Absent an explicit choice,
    -- fall back to the sole active agent, which is correct for P1's single-agent business.
    -- Assigning a client to the wrong book of business is worse than a failed signup, so
    -- anything ambiguous raises instead of guessing.
    --
    -- SECURITY, and this is a real limitation rather than a nicety: raw_user_meta_data is
    -- entirely caller-controlled at signup (`options.data`), and signup is open. So
    -- `agent_id` here is a REQUEST, not proof of an invitation — a self-registering user
    -- can currently attach themselves to any active agent. That is harmless while there is
    -- one agent, and unacceptable at P3. The fix is the client_invite redemption path
    -- (§6.7), verified server-side against a hashed single-use code; the checks below
    -- (well-formed, exists, active) are a floor.
    v_requested := NULLIF(NEW.raw_user_meta_data ->> 'agent_id', '');

    IF v_requested IS NOT NULL THEN
        -- Signup metadata is caller-supplied: validate the shape before casting, or a typo
        -- surfaces as a raw "invalid input syntax for type uuid".
        IF v_requested !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            RAISE EXCEPTION 'Cannot provision client %: agent_id % is not a UUID.',
                NEW.email, v_requested;
        END IF;

        -- The invite path must satisfy the same active-status rule as the fallback;
        -- otherwise an archived agent silently inherits new clients.
        SELECT a.id INTO v_agent_id
        FROM public.agent a
        WHERE a.id = v_requested::uuid AND a.status = 'active';

        IF v_agent_id IS NULL THEN
            RAISE EXCEPTION 'Cannot provision client %: agent % is unknown or not active.',
                NEW.email, v_requested;
        END IF;
    ELSE
        -- STRICT: exactly one row, or it raises. Without it a second active agent would be
        -- resolved by picking an arbitrary row.
        BEGIN
            SELECT a.id INTO STRICT v_agent_id
            FROM public.agent a
            WHERE a.status = 'active';
        EXCEPTION
            WHEN no_data_found THEN
                RAISE EXCEPTION
                    'Cannot provision client %: no active agent exists to own them.', NEW.email
                    USING HINT = 'Seed an agent row, or pass agent_id in the signup metadata.';
            WHEN too_many_rows THEN
                RAISE EXCEPTION
                    'Cannot provision client %: several active agents and no agent_id in signup metadata.',
                    NEW.email
                    USING HINT = 'P3 multi-agent work: route signups through the 2.1.13 invite-code flow.';
        END;
    END IF;

    -- client.id is generated here rather than client-side: this row is created by the
    -- database in response to a signup, so there is no client to hand us a v7 UUID.
    -- gen_random_uuid() is v4; time-ordering is a nice-to-have for index locality, not a
    -- correctness property, and the offline-generation rule in §21.6 is about rows the apps
    -- create.
    v_client_id := gen_random_uuid();

    INSERT INTO public.client (id, agent_id, first_name, last_name, email)
    VALUES (v_client_id, v_agent_id, v_first_name, v_last_name, NEW.email);

    INSERT INTO public.platform_user (id, account_id, role, client_id, display_name)
    VALUES (
        gen_random_uuid(),
        NEW.id,
        'client',
        v_client_id,
        trim(v_first_name || ' ' || v_last_name)
    );

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
    'Provisions account + client + platform_user when Supabase Auth creates a user. Always '
    'creates a NEW client — adopting a pre-created one waits until the address is proved, '
    'in handle_user_email_confirmed(). SECURITY DEFINER because the anon role cannot write '
    'these tables. Data-Model §5.1.1.';


CREATE OR REPLACE FUNCTION public.handle_user_email_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

    -- The agent's spelling wins for the display name too. Someone who types "maya carter"
    -- into a sign-up form should still be greeted as Maya Carter, because the agent has
    -- been calling them that in email for weeks.
    UPDATE public.platform_user pu
       SET client_id = v_claim_id,
           display_name = (
               SELECT trim(c.first_name || ' ' || c.last_name)
               FROM public.client c WHERE c.id = v_claim_id
           ),
           updated_at = now()
     WHERE pu.id = v_user.id;

    -- Dispose of the blank row the signup made. It is seconds old and nothing should point
    -- at it, but a foreign key beats an assumption: if something does, archive instead so a
    -- confirmation can never fail on cleanup. A traveler being unable to confirm their
    -- email would be a far worse bug than a stray archived row.
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

COMMENT ON FUNCTION public.handle_user_email_confirmed() IS
    'Adopts a pre-created client row once the account has proved it owns the address '
    '(Screen 2.1.13 auto-match). Fires only on the NULL -> NOT NULL transition of '
    'email_confirmed_at, which only GoTrue performs. Data-Model §5.1.1.';

-- FOLLOW-UP, and the same gap auth_bridge.sql recorded for auth_event: neither trigger
-- writes an audit_event. Adopting a client row moves PII between accounts and is more
-- audit-worthy than the blank-row creation it replaces. CLAUDE.md rule 3 is scoped to Edge
-- Functions, so this is not a rule violation today, but the record should exist — write it
-- when the audit trigger backstop mentioned in Data-Model §20.3 lands.

CREATE TRIGGER on_auth_user_email_confirmed
    AFTER UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW
    WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
    EXECUTE FUNCTION public.handle_user_email_confirmed();

-- ============================================================
-- 4. Self-read policies for the onboarding tables
-- ============================================================
--
-- SELECT only. See the header: every write here runs as the service role in an Edge
-- Function. RLS with no INSERT/UPDATE/DELETE policy denies those outright, which is the
-- intent — `authenticated` holds the table-level grants Supabase issues by default, so
-- the policy is the whole gate.

CREATE POLICY travel_preference_self_select ON public.travel_preference
    FOR SELECT TO authenticated
    USING (client_id = (SELECT client_id FROM public.current_platform_user()));

CREATE POLICY companion_self_select ON public.companion
    FOR SELECT TO authenticated
    USING (client_id = (SELECT client_id FROM public.current_platform_user()));

CREATE POLICY travel_document_self_select ON public.travel_document
    FOR SELECT TO authenticated
    USING (client_id = (SELECT client_id FROM public.current_platform_user()));

-- SECURITY DEFINER for the same reason current_platform_user() is: a policy on `address`
-- that reads `client` inline makes one policied table's visibility depend on another's,
-- which is the recursive-evaluation trap the rls-policy skill warns about. It is only safe
-- here today because the predicate happens to duplicate client_self_select's; running the
-- lookup as the owner means it stays safe when that stops being true.
CREATE OR REPLACE FUNCTION public.current_client_mailing_address_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT c.mailing_address_id
    FROM public.client c
    WHERE c.id = (SELECT client_id FROM public.current_platform_user());
$$;

COMMENT ON FUNCTION public.current_client_mailing_address_id() IS
    'The calling client''s mailing address id, or NULL. SECURITY DEFINER to keep the '
    'address policy from depending on the client policy — see the rls-policy skill.';

REVOKE EXECUTE ON FUNCTION public.current_client_mailing_address_id() FROM public;
GRANT EXECUTE ON FUNCTION public.current_client_mailing_address_id()
    TO authenticated, service_role;

CREATE POLICY address_self_select ON public.address
    FOR SELECT TO authenticated
    USING (id = public.current_client_mailing_address_id());

-- ── The two ciphertext columns stay out of reach ──
--
-- RLS is row-level; it cannot hide a column. Nobody holding a browser session has any use
-- for the encrypted passport bytes — neither a client nor an agent can decrypt them, the
-- DEK is backend-only (§18.2), and §18.3 requires every decryption to be audited, which is
-- only possible when decryption happens server-side.
--
-- The mechanism has one trap worth spelling out: `REVOKE SELECT (col)` does NOT subtract
-- from a table-level grant, and Supabase issues table-level SELECT to anon and
-- authenticated by default. A column revoke on its own is a silent no-op — it reports
-- success and changes nothing. The privilege has to be taken at the table and given back
-- one column at a time.
--
-- The column list is written out rather than generated from the catalog on purpose. A
-- column added later is unreadable until someone adds it here, which surfaces immediately
-- in development as a permission error; the generated alternative would quietly expose
-- whatever the next sensitive column turns out to be.

REVOKE SELECT ON public.travel_document FROM authenticated, anon;
GRANT SELECT (
    id, client_id, companion_id, document_id, kind,
    issuing_country, issued_on, expires_on, notes,
    created_at, updated_at, archived_at
) ON public.travel_document TO authenticated;

REVOKE SELECT ON public.companion FROM authenticated, anon;
GRANT SELECT (
    id, client_id, first_name, last_name, relationship, date_of_birth,
    passport_expiry, passport_country, frequent_flyer_numbers,
    is_invited_to_platform, linked_client_id, created_at, updated_at
) ON public.companion TO authenticated;

-- KNOWN GAP, deliberately not fixed here: `client_self_select` (added in the auth_bridge
-- migration) lets a client read their whole row, including `notes` — the agent's private
-- free-form notes — plus `tags` and `lifetime_value_cents`, all marked Internal in
-- Data-Model §6.1. The same column trick cannot fix it, because agents and clients share
-- the `authenticated` role and the agent legitimately needs those columns. The real fix is
-- role-specific views, and it belongs with the full RLS pass over the remaining tables
-- rather than bolted on here. Nothing reads client.notes on the client surface today.

COMMIT;
