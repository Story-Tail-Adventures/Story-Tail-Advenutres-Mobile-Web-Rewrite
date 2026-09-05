-- Story-Tail Adventures — where the onboarding wizard resumes
--
-- Source of truth: docs/Data-Model.md §5.2, updated first.
--
-- Pattern G (Screen-Inventory §4.3) promises the wizard can "save progress and resume
-- later". `onboarding_completed_at` cannot keep that promise: it records WHETHER the wizard
-- is done, not where it got to. Fill in step 2, abandon at step 3, come back tomorrow, and
-- the gate sees a null completion and starts you at the welcome screen again.
--
-- Stored rather than derived from the data, because the two disagree in exactly the case
-- that matters. Inferring "past 2.1.10" from `client.phone IS NOT NULL` is right for
-- someone who filled it in and wrong for someone who pressed "Skip for now" — a derived
-- cursor would send them back to a screen they had already declined, every time.

BEGIN;

ALTER TABLE public.platform_user
    ADD COLUMN onboarding_step text;

COMMENT ON COLUMN public.platform_user.onboarding_step IS
    'Slug of the 2.1.x wizard step waiting to be filled in. Null before the wizard starts '
    'and after it finishes — onboarding_completed_at is what distinguishes those two. '
    'Data-Model §5.2.';

-- A text column rather than an enum, deliberately. The step list is UI sequencing, not a
-- domain fact: reordering the wizard or inserting a step should be a change to the app, not
-- a migration plus a type change plus a deployment ordering problem. The CHECK still keeps
-- a typo from becoming a wizard that resumes nowhere.
ALTER TABLE public.platform_user
    ADD CONSTRAINT platform_user_onboarding_step_known CHECK (
        onboarding_step IS NULL OR onboarding_step IN (
            'profile',      -- 2.1.10
            'preferences',  -- 2.1.11
            'companions',   -- 2.1.12
            'connect',      -- 2.1.13
            'complete'      -- 2.1.14, the summary; reaching it is not the same as finishing
        )
    );

-- Finishing must leave no cursor behind. Without this a completed wizard could keep a step
-- slug, and any later screen reading "where are they up to" would get an answer for
-- somebody who is not in the wizard at all.
ALTER TABLE public.platform_user
    ADD CONSTRAINT platform_user_onboarding_finished_has_no_step CHECK (
        onboarding_completed_at IS NULL OR onboarding_step IS NULL
    );

COMMIT;
