-- PaymentMilestone — the supplier payment schedule for a trip (Data-Model §9.5).
--
-- Screen 2.2.3 draws a payment timeline (deposit paid, second payment paid, final due on a
-- date) and until now nothing in the schema could produce it. It is also what finally gives
-- `trip.total_paid_cents` a producer; before this, that column had no writer anywhere.
--
-- TWO THINGS THIS IS NOT, both worth stating in the schema rather than only in the doc:
--
--   * NOT a bill from Story-Tail Adventures. BRD §10.5 prohibits client-facing billing —
--     the agency is not the merchant of record and charges the client nothing. These rows
--     describe what the SUPPLIER expects and when, so a balance date is never a surprise.
--     There is deliberately no "amount owed to us", no merchant reference, and no action a
--     client can take from them beyond authorizing a card in §2.4.
--   * NOT cardholder data. No PAN, no Stripe token, no FK to payment_card. It sits in the
--     payment domain because that is where a reader looks for "payments", but it is outside
--     PCI SAQ A scope entirely. The audit-pci skill should read this table and move on.
--
-- Money is bigint cents plus an explicit char(3) currency (CLAUDE.md rule 5). Ids are
-- UUIDv7 supplied by the caller (rule 6) — no default, same as every other table here.

CREATE TYPE public.payment_milestone_kind   AS ENUM ('deposit', 'interim', 'final');
CREATE TYPE public.payment_milestone_status AS ENUM ('scheduled', 'paid', 'waived', 'overdue');

CREATE TABLE public.payment_milestone (
    id           uuid PRIMARY KEY,
    trip_id      uuid NOT NULL REFERENCES public.trip(id),
    kind         public.payment_milestone_kind NOT NULL,
    label        text NOT NULL,
    amount_cents bigint NOT NULL,
    currency     char(3) NOT NULL DEFAULT 'USD',
    due_date     date,
    paid_at      timestamptz,
    paid_cents   bigint NOT NULL DEFAULT 0,
    status       public.payment_milestone_status NOT NULL DEFAULT 'scheduled',
    order_index  integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (amount_cents >= 0),
    CHECK (paid_cents >= 0),
    -- A paid milestone has to say when. Without this, "paid" and "paid_at IS NULL" coexist
    -- and the timeline has a milestone it cannot place.
    CHECK (status <> 'paid' OR paid_at IS NOT NULL)
);

CREATE INDEX payment_milestone_trip ON public.payment_milestone (trip_id, order_index);
CREATE INDEX payment_milestone_due  ON public.payment_milestone (status, due_date);

COMMENT ON TABLE public.payment_milestone IS
    'The supplier payment schedule for a trip (Data-Model §9.5). NOT an invoice — BRD §10.5 '
    'prohibits client-facing billing — and NOT in PCI scope: no PAN, no token, no card FK.';

COMMENT ON COLUMN public.payment_milestone.amount_cents IS
    'Client-visible by design, unlike trip_component.cost_cents. The distinction is real: '
    'cost_cents is what the agency paid and reveals margin; this is what the trip costs the '
    'client on a given date, which they are entitled to know.';

COMMENT ON COLUMN public.payment_milestone.status IS
    'Stored rather than derived from due_date. `overdue` must be suppressible — a supplier '
    'who verbally extended a deadline should not produce a red row on the client dashboard '
    '— and `waived` exists because suppliers do forgive milestones, which is not the same '
    'as paid.';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS. Explicit enable + revoke, because auto_expose_new_tables is on.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.payment_milestone ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payment_milestone FROM anon, authenticated;

CREATE POLICY payment_milestone_self_select ON public.payment_milestone
    FOR SELECT TO authenticated
    USING (
        trip_id IN (
            SELECT t.id FROM public.trip t
            WHERE t.client_id = (SELECT client_id FROM public.current_platform_user())
        )
    );

COMMENT ON POLICY payment_milestone_self_select ON public.payment_milestone IS
    'A client reads the payment schedule for their own trips. Every column is theirs to '
    'see, so the grant below is the whole table — the first table in this schema where '
    'that is true, and it is true because nothing here describes agency economics.';

GRANT SELECT (
    id, trip_id, kind, label, amount_cents, currency,
    due_date, paid_at, paid_cents, status, order_index, created_at, updated_at
) ON public.payment_milestone TO authenticated;

-- No client write path: the agent maintains the schedule from the supplier's terms.
