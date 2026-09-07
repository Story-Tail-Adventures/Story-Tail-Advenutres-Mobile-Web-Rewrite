-- Testimonial — a client's reflection on a completed trip (Data-Model §8.7).
--
-- Screen 2.2.11 asks "What did you carry home from this trip?" (Design-System §2.4). The
-- answer is the client's own words, which makes this table unusual here: it is the first
-- one whose rows a CLIENT authors and an AGENT approves, rather than the other way round.
--
-- The status column is the whole point. A client's words are a marketing claim, and
-- marketing claims do not ship unreviewed — the same discipline PUBLIC_CLAIMS_MODE=strict
-- already enforces on the hand-authored testimonials in web/content/public/proof.ts. So:
-- draft → submitted → approved → published, with `declined` as the terminal branch, and
-- two CHECKs below that make the illegal states unrepresentable rather than merely
-- discouraged.
--
-- Wiring approved testimonials into the public surface is NOT part of this migration or
-- this PR. There is deliberately no `anon` policy: until someone decides how published
-- testimonials reach the marketing pages, nothing can read them unauthenticated.

CREATE TYPE public.testimonial_status AS ENUM
    ('draft', 'submitted', 'approved', 'published', 'declined');

CREATE TABLE public.testimonial (
    id                  uuid PRIMARY KEY,
    client_id           uuid NOT NULL REFERENCES public.client(id),
    trip_id             uuid REFERENCES public.trip(id),
    agent_id            uuid NOT NULL REFERENCES public.agent(id),
    body                text NOT NULL,
    attribution         text,
    rating              smallint,
    status              public.testimonial_status NOT NULL DEFAULT 'draft',
    submitted_at        timestamptz,
    approved_at         timestamptz,
    approved_by_user_id uuid REFERENCES public.platform_user(id),
    published_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
    -- Nothing is published that was not first approved. This is the constraint the whole
    -- table exists to enforce; a bug in an Edge Function should hit a CHECK, not a client.
    CHECK (published_at IS NULL OR approved_at IS NOT NULL),
    CHECK (status <> 'published' OR published_at IS NOT NULL),
    CHECK (status NOT IN ('approved', 'published') OR approved_at IS NOT NULL),
    CHECK (approved_at IS NULL OR approved_by_user_id IS NOT NULL)
);

-- One per client per trip. A second reflection on the same trip is an edit, not a new row.
CREATE UNIQUE INDEX testimonial_client_trip
    ON public.testimonial (client_id, trip_id) WHERE trip_id IS NOT NULL;

-- The agent's approval queue.
CREATE INDEX testimonial_agent_status
    ON public.testimonial (agent_id, status, created_at DESC);

-- The public surface, when it eventually exists.
CREATE INDEX testimonial_published
    ON public.testimonial (published_at DESC) WHERE status = 'published';

COMMENT ON TABLE public.testimonial IS
    'A client''s reflection on a trip (Data-Model §8.7). Nothing reaches a public surface '
    'without approved_at — enforced by CHECK, not convention.';

COMMENT ON COLUMN public.testimonial.rating IS
    'Nullable on purpose. The prompt is "What did you carry home from this trip?", not a '
    'star widget — the field is a reflection first and a testimonial second.';

COMMENT ON COLUMN public.testimonial.body IS
    'PII: the client''s own words. Access is audit-logged like any other PII column.';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS. Explicit enable + revoke, because auto_expose_new_tables is on.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.testimonial ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.testimonial FROM anon, authenticated;

CREATE POLICY testimonial_self_select ON public.testimonial
    FOR SELECT TO authenticated
    USING (client_id = (SELECT client_id FROM public.current_platform_user()));

COMMENT ON POLICY testimonial_self_select ON public.testimonial IS
    'A client reads their own testimonials in every state, including drafts — it is their '
    'writing. approved_by_user_id stays outside the column grant: which agent approved it '
    'is agency workflow, not the client''s business.';

GRANT SELECT (
    id, client_id, trip_id, agent_id, body, attribution, rating, status,
    submitted_at, approved_at, published_at, created_at, updated_at
) ON public.testimonial TO authenticated;

-- NO client INSERT or UPDATE policy, deliberately. A direct RLS-backed insert would write a
-- row with no audit_event, and CLAUDE.md rule 3 requires every mutation to be audited.
-- Writing and submitting a reflection goes through an Edge Function running as service_role,
-- which is also the only place the draft→submitted transition can be validated. Approval is
-- an agent action and lands with §3.x.
