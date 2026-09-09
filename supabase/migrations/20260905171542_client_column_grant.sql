-- A traveler reads their own client row — but not what the agent wrote about them.
--
-- See docs/Data-Model.md §6.1 and §18.
--
-- `client_self_select` (20260902020243_auth_bridge.sql) is a whole-row FOR SELECT policy:
-- `id = (SELECT client_id FROM current_platform_user())`. It is the right ROW rule and it
-- was never the whole story, because Supabase grants `SELECT` on the entire table to
-- `authenticated` by default. RLS decides which ROWS; only a GRANT decides which COLUMNS.
-- So from the day that policy shipped, any traveler could read `client.notes` — the agent's
-- private free-form notes about them — along with `tags`, `lifetime_value_cents` and
-- `merged_into_client_id`. Data-Model §6.1 marks all five Internal, and the onboarding
-- migration that documented this gap deliberately left it for here.
--
-- Nothing had to be exploited to see it: `SELECT * FROM client` from any signed-in
-- traveler's session returned every column of their own row.
--
-- WHAT STAYS OUT, and why each is the agent's and not the traveler's:
--   notes                  what the agent thinks of them, in prose
--   tags                   the agent's own categorisation ('referral', 'first-trip')
--   lifetime_value_cents   a CRM metric computed for the agent's sort and filter, and not a
--                          number the client is the merchant of record for (BRD §10.5)
--   status                 the agent-side lifecycle: active / archived / merged_into
--   merged_into_client_id  internal record-keeping, and it leaks another row's id
--
-- WHAT STAYS IN is everything else, because the traveler is the DATA SUBJECT. Sensitivity in
-- §6.1 describes how a field must be HANDLED, not who may see it — `date_of_birth` is
-- Sensitive PII and Screen 2.1.10 prefills the form with it, because it is their birthday.
--
-- THE TRAP, restated because it is the reason this is a REVOKE and not a narrower change:
-- `REVOKE SELECT (col)` is a NO-OP against a table-level grant. Revoking one column while
-- the table privilege still stands changes nothing at all. The table grant has to go first.
-- Same shape as travel_document and companion in 20260903190707, and trip in 20260904140753.
--
-- `anon` is revoked too. It has no policy on this table so RLS already returns nothing, but
-- leaving a table-level SELECT in place for a role that should never read the table is a
-- privilege waiting for the first permissive policy someone adds.
--
-- WRITES ARE UNAFFECTED and remain closed: `client` has exactly one policy, this SELECT one,
-- so INSERT / UPDATE / DELETE match no policy and are refused regardless of the grants. Every
-- write goes through an audited Edge Function on the service role (CLAUDE.md rule 3).

-- ONE THING THIS MAKES HARDER, deliberately recorded because it will surprise somebody.
-- An AGENT is also the Postgres role `authenticated` — the agent/client distinction is
-- `platform_user.role`, not a database role. So this grant binds them too, and the
-- book-of-business screens in §3.9.x cannot read `client.notes` through PostgREST no matter
-- what policy they get. That is the correct default (an agent-visible column set is a
-- deliberate decision, not an inheritance), and the options when it lands are a
-- SECURITY DEFINER accessor, a view, or the service role behind an Edge Function. Choosing
-- one is that change's job, not this one's.

BEGIN;

REVOKE SELECT ON public.client FROM authenticated, anon;

GRANT SELECT (
    id, agent_id, first_name, last_name, preferred_name, email, phone, date_of_birth,
    mailing_address_id, important_dates, emergency_contact,
    created_at, updated_at, archived_at, version
) ON public.client TO authenticated;

COMMENT ON COLUMN public.client.notes IS
    'The agent''s own free-form notes on the client. Deliberately outside the column grant '
    'to `authenticated` — see the client_column_grant migration. Structured history lives '
    'in client_note.';

COMMENT ON COLUMN public.client.tags IS
    'The agent''s own categorisation of the client. Deliberately outside the column grant '
    'to `authenticated` — see the client_column_grant migration.';

COMMENT ON COLUMN public.client.lifetime_value_cents IS
    'Computed CRM metric, cached for the agent''s sort and filter. Deliberately outside the '
    'column grant to `authenticated`: the client is not the merchant of record and this is '
    'not their number (BRD §10.5).';

COMMENT ON COLUMN public.client.status IS
    'Agent-side lifecycle: active, archived, merged_into. Deliberately outside the column '
    'grant to `authenticated` — see the client_column_grant migration.';

COMMENT ON COLUMN public.client.merged_into_client_id IS
    'Set when status = merged_into. Deliberately outside the column grant to '
    '`authenticated`: internal record-keeping, and it discloses another client row''s id.';

-- ── The same trap, three more times ────────────────────────────────────────────
--
-- Found while checking what else could still read this table. `REVOKE EXECUTE ... FROM
-- public` is a no-op against Supabase's defaults for exactly the reason `REVOKE SELECT
-- (col)` is: Supabase grants EXECUTE on new public functions to `anon`, `authenticated`
-- and `service_role` by NAME, and revoking the PUBLIC pseudo-role leaves all three
-- untouched. Three functions therefore never got the lockdown their own comments describe.
-- `pg_proc.proacl` read them all as `anon=X authenticated=X service_role=X`.
--
--   current_platform_user()              auth_bridge.sql:211 meant authenticated + service_role
--   current_client_mailing_address_id()  onboarding_schema.sql:433 meant the same
--   client_invite_code_hash(text)        onboarding_schema.sql:139 meant service_role ALONE,
--                                        and its comment says leaving it callable by
--                                        `authenticated` "would invite someone to build
--                                        redemption on the client where the rate limiting
--                                        and the audit_event are not" — which is what has
--                                        been true since the day it shipped
--
-- No live leak from the first two: both are SECURITY DEFINER and key off `auth.uid()`,
-- which is NULL for a genuine anon JWT, so they already return nothing. The third is a
-- pure hash of its argument and discloses no row. This closes the gap between what the
-- comments promise and what the catalog enforces, which is the part that would have
-- decayed silently.

REVOKE EXECUTE ON FUNCTION public.current_platform_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_client_mailing_address_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.client_invite_code_hash(text) FROM anon, authenticated;

COMMIT;
