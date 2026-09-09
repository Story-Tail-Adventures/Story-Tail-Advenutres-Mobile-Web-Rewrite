-- MessageAttachment — the one Phase 1 entity in the Data Model with no table.
--
-- Data-Model §12.3 has specified it since the initial schema and the initial migration
-- simply never created it. Screen Inventory §2.2.7 lists "attachment thumbnails" as a
-- primary element of the trip thread, so §2.2 is where the omission finally bites.
--
-- It is a join row and nothing more: the file itself is a `document`, so anything about
-- storage, size, mime type or sensitivity is answered there and must not be duplicated
-- here. That is also why the read policy leans on `document`'s own policy rather than
-- re-deriving ownership — see the trip_read_policies migration.

CREATE TABLE public.message_attachment (
    id          uuid PRIMARY KEY,
    message_id  uuid NOT NULL REFERENCES public.message(id),
    document_id uuid NOT NULL REFERENCES public.document(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (message_id, document_id)
);

CREATE INDEX message_attachment_message ON public.message_attachment (message_id);
CREATE INDEX message_attachment_document ON public.message_attachment (document_id);

COMMENT ON TABLE public.message_attachment IS
    'Join row between a message and an already-stored document (Data-Model §12.3). Carries '
    'no file metadata of its own — `document` is the single source for that.';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS, enabled EXPLICITLY.
--
-- This is the trap that makes a new public table different from an existing one:
-- `auto_expose_new_tables` is true in config.toml, so a freshly created table in the
-- `public` schema arrives already granted to `anon` and `authenticated` and already
-- exposed over the REST API. Without the next two statements this table would be world
-- readable the moment the migration ran — the exact opposite of every other table here,
-- which the initial migration locked down in bulk.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.message_attachment ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.message_attachment FROM anon, authenticated;

-- A client reads an attachment exactly when they can read the message it hangs off, and
-- this policy delegates that entirely to `message`'s own policy rather than restating it.
--
-- The first version DID restate it — joining message to conversation and repeating the
-- `is_internal_note = false` test — and it failed with "permission denied for table
-- message". The reason is worth knowing, because it constrains every policy of this shape:
--
--   A policy predicate on its OWN table is evaluated with elevated rights, so it may test a
--   column the caller cannot select. A SUBQUERY against ANOTHER table is not: it is planned
--   as the invoking user, so it needs column privileges like any other query. And
--   `is_internal_note` is deliberately outside the client grant, so naming it here made the
--   policy unusable by the very role it was written for.
--
-- Leaning on message's RLS is also correct rather than merely expedient: the subquery is
-- planned as the caller, so message_self_select filters it — internal notes and soft-deleted
-- rows are gone before this policy sees an id. The tradeoff is real and accepted: widening
-- message_self_select later would widen this too. That is the intended coupling, since an
-- attachment is not a thing you should be able to read independently of its message.
CREATE POLICY message_attachment_self_select ON public.message_attachment
    FOR SELECT TO authenticated
    USING (message_id IN (SELECT m.id FROM public.message m));

COMMENT ON POLICY message_attachment_self_select ON public.message_attachment IS
    'Attachments on messages the caller can read. Ownership and the internal-note filter '
    'come from message_self_select, which applies to the subquery because it is planned as '
    'the caller — see the migration comment for why restating it here cannot work.';

GRANT SELECT (id, message_id, document_id, created_at)
    ON public.message_attachment TO authenticated;

-- No INSERT policy. A client attaches a file by calling the audited Edge Function that
-- creates the document, the message and this row together (CLAUDE.md rule 3); the function
-- runs as service_role and bypasses RLS.
