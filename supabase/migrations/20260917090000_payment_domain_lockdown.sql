-- Take the payment domain's client-role grants away. §2.4's first migration, and the one
-- that has to land before any other line of it.
--
-- ── WHAT WAS WRONG ───────────────────────────────────────────────────────────────
--
-- Every sensitive table in this schema has had one of two treatments applied to it:
--
--   * REVOKE-then-column-GRANT, for tables a client reads some of — `client`, `trip`,
--     `travel_document`, `companion`, `conversation`, `message` and six more
--     (20260905171542_client_column_grant.sql, 20260907031255_trip_read_policies.sql).
--   * REVOKE ALL plus an assertion, for tables a client never reads — the cruise catalog
--     (20260909001124:610-643) and the hotel search tables (20260909120000:339-364).
--
-- The payment domain got NEITHER. `payment_card`, `card_authorization`,
-- `authorization_request` and `card_use_event` were created in 20260514120000_initial.sql
-- with RLS enabled and nothing else, so they kept the schema-wide default grant. Measured on
-- a freshly reset database before this migration:
--
--     has_table_privilege('anon',          'public.payment_card', 'SELECT')  -> true
--     has_table_privilege('authenticated', 'public.payment_card', 'SELECT')  -> true
--     15 SELECT column grants to each role, INCLUDING stripe_payment_method_id
--     and stripe_customer_id
--
-- against `client`, `trip` and `conversation`, which correctly return false.
-- `audit_event` and `commission` are in the identical state and are taken with them: they
-- are the same defect, and fixing four of six tables would be arbitrary.
--
-- ── WHY THIS WAS NOT ALREADY A LEAK, AND WHY IT IS STILL URGENT ──────────────────
--
-- Nothing leaked. RLS is ENABLED on all six with ZERO policies, which fails closed — a
-- client's SELECT returns zero rows rather than an error. That is the whole reason this
-- survived unnoticed since the initial migration.
--
-- It is a loaded gun rather than a fired one. The obvious first migration for Screen 2.4.1
-- ("My Cards") is a `payment_card_self_select` policy, and the moment one is added every
-- granted column becomes readable — `stripe_payment_method_id` and `stripe_customer_id`
-- included, which CLAUDE.md rule 4 and Data-Model §21.2 both name as server-only.
--
-- `authorization_request.token_hash` is worse than a data leak. It is the single-use hash
-- behind Screen 2.4.3's emailed authorization link, and anon-readable makes it an
-- authorization-bypass primitive rather than a disclosure.
--
-- And the ordering matters: `REVOKE SELECT (col)` is a NO-OP against a standing table-level
-- grant (20260905171542:30-32). So the revoke has to come first, whatever the read path
-- turns out to be. This migration is therefore safe in the strongest sense — it only takes
-- privilege away, so it cannot break a screen that works today, and there is no screen that
-- reads these tables at all.
--
-- ── NO CLIENT POLICY IS ADDED HERE, ON PURPOSE ───────────────────────────────────
--
-- `.claude/skills/rls-policy/SKILL.md:38-42` already classifies `payment_card`,
-- `card_authorization` and `authorization_request` as service-role-only — "No
-- `authenticated` policy whatsoever" — and `card_use_event` as append-only with SELECT for
-- admins. :113-115 lists granting a client role access to those tables among the things that
-- skill never does. §2.4's screens therefore read through audited Edge Functions projecting
-- a hand-written column allowlist, exactly as `trip-document-url` does for a storage key.
--
-- Reversing that ruling is a decision, not a build step. Until it is reversed, these tables
-- hold no client-role privilege at all — which is what the assertion below enforces.

BEGIN;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'payment_card', 'card_authorization', 'authorization_request', 'card_use_event',
        'audit_event', 'commission'
    ]
    LOOP
        -- Already enabled on all six; restated so the posture does not depend on the
        -- initial migration staying as it is.
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
END $$;

-- Assert the posture rather than assume it, the way 20260907031256 and the cruise catalog
-- migration do. If a future migration, a `GRANT ... ON ALL TABLES`, or a Supabase config
-- change hands one of these back to a client role, this fails at deploy time instead of
-- waiting for somebody to notice a token in a network tab.
DO $$
DECLARE
    leaked text;
BEGIN
    SELECT string_agg(DISTINCT table_name || ' (' || grantee || ')', ', ')
      INTO leaked
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND grantee IN ('anon', 'authenticated')
       AND table_name IN (
           'payment_card', 'card_authorization', 'authorization_request', 'card_use_event',
           'audit_event', 'commission'
       );

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'Payment-domain tables still grant privileges to a client role: %', leaked;
    END IF;
END $$;

-- Column grants are listed separately from table grants in the catalog, and a column grant
-- can outlive the table grant that looks like its parent. The whole point of this migration
-- is the two Stripe columns, so they get their own assertion rather than being assumed to
-- have gone with the REVOKE above.
DO $$
DECLARE
    leaked text;
BEGIN
    SELECT string_agg(DISTINCT table_name || '.' || column_name || ' (' || grantee || ')', ', ')
      INTO leaked
      FROM information_schema.column_privileges
     WHERE table_schema = 'public'
       AND grantee IN ('anon', 'authenticated')
       AND table_name IN (
           'payment_card', 'card_authorization', 'authorization_request', 'card_use_event',
           'audit_event', 'commission'
       );

    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION
            'Payment-domain columns still granted to a client role: %', leaked;
    END IF;
END $$;

COMMIT;
