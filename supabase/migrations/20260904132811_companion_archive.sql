-- `companion` catches up with the soft-delete rule that always applied to it.
--
-- See docs/Data-Model.md §6.3 and §20.1, and docs/Screen-Inventory.md §2.1.12.
--
-- §20.1 has listed `companion` in the `archived_at` set since the Data Model was written;
-- the initial migration simply did not give it the column. Screen 2.1.12's "Remove" then
-- had nothing to write and would have had to delete the row, which is wrong twice over:
--
--   * `travel_document.companion_id` references this table with no ON DELETE clause
--     (initial.sql line 655), so it defaults to NO ACTION. Nothing writes that column yet,
--     so a hard delete works today and starts raising a foreign-key violation the day the
--     passport-scan flow links a document to a companion — an opaque 500 on an action whose
--     whole contract is that it always succeeds.
--   * A traveler tidying their household list has not asked for the trips that mention
--     those people to lose their subject.

ALTER TABLE public.companion ADD COLUMN archived_at timestamptz;

COMMENT ON COLUMN public.companion.archived_at IS
    'Soft delete per Data-Model §20.1. Set by Screen 2.1.12''s Remove. Queries default to '
    'archived_at IS NULL.';

CREATE INDEX companion_client_active ON public.companion (client_id)
    WHERE archived_at IS NULL;

-- The client surface reads its own companions and has to be able to filter on this;
-- Postgres checks column privilege on ANY reference, so `WHERE archived_at IS NULL` is
-- denied without it. Added to the grant list 20260903190707 established — which
-- deliberately still excludes passport_number_encrypted.
GRANT SELECT (archived_at) ON public.companion TO authenticated;

-- ── The household cap ─────────────────────────────────────────────────────────
--
-- Twelve unarchived companions per client. Screen 2.1.12 checks this before inserting and
-- says so in plain English, but a check and an insert are two round trips: a double-submit
-- or two open tabs can both read eleven and both write. Enforced here so the documented
-- limit is true rather than usually true.
--
-- A trigger rather than a CHECK, because the rule is about the other rows in the table and
-- a CHECK may only see its own.
CREATE OR REPLACE FUNCTION public.enforce_companion_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    active_count integer;
BEGIN
    -- Un-archiving counts as arriving, so this runs on the way in and on the way back.
    IF NEW.archived_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT count(*) INTO active_count
      FROM public.companion c
     WHERE c.client_id = NEW.client_id
       AND c.archived_at IS NULL
       AND c.id <> NEW.id;

    IF active_count >= 12 THEN
        RAISE EXCEPTION 'A client may have at most 12 companions'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_companion_cap() IS
    'At most 12 unarchived companions per client (Data-Model §6.3). A trigger rather than a '
    'CHECK because the rule is about sibling rows.';

CREATE TRIGGER companion_cap
    BEFORE INSERT OR UPDATE ON public.companion
    FOR EACH ROW EXECUTE FUNCTION public.enforce_companion_cap();
