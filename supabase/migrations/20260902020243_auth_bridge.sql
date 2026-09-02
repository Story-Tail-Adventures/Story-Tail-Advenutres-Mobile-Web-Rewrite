-- Story-Tail Adventures — bridge public.account to Supabase Auth
--
-- Source of truth: docs/Data-Model.md §5.1.1
--
-- The initial migration created `account` as a standalone table with no link to
-- `auth.users` and no provisioning trigger. The practical effect: a user could
-- authenticate successfully and the application could then read nothing about them —
-- no account row, no platform_user, no role. Login had nowhere to land.
--
-- This migration adds the three things Screen 2.1.1 needs and nothing more:
--   1. account.id IS auth.users.id, enforced by FK
--   2. a SECURITY DEFINER trigger that provisions account + client + platform_user
--   3. the three self-read RLS policies a signed-in user needs to see themselves
--
-- Deliberately NOT in scope:
--   * The full RLS pass over the other 31 tables. That is a separate migration —
--     author it with the `rls-policy` skill, which tests each policy under a forged
--     request.jwt.claims for client / other-agent's-client / owning-agent.
--   * Writing `auth_event` rows on login. Login is not a mutation to a sensitive table,
--     so CLAUDE.md rule 3 does not require it, and doing it properly means either a
--     trigger on auth.audit_log_entries or a log-auth-event Edge Function. Follow-up.
--   * Moving citext and pg_trgm out of `public` into `extensions`. They landed in
--     `public` because the initial migration omitted `WITH SCHEMA extensions`, and
--     pgcrypto/uuid-ossp silently no-opped because the Supabase image pre-installs them
--     there. Harmless locally; fix it before the first push to a hosted project.

BEGIN;

-- ============================================================
-- 1. account.id IS auth.users.id
-- ============================================================
--
-- Sharing the key makes the JWT `sub` claim resolve straight to account.id, so
-- _shared/auth.ts does one hop to platform_user instead of two on every request.
--
-- RESTRICT, deliberately, NOT CASCADE.
--
-- A cascade here would be worse than useless. It cannot reach past `account`:
-- platform_user, session, mfa_device and auth_event all reference account(id) with no
-- cascade of their own, so `DELETE FROM auth.users` would fail on
-- platform_user_account_id_fkey for every account that has ever signed in. Cascading
-- those too would then destroy records the project is required to keep — audit_event
-- rows hang off platform_user and are retained 7-10 years, auth_event for 1 year
-- (Data-Model §18.6), and §18.5 states audit logs are explicitly excluded from erasure.
--
-- Physically deleting an account is therefore not a supported operation. Erasure is the
-- anonymization flow in §18.5: PII replaced with placeholders, financial and audit rows
-- retained and scrubbed. RESTRICT makes that refusal explicit at the database rather
-- than leaving a cascade that silently cannot fire.

ALTER TABLE public.account
    ADD CONSTRAINT account_auth_user_fk
    FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.account.id IS
    'Same UUID as auth.users.id. Provisioned by handle_new_user(). See Data-Model §5.1.1.';

COMMENT ON COLUMN public.account.password_hash IS
    'Always NULL. GoTrue owns credential state in auth.users.encrypted_password. '
    'This column exists for schema completeness only — never write to it. Data-Model §5.1.1.';

-- ============================================================
-- 2. Provisioning trigger
-- ============================================================

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
    -- Which agent owns this client?
    --
    -- client.agent_id is NOT NULL, so one must be chosen. Absent an explicit choice,
    -- fall back to the sole active agent, which is correct for P1's single-agent
    -- business. Assigning a client to the wrong book of business is worse than a failed
    -- signup, so anything ambiguous raises instead of guessing.
    --
    -- SECURITY, and this is a real limitation rather than a nicety: raw_user_meta_data
    -- is entirely caller-controlled at signup (`options.data`), and signup is open. So
    -- `agent_id` here is a REQUEST, not proof of an invitation — a self-registering user
    -- can currently attach themselves to any active agent. That is harmless while there
    -- is one agent, and unacceptable at P3. Before Screen Inventory 2.1.13 ships this
    -- must verify a signed or single-use invite token instead of trusting the id, and
    -- the checks below (well-formed, exists, active) are a floor rather than the fix.
    v_requested := NULLIF(NEW.raw_user_meta_data ->> 'agent_id', '');

    IF v_requested IS NOT NULL THEN
        -- Signup metadata is caller-supplied: validate the shape before casting, or a
        -- typo surfaces as a raw "invalid input syntax for type uuid".
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
        -- STRICT: exactly one row, or it raises. Without it a second active agent would
        -- be resolved by picking an arbitrary row.
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

    -- client.id is generated here rather than client-side: this row is created by the
    -- database in response to a signup, so there is no client to hand us a v7 UUID.
    -- gen_random_uuid() is v4; time-ordering is a nice-to-have for index locality, not
    -- a correctness property, and the offline-generation rule in §21.6 is about rows
    -- the apps create.
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
    'Provisions account + client + platform_user when Supabase Auth creates a user. '
    'SECURITY DEFINER because the anon role cannot write these tables. Data-Model §5.1.1.';

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. Self-read policies
-- ============================================================
--
-- The minimum for a signed-in user to see themselves. Every other table stays
-- service-role-only until the full RLS pass lands.
--
-- current_platform_user() is SECURITY DEFINER on purpose. A policy on `client` needs to
-- consult `platform_user`, which would itself need a policy to be readable — the classic
-- recursive-policy trap. Running the lookup as the function owner breaks the cycle, and
-- it keeps the join in one place instead of copied into every policy body.

CREATE OR REPLACE FUNCTION public.current_platform_user()
RETURNS public.platform_user
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT * FROM public.platform_user WHERE account_id = auth.uid() LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_platform_user() IS
    'The calling user''s platform_user row. SECURITY DEFINER to avoid recursive policy '
    'evaluation — see the rls-policy skill.';

-- A SECURITY DEFINER function is executable by PUBLIC by default. It only ever returns
-- the caller's own row, so there is no exposure today, but granting deliberately keeps
-- that true if the body ever changes.
REVOKE EXECUTE ON FUNCTION public.current_platform_user() FROM public;
GRANT EXECUTE ON FUNCTION public.current_platform_user() TO authenticated, service_role;

CREATE POLICY account_self_select ON public.account
    FOR SELECT TO authenticated
    USING (id = auth.uid());

CREATE POLICY platform_user_self_select ON public.platform_user
    FOR SELECT TO authenticated
    USING (account_id = auth.uid());

CREATE POLICY client_self_select ON public.client
    FOR SELECT TO authenticated
    USING (id = (SELECT client_id FROM public.current_platform_user()));

COMMIT;
