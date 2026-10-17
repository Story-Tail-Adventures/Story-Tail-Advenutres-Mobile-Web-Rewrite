-- P1 — agent MFA is required, and now the database says so too.
--
-- BRD §11 (Security) and Data-Model §5.1 (`account.mfa_required`, true for every agent) have
-- always said agents sign in with a second factor. Until this migration only the web proxy
-- acted on it, and only for an advisor who already had a factor enrolled: a password alone
-- read the whole agent surface through PostgREST from the phone, or from anything holding
-- the token.
--
-- `current_agent_id()` is the single identity every agent_* read accessor resolves the
-- caller through (rls_agent_reads.sql asserts it), so gating it gates them all. A session
-- that is not aal2 now gets NULL, which is the same answer a traveler gets, and every
-- predicate built on it already fails closed on NULL: empty boards, not errors.
--
-- The Edge Function side makes the same test in `requireAgentId`
-- (supabase/functions/_shared/agent.ts). The two must agree. If one moves, move both.
--
-- `aal` is read from the VERIFIED JWT (`auth.jwt()`), the way §3.9's
-- agent_client_account_admin() reads it (20261022120000_login_support.sql). A missing claim
-- counts as aal1. A service-role call has no `sub`, so auth.uid() is NULL and the function
-- already answered NULL there; nothing on the service role reads through this.
--
-- The body is 20260919140000's, word for word, plus the one aal line. The search_path pin,
-- comment and grants are restated so this file stands on its own.

BEGIN;

CREATE OR REPLACE FUNCTION public.current_agent_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT pu.agent_id
      FROM public.platform_user pu
      JOIN public.agent a ON a.id = pu.agent_id
     WHERE pu.account_id = auth.uid()
       AND pu.role = 'agent'
       AND a.status <> 'archived'
       AND coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_agent_id() IS
    'The calling agent''s agent_id, or NULL. The §3.x analogue of current_platform_user(). '
    'SECURITY DEFINER so it can read platform_user and agent without a client-shaped policy. '
    'NULL for every non-agent AND for an agent whose session is not aal2 (agent MFA is '
    'required), which is what makes every predicate built on it fail closed.';

REVOKE EXECUTE ON FUNCTION public.current_agent_id() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.current_agent_id() TO authenticated, service_role;

COMMIT;
