-- §3.12 Agent Settings, PR 3: the client's "Your advisor" card (Q11) and "Away until" (Q14).
-- Rulings: docs/Screen-Inventory.md §3.12 (2026-10-17). Data-Model §7.1, §7.3, §7.5.
--
-- ONE READ, client_advisor_card(): what a signed-in client may see of THEIR OWN advisor. Only
-- the client-facing fields (Data-Model marks them Public): name, pronouns, bio, photo path,
-- social links, the reply-time promise, and the first day back while the advisor is away.
-- Never the advisor's email, phone, hours, time zone, or the label of their time away.
--
-- The contract is shared with the Android PR (PR 4), which reads the same function:
--   {displayName, firstName, pronouns, bio, avatarPath, socialLinks, responseTimeHours, awayUntil}
-- awayUntil is the first day back (ISO date: the day after a running block's last day), or null.

BEGIN;

CREATE OR REPLACE FUNCTION public.client_advisor_card()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'displayName',       a.display_name,
        'firstName',         split_part(btrim(a.display_name), ' ', 1),
        'pronouns',          a.pronouns,
        'bio',               a.bio,
        'avatarPath',        a.avatar_url,
        'socialLinks',       a.social_links,
        'responseTimeHours', coalesce(av.response_time_hours, 24),
        'awayUntil',         (
            SELECT t.ends_on + 1
              FROM public.agent_time_off t
             WHERE t.agent_id = a.id
               AND public.agent_local_today(a.id) BETWEEN t.starts_on AND t.ends_on
             ORDER BY t.ends_on DESC
             LIMIT 1)
    )
      FROM public.platform_user pu
      JOIN public.client c ON c.id = pu.client_id AND c.status <> 'merged_into'
      JOIN public.agent a ON a.id = c.agent_id AND a.status <> 'archived'
      LEFT JOIN public.agent_availability av ON av.agent_id = a.id
     WHERE pu.account_id = auth.uid()
       AND pu.role = 'client';
$$;

COMMENT ON FUNCTION public.client_advisor_card() IS
    'Screen-Inventory §3.12 Q11: the signed-in client''s own advisor, client-facing fields only '
    '(no email, phone, hours or time-away label). NULL for anyone who is not a client with a '
    'live advisor. awayUntil = first day back while a time-away block runs.';

REVOKE ALL ON FUNCTION public.client_advisor_card() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.client_advisor_card() TO authenticated, service_role;

-- It calls agent_local_today() as its owner (definer), so no client grant is needed there.

COMMIT;
