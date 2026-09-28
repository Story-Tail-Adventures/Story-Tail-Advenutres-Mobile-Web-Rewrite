-- The commission ledger gets a currency, a fee column, and constraints. NOT a producer.
--
-- 20260930140000 moved the FORECAST off this table. This one deals with the other half of
-- the same defect: `commission` has no write surface at all, and until §3.7 builds one the
-- least useful thing to do is invent a fake producer whose rows an Inteletravel import
-- would then have to reconcile against. So: constrain it so nonsense cannot be stored, name
-- the screens that owe it a producer, and leave it otherwise alone.
--
-- ── THE FEE, WHICH IS WHY THE ARITHMETIC CHECK IS SAFE ──────────────────────────────────
--
-- Gyasi, asked whether Inteletravel ever pays something other than gross x rate:
-- *"It differs because sometimes there is a processing fee."*
--
-- That is a DEDUCTION with a known sign and a known meaning, not an arbitrary override, so
-- it gets its own column rather than being absorbed into a number that then no longer
-- matches its own rate. Two consequences, and they are the whole design:
--
--   * `expected_commission_cents` can be pinned to `round(gross x pct / 100)` exactly,
--     which finally makes Data-Model §10.1's bare word "Computed" true. Without a separate
--     fee column a fee-reduced payment would have forced expected out of agreement with the
--     rate stored beside it, and the constraint would have had to go.
--
--   * Screen 3.7.6 gets sharper rather than noisier. A gap the fee explains is RECONCILED;
--     a gap it does not explain is the discrepancy that screen exists for. It renders
--     `expected - fee - received`, and zero means reconciled.
--
-- DELIBERATELY ABSENT: any CHECK tying `received_commission_cents` to
-- `expected_commission_cents - processing_fee_cents`. That gap must be STORABLE. The
-- prototype draws it as the product of the screen ("Expected $1,020 — Sandals applied 14%
-- not 15%"), and a constraint forbidding it would forbid recording the very thing the
-- advisor needs to chase.
--
-- ── ONE TRAP WORTH STATING ──────────────────────────────────────────────────────────────
--
-- The backfill UPDATE below is a NO-OP on `db reset`: migrations apply to an EMPTY database
-- and the seed runs afterwards. It is here for the deployed database, where rows exist. On
-- a fresh apply the seed must state `currency` itself, which is why the default is dropped
-- immediately afterwards — a row that forgets it fails loudly instead of silently becoming
-- USD. `constraints_commission.sql` asserts every row's currency matches its trip's.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columns
-- ─────────────────────────────────────────────────────────────────────────────

-- `commission` was the one money table in the schema with no currency column at all,
-- a quiet exception to CLAUDE.md rule 5. It inherited its trip's through the join in
-- agent_kpis(), which stopped being true the moment the forecast stopped joining.
ALTER TABLE public.commission
    ADD COLUMN currency             char(3) NOT NULL DEFAULT 'USD',
    ADD COLUMN processing_fee_cents bigint  NOT NULL DEFAULT 0;

UPDATE public.commission c
   SET currency = t.currency
  FROM public.trip t
 WHERE t.id = c.trip_id
   AND c.currency IS DISTINCT FROM t.currency;

-- Dropped so every future writer must state it. `processing_fee_cents` KEEPS its default:
-- zero fee is the ordinary case and a safe assumption, where a currency never is.
ALTER TABLE public.commission ALTER COLUMN currency DROP DEFAULT;

COMMENT ON COLUMN public.commission.currency IS
    'Denomination of every money column on this row. Matches its trip''s, which since '
    '20260930100000 is always USD. Added because this was the one money table with no '
    'currency column (CLAUDE.md rule 5), which only worked while agent_kpis() inferred it '
    'through a join it no longer makes.';

COMMENT ON COLUMN public.commission.processing_fee_cents IS
    'What the host agency deducts before depositing (Gyasi, 2026-09-28). Its own column so '
    'expected_commission_cents can stay exactly gross x rate: a fee folded into that figure '
    'would put it out of step with the rate stored beside it. Screen 3.7.6 renders '
    'expected - fee - received, and a NON-ZERO remainder is the discrepancy to chase.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Constraints
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.commission
    ADD CONSTRAINT commission_pct_range
        CHECK (commission_pct >= 0 AND commission_pct <= 100),

    ADD CONSTRAINT commission_amounts_nonneg
        CHECK (gross_booking_cents       >= 0
           AND expected_commission_cents >= 0
           AND received_commission_cents >= 0
           AND processing_fee_cents      >= 0),

    -- Data-Model §10.1 described expected_commission_cents with the single word "Computed"
    -- and nothing computed it. This is that word, enforced. Safe only because the fee has
    -- its own column; see the header.
    ADD CONSTRAINT commission_expected_matches_rate
        CHECK (expected_commission_cents
               = round(gross_booking_cents * commission_pct / 100.0)),

    -- A row that says the money arrived has to say when.
    ADD CONSTRAINT commission_received_has_date
        CHECK (status <> 'received' OR received_at IS NOT NULL),

    -- And a date means money actually moved, which is true of exactly two statuses. A
    -- `lost` or `expected` row carrying a received_at is a half-finished edit.
    ADD CONSTRAINT commission_date_means_paid
        CHECK (received_at IS NULL OR status IN ('received', 'disputed')),

    ADD CONSTRAINT commission_money_has_date
        CHECK (received_commission_cents = 0 OR received_at IS NOT NULL);

-- Inteletravel's own reference is the natural key for an import, and §3.7.5's CSV importer
-- will reconcile against it. Partial, because most rows never get one: a commission the
-- advisor entered by hand for a trip booked outside the platform (screen 3.7.4) has no
-- statement behind it yet.
CREATE UNIQUE INDEX commission_inteletravel_ref
    ON public.commission (agent_id, inteletravel_reference)
 WHERE inteletravel_reference IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Who owes this table a producer
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Comments rather than code, on purpose. The failure mode being guarded against is the next
-- reader concluding these columns are dead and either deleting them or writing a trigger to
-- fill them. They are unbuilt, not dead, and the screens that build them are drawn.

COMMENT ON TABLE public.commission IS
    'Reconciliation ledger, NOT the forecast. The forecast derives from '
    'trip.total_commission_cents — see agent_kpis(). A trip with no row here has not been '
    'invoiced to Inteletravel yet; that is a state, not a gap, and 16 of 22 revenue trips '
    'in the seed are deliberately in it. Written by §3.7.3 (edit), §3.7.4 (manual entry for '
    'trips booked outside the platform) and §3.7.5 (Inteletravel CSV import), none of which '
    'are built. Do NOT give this a trigger: §3.7.6 reconciles a stored claim against what '
    'was actually paid, and a value derived from components can never disagree with '
    'anything, which would delete that screen''s reason to exist.';

COMMENT ON COLUMN public.commission.expected_commission_cents IS
    'What we expect to be paid: exactly gross x rate, enforced. An independent CLAIM, not a '
    'derivation — §3.7.6 exists to surface where it disagrees with reality. Producer: '
    '§3.7.3 / §3.7.4 / §3.7.5.';
COMMENT ON COLUMN public.commission.gross_booking_cents IS
    'What the supplier transaction totalled. NOT the trip total: a trip can carry lines from '
    'several suppliers and lines that pay no commission at all. Producer: §3.7.3 / §3.7.4.';
COMMENT ON COLUMN public.commission.received_commission_cents IS
    'What actually arrived. Becomes a tax figure. Producer: §3.7.5''s CSV import, or §3.7.3 '
    'by hand. Reconciles against expected_commission_cents - processing_fee_cents.';
COMMENT ON COLUMN public.commission.status IS
    'expected -> invoiced -> received, or disputed / lost. Only Inteletravel can answer the '
    'last three, which is the core reason this table must not be trigger-maintained. '
    'Producer: §3.7.3 / §3.7.5.';
COMMENT ON COLUMN public.commission.payment_terms IS
    'OUT OF SPEC and known: Data-Model §10.1 documents at_booking / after_travel, the seed '
    'writes free text like ''60 days after travel'', and supplier.commission_payment_terms '
    'is free text too. §3.7.7''s cash-in calendar needs a parsed date offset, which free '
    'text cannot give, so this wants an enum plus a lag-days integer BEFORE §3.7.7 is built.';

-- Not dropped, and here is why, because "no producer and no reader" reads like dead weight:
-- the prototype renders all three. agent-commission.jsx:158 draws "38 rows detected" and
-- :188 draws "38 imported · 35 auto-matched · 3 need attention".
COMMENT ON TABLE public.commission_import IS
    'One row per Inteletravel CSV upload. Zero rows and no producer today; §3.7.5 is the '
    'screen that writes it, and the prototype already draws all three of its counters.';

-- ── ASSERTIONS ───────────────────────────────────────────────────────────────────

-- The constraints exist. Whether they BITE is asserted in supabase/tests/constraints_
-- commission.sql, with rows to bite on: everything here runs against an empty table,
-- because db reset applies migrations first and seeds afterwards.
DO $$
DECLARE
    expected text[] := ARRAY[
        'commission_pct_range', 'commission_amounts_nonneg',
        'commission_expected_matches_rate', 'commission_received_has_date',
        'commission_date_means_paid', 'commission_money_has_date'
    ];
    missing text;
BEGIN
    SELECT string_agg(e, ', ') INTO missing
      FROM unnest(expected) e
     WHERE NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.commission'::regclass AND conname = e);

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'commission is missing constraints: %', missing;
    END IF;
END $$;

-- The forecast still cannot see this table. Restated here because the whole point of
-- constraining the ledger is that it is a SEPARATE number, and the two migrations are
-- separately revertible.
DO $$
BEGIN
    IF pg_get_functiondef('public.agent_kpis()'::regprocedure) LIKE '%public.commission%' THEN
        RAISE EXCEPTION
            'agent_kpis() reads the commission ledger again — see 20260930140000';
    END IF;
END $$;

COMMIT;
