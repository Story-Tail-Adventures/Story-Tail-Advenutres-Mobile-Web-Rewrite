-- Take TRUNCATE (and the rest of the write bits) away from `anon` and `authenticated`.
--
-- Found reviewing the §2.2 read policies. RLS default-denies INSERT, UPDATE and DELETE when
-- a table has no policy for them, so the absence of write policies across this schema reads
-- like the write surface is closed. For three of the four verbs it is.
--
-- TRUNCATE IS NOT SUBJECT TO ROW LEVEL SECURITY. Postgres checks it as a plain table
-- privilege, so an RLS-only defence never sees it — and `auto_expose_new_tables` had granted
-- the full write set to `anon` and `authenticated` on every table the initial migration
-- created. Measured before this migration: 35 of the 38 tables in `public` let `anon`
-- TRUNCATE them. The only three that did not were message_attachment, payment_milestone and
-- testimonial, added hours earlier with `REVOKE ALL` — which is what made the inconsistency
-- visible in the first place.
--
-- Nothing today relies on these privileges: every client write goes through an Edge Function
-- on the service role, and RLS was already refusing the other three verbs. So this is
-- behaviourally a no-op that closes a destructive hole. Defence in depth rather than a live
-- exploit — PostgREST does not expose TRUNCATE, so reaching it needs a raw SQL connection as
-- one of those roles — but a grant nobody wants is a grant worth not having.
--
-- WHY NOT `REVOKE ALL`: it would take SELECT with it, wiping the column-level grants that
-- trip_self_select, client_column_grant and trip_read_policies built up deliberately. Naming
-- the write verbs leaves those untouched. Both halves are asserted below.

DO $$
DECLARE
    t record;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
    LOOP
        EXECUTE format(
            'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER '
            'ON public.%I FROM anon, authenticated',
            t.relname
        );
    END LOOP;
END
$$;

-- Assert it took, and that SELECT survived. A silent failure here would leave the schema
-- looking locked down while it was not, which is the state this migration exists to end.
DO $$
DECLARE
    leaky integer;
    trip_cols integer;
BEGIN
    SELECT count(*) INTO leaky
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND (has_table_privilege('authenticated', c.oid, 'TRUNCATE')
        OR has_table_privilege('anon', c.oid, 'TRUNCATE')
        OR has_table_privilege('authenticated', c.oid, 'DELETE')
        OR has_table_privilege('anon', c.oid, 'DELETE')
        OR has_table_privilege('authenticated', c.oid, 'INSERT')
        OR has_table_privilege('anon', c.oid, 'INSERT'));

    IF leaky > 0 THEN
        RAISE EXCEPTION
            '% table(s) in public still grant a write privilege to anon or authenticated',
            leaky;
    END IF;

    -- `trip` is the canary for the column grants: trip_self_select granted 22 columns and
    -- deliberately left out `notes` and `total_commission_cents`. If the REVOKE above had
    -- taken SELECT with it, this collapses to zero and every §2.2 screen goes blank while
    -- looking like an empty-state bug.
    SELECT count(*) INTO trip_cols
    FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'trip'
      AND grantee = 'authenticated' AND privilege_type = 'SELECT';

    IF trip_cols <> 22 THEN
        RAISE EXCEPTION
            'expected 22 column-level SELECT grants on public.trip for authenticated, found % '
            '— the REVOKE was too broad, or trip_self_select changed', trip_cols;
    END IF;
END
$$;
