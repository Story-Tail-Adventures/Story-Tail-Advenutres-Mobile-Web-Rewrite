-- Story-Tail Adventures — take a social sign-up's name from the claims it actually sends
--
-- handle_new_user() reads `first_name` and `last_name` out of raw_user_meta_data, which is
-- correct for email sign-up: registerAction and the 2.0.6 gate both put exactly those two
-- keys there (and nothing else — see that function's comment about agent_id).
--
-- No OAuth path can. `signInWithOAuth` has no `options.data`, and Supabase fills
-- raw_user_meta_data from the provider's OIDC claims: `given_name`, `family_name`, `name`,
-- `full_name`, `picture`, `sub`. None of them is `first_name`. So every Google or Apple
-- sign-up fell through to the placeholders and created:
--
--     client.first_name = 'New', client.last_name = 'Traveler'
--
-- Reproduced against a real Google-shaped claims payload before this fix. It is not only a
-- greeting bug: that is the row Gyasi sees in the CRM, the name on the trip, and the name
-- 2.1.13's adoption path would then preserve as "the agent's spelling". Screens 2.1.1,
-- 2.1.2 and 2.1.8 already offer the buttons that lead here, behind the
-- NEXT_PUBLIC_AUTH_*_ENABLED flags.
--
-- Only the two name expressions change. Everything else about the trigger — the agent
-- resolution, and the deliberate refusal to adopt a pre-created client until the address is
-- confirmed — is unchanged from 20260903190707_onboarding_schema.sql.

BEGIN;

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
    v_full_name   text;
    v_client_id   uuid;
    v_provider    auth_provider;
BEGIN
    v_provider := COALESCE(
        NULLIF(NEW.raw_app_meta_data ->> 'provider', ''),
        'email'
    )::auth_provider;

    -- ── Name, in order of how much the source actually knew ──
    --
    --   1. first_name / last_name   our own sign-up forms, which send exactly these
    --   2. given_name / family_name the OIDC standard claims, sent by Google and by Apple
    --                               on first authorization
    --   3. name / full_name         split on the first space, for providers that send only
    --                               a display name
    --   4. the placeholders
    --
    -- Splitting a full name on the first space is wrong for some people — compound given
    -- names and multi-part surnames both break it. It is still better than 'New Traveler',
    -- and it is corrected the moment the traveler edits their profile at Screen 2.1.10 or
    -- Gyasi edits the record. What must not happen is quietly keeping a placeholder that
    -- everything downstream then treats as the person's name.
    --
    -- Apple sends name claims only on the FIRST authorization and nothing on later ones, so
    -- branch 4 stays reachable no matter how good branches 2 and 3 are.
    v_full_name := COALESCE(
        NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
        NULLIF(NEW.raw_user_meta_data ->> 'name', '')
    );

    v_first_name := COALESCE(
        NULLIF(NEW.raw_user_meta_data ->> 'first_name', ''),
        NULLIF(NEW.raw_user_meta_data ->> 'given_name', ''),
        NULLIF(split_part(COALESCE(v_full_name, ''), ' ', 1), ''),
        'New'
    );

    v_last_name := COALESCE(
        NULLIF(NEW.raw_user_meta_data ->> 'last_name', ''),
        NULLIF(NEW.raw_user_meta_data ->> 'family_name', ''),
        -- Everything after the first space, and only when there IS one: for a mononym this
        -- has to fall through rather than repeat the given name as a surname.
        CASE
            WHEN v_full_name IS NOT NULL AND position(' ' IN v_full_name) > 0
            THEN NULLIF(trim(substr(v_full_name, position(' ' IN v_full_name) + 1)), '')
        END,
        'Traveler'
    );

    INSERT INTO public.account (id, email, email_verified_at, auth_provider, auth_provider_id)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.email_confirmed_at,
        v_provider,
        CASE WHEN v_provider = 'email' THEN NULL ELSE NEW.raw_user_meta_data ->> 'sub' END
    );

    -- Always a fresh client. Adopting a pre-created one is handle_user_email_confirmed()'s
    -- job, and it does not run until the address has been proved — see
    -- 20260903190707_onboarding_schema.sql for the reasoning.
    v_requested := NULLIF(NEW.raw_user_meta_data ->> 'agent_id', '');

    IF v_requested IS NOT NULL THEN
        IF v_requested !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            RAISE EXCEPTION 'Cannot provision client %: agent_id % is not a UUID.',
                NEW.email, v_requested;
        END IF;

        SELECT a.id INTO v_agent_id
        FROM public.agent a
        WHERE a.id = v_requested::uuid AND a.status = 'active';

        IF v_agent_id IS NULL THEN
            RAISE EXCEPTION 'Cannot provision client %: agent % is unknown or not active.',
                NEW.email, v_requested;
        END IF;
    ELSE
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
    'Provisions account + client + platform_user when Supabase Auth creates a user. Takes '
    'the name from first_name/last_name, then the OIDC given_name/family_name a social '
    'sign-in sends, then a full name split on the first space. Always creates a NEW client '
    '— adopting a pre-created one waits until the address is proved, in '
    'handle_user_email_confirmed(). Data-Model §5.1.1.';

COMMIT;
