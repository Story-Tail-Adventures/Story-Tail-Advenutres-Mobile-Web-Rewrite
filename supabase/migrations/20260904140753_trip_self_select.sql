-- A traveler can read their own trips.
--
-- See docs/Data-Model.md §19.1 and docs/Screen-Inventory.md §2.1.13.
--
-- `trip` has had row level security enabled since the initial migration and not one policy
-- on it, which for `authenticated` means every SELECT returns zero rows — silently, because
-- RLS filters rather than errors. Screen 2.1.13's whole job is to show a traveler the trips
-- Gyasi has already started planning for them, and as things stand that panel would render
-- empty and look like nothing was found. 2.2.1 and 2.2.2 need the same policy.
--
-- TWO COLUMNS ARE NOT THE TRAVELER'S TO SEE, and a policy alone does not stop them: RLS
-- decides which ROWS, grants decide which COLUMNS. `notes` is where the agent writes what
-- he thinks, and `total_commission_cents` is what he earns on the trip. Both would come
-- back with `select *` from a policy-only setup. So the same REVOKE-then-GRANT the
-- onboarding migration used for travel_document applies here.
--
-- The trap that made that necessary is worth restating: `REVOKE SELECT (col)` is a NO-OP
-- against a table-level grant. Supabase grants `SELECT` on the whole table to
-- `authenticated` by default, and revoking one column from that changes nothing at all —
-- the table-level privilege still answers. The table grant has to go first.

CREATE POLICY trip_self_select ON public.trip
    FOR SELECT TO authenticated
    USING (client_id = (SELECT client_id FROM public.current_platform_user()));

COMMENT ON POLICY trip_self_select ON public.trip IS
    'A client reads their own trips (Data-Model §19.1). Agents read through the service '
    'role until the agent-side policy lands with §3.9.x — an agent''s platform_user.client_id '
    'is NULL, so this predicate is NULL for them and returns nothing.';

REVOKE SELECT ON public.trip FROM authenticated, anon;

GRANT SELECT (
    id, client_id, agent_id, title, trip_type, status, status_changed_at,
    start_date, end_date, destinations, traveler_count, traveler_breakdown,
    total_value_cents, total_paid_cents, currency, template_id,
    cancellation_reason, refund_status, created_at, updated_at, archived_at, version
) ON public.trip TO authenticated;

COMMENT ON COLUMN public.trip.notes IS
    'The agent''s own notes on the trip. Deliberately outside the column grant to '
    '`authenticated` — see the trip_self_select migration.';

COMMENT ON COLUMN public.trip.total_commission_cents IS
    'What the agency earns on the trip. Deliberately outside the column grant to '
    '`authenticated`: the client is not the merchant of record and this is not their '
    'number (BRD §10.5).';
