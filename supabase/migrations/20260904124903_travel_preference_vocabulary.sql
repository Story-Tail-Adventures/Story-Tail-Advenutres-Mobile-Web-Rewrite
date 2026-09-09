-- Screen 2.1.11 Travel Preferences — the columns and constraints the screen needs.
--
-- See docs/Data-Model.md §6.2 (updated first, per CLAUDE.md) and
-- docs/Screen-Inventory.md §2.1.11.
--
-- Three things, all of them about one question: what is a slug and what is a sentence?
--
-- `travel_styles`, `dietary_restrictions` and `accessibility_needs` are what agent-side
-- filtering (§3.9.x) will group on. The Data Model has always listed their vocabularies;
-- nothing enforced them, so "Honeymoon" and "romantic" and "  romantic" were all equally
-- storable and a GROUP BY would have shown three answers where clients gave one.
--
-- But five chips cannot say "severe tree nut allergy" or "CPAP, needs an outlet by the
-- bed", and those are the sentences an advisor actually relays to a resort. Appending them
-- into the same arrays was the cheaper option and the wrong one: it makes every future
-- consumer defend against prose arriving where a slug is expected. They get their own
-- columns instead.

-- ── Free text, kept out of the slug arrays ────────────────────────────────────
ALTER TABLE public.travel_preference
    ADD COLUMN dietary_notes       text,
    ADD COLUMN accessibility_notes text;

COMMENT ON COLUMN public.travel_preference.dietary_notes IS
    'Sensitive PII (health-adjacent). The allergy or condition the chip list cannot say. '
    'Deliberately NOT a member of dietary_restrictions: that array is a closed vocabulary '
    'agent-side filtering groups on. Data-Model §6.2.';

COMMENT ON COLUMN public.travel_preference.accessibility_notes IS
    'Sensitive PII. The arrangement the chip list cannot say — see dietary_notes for why '
    'it is a column and not another array member. Data-Model §6.2.';

-- ── Closed vocabularies ───────────────────────────────────────────────────────
--
-- `<@` is "contained by", so an empty array passes every one of these: leaving a question
-- blank must stay legal on a screen whose whole premise is that answering is optional.
--
-- NOT VALID is deliberately NOT used. These tables hold seed data and nothing else yet, so
-- there is no legacy to grandfather, and a constraint that has never been checked is a
-- constraint nobody can rely on.
ALTER TABLE public.travel_preference
    ADD CONSTRAINT travel_preference_styles_known CHECK (
        travel_styles <@ ARRAY['resort', 'cruise', 'adventure', 'family', 'romantic', 'group']::text[]
    ),
    ADD CONSTRAINT travel_preference_dietary_known CHECK (
        dietary_restrictions <@ ARRAY['none', 'vegetarian', 'pescatarian', 'gluten_free', 'halal']::text[]
    ),
    ADD CONSTRAINT travel_preference_accessibility_known CHECK (
        accessibility_needs <@ ARRAY['none', 'mobility', 'quiet_room', 'service_animal']::text[]
    ),
    ADD CONSTRAINT travel_preference_budget_band_known CHECK (
        budget_band IS NULL OR budget_band IN ('budget', 'mid', 'premium', 'luxury')
    );

-- `none` says "asked and answered: nothing to worry about", which is the opposite of an
-- empty array's "never answered". It cannot coexist with a real restriction — a row
-- claiming both no restrictions and a gluten-free one tells a resort kitchen two things.
--
-- AND IT CANNOT COEXIST WITH A NOTE, which is the same contradiction wearing different
-- clothes and the more likely one: the closed vocabulary has no slug for an allergy, so a
-- real allergy is EXPECTED to arrive in dietary_notes. "No restrictions" beside "severe
-- shellfish allergy" is not a hypothetical shape, it is the shape a well-meaning traveler
-- produces by ticking the reassuring chip and then typing the truth underneath.
ALTER TABLE public.travel_preference
    ADD CONSTRAINT travel_preference_dietary_none_alone CHECK (
        NOT ('none' = ANY (dietary_restrictions))
        OR (array_length(dietary_restrictions, 1) = 1 AND dietary_notes IS NULL)
    ),
    ADD CONSTRAINT travel_preference_accessibility_none_alone CHECK (
        NOT ('none' = ANY (accessibility_needs))
        OR (array_length(accessibility_needs, 1) = 1 AND accessibility_notes IS NULL)
    );

COMMENT ON CONSTRAINT travel_preference_dietary_none_alone ON public.travel_preference IS
    'The sentinel ''none'' means "asked and answered", so it is mutually exclusive with a '
    'real restriction AND with dietary_notes — an allergy has no slug and lands in the '
    'note. An empty array still means the question was never asked.';

COMMENT ON CONSTRAINT travel_preference_accessibility_none_alone ON public.travel_preference IS
    'The mirror of travel_preference_dietary_none_alone, for the same reason.';
