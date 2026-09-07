-- Client read access to the trip graph: the eight tables §2.2 renders.
--
-- `trip` got its policy in 20260904140753_trip_self_select.sql, whose comment already noted
-- that "2.2.1 and 2.2.2 need the same policy". Everything a trip HANGS OFF was left behind:
-- trip_component, itinerary, itinerary_day, itinerary_activity, proposal, conversation,
-- message and document all have RLS enabled and not one policy, which for `authenticated`
-- means every SELECT returns zero rows — silently, because RLS filters rather than errors.
-- Screens 2.2.3 through 2.2.7 would each render a friendly empty state over live data.
--
-- The pattern is trip_self_select's, including the trap it documents: RLS decides which
-- ROWS, grants decide which COLUMNS, and `REVOKE SELECT (col)` is a NO-OP against a
-- table-level grant. Supabase grants SELECT on the whole table to `authenticated` by
-- default, so the table grant has to go first and the columns are then granted back.
--
-- THE SECOND READER. An agent is also the Postgres role `authenticated`
-- (see 20260905171542_client_column_grant.sql:42-49), so every REVOKE below binds the agent
-- side too. Agents read this graph through the service role until the agent-side policies
-- land with §3.x; when they do, they will need a SECURITY DEFINER accessor or a view rather
-- than a widened grant here, because these column lists are the client's, not everyone's.
--
-- Three of the eight policies below are not the obvious predicate. Each is called out where
-- it appears; the short version is that `document` is the whole model's blob table,
-- `itinerary` has a draft state, and `message` has agent-only rows.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. trip_component
-- ═════════════════════════════════════════════════════════════════════════════

CREATE POLICY trip_component_self_select ON public.trip_component
    FOR SELECT TO authenticated
    USING (
        archived_at IS NULL
        AND trip_id IN (
            SELECT t.id FROM public.trip t
            WHERE t.client_id = (SELECT client_id FROM public.current_platform_user())
        )
    );

COMMENT ON POLICY trip_component_self_select ON public.trip_component IS
    'A client reads the live components of their own trips. Data-Model §20.1 soft-deletes '
    'with archived_at, and an archived component is one the agent removed — it should not '
    'reappear on an itinerary.';

REVOKE SELECT ON public.trip_component FROM authenticated, anon;

-- `payload` is withheld. It is the per-kind detail blob, and Data-Model §8.3 specifies the
-- hotel shape as carrying `rate_cents_per_night` — so granting it would hand back the
-- per-night cost immediately after cost_cents was withheld for revealing margin. If a screen
-- later needs a subset (seat number, room type), the right move is a server-side key
-- allowlist, not a grant.
--
-- `kind` IS granted, against its Internal marker in Data-Model §8.3. A client-facing
-- itinerary has to know whether a row is a flight or a hotel to pick an icon and an empty
-- state, and "this trip has a flight on it" discloses nothing the itinerary does not already
-- say out loud. Same reclassification reasoning as trip.cancellation_reason in §8.2.
GRANT SELECT (
    id, trip_id, kind, display_name, start_date, end_date, start_time, end_time,
    location, confirmation_number, currency, order_index, created_at, updated_at, archived_at
) ON public.trip_component TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. itinerary  — THE DRAFT GATE
--
-- `published_at` is not decoration. Data-Model §8.4 defines the itinerary as separately
-- stored precisely BECAUSE the agent edits it — "adding narrative, Gyasi's tips, time
-- changes" — so rows exist, and are being rewritten, for days before anyone means the
-- client to read them. An ownership-only policy would show the traveler a half-written
-- intro_note in Gyasi's voice and placeholder confirmation numbers.
--
-- This is a copy-exposure defect as much as an access one, which is why the gate is in the
-- policy and not left to a WHERE clause somebody can forget.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE POLICY itinerary_self_select ON public.itinerary
    FOR SELECT TO authenticated
    USING (
        published_at IS NOT NULL
        AND trip_id IN (
            SELECT t.id FROM public.trip t
            WHERE t.client_id = (SELECT client_id FROM public.current_platform_user())
        )
    );

COMMENT ON POLICY itinerary_self_select ON public.itinerary IS
    'A client reads their own PUBLISHED itinerary. An unpublished row is a draft the agent '
    'is still writing (Data-Model §8.4) and is invisible until published_at is set.';

REVOKE SELECT ON public.itinerary FROM authenticated, anon;

-- `version` is Internal — optimistic-concurrency bookkeeping, not content.
GRANT SELECT (
    id, trip_id, cover_image_url, intro_note, closing_note,
    published_at, last_published_at, created_at, updated_at
) ON public.itinerary TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. itinerary_day  — inherits the draft gate
--
-- The children must restate `published_at IS NOT NULL`, not merely join to `itinerary`.
-- The join does apply itinerary's own policy, so this is belt and braces — but a future
-- edit that widens the parent policy would otherwise silently publish every day and
-- activity with it, and days are where the confirmation numbers live.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE POLICY itinerary_day_self_select ON public.itinerary_day
    FOR SELECT TO authenticated
    USING (
        itinerary_id IN (
            SELECT i.id
            FROM public.itinerary i
            JOIN public.trip t ON t.id = i.trip_id
            WHERE t.client_id = (SELECT client_id FROM public.current_platform_user())
              AND i.published_at IS NOT NULL
        )
    );

COMMENT ON POLICY itinerary_day_self_select ON public.itinerary_day IS
    'Days of a published itinerary the caller owns. The published_at test is repeated from '
    'the parent deliberately — see the migration comment.';

REVOKE SELECT ON public.itinerary_day FROM authenticated, anon;

-- Every column here is the client's: weather_forecast is agent-authored trip context, which
-- is what Screens 2.2.1 and 2.2.5 render. There is no live weather API in BRD §9 and this
-- column is the reason none is needed at MVP.
GRANT SELECT (
    id, itinerary_id, day_number, date, label, summary, weather_forecast
) ON public.itinerary_day TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. itinerary_activity  — inherits the draft gate
-- ═════════════════════════════════════════════════════════════════════════════

CREATE POLICY itinerary_activity_self_select ON public.itinerary_activity
    FOR SELECT TO authenticated
    USING (
        itinerary_day_id IN (
            SELECT d.id
            FROM public.itinerary_day d
            JOIN public.itinerary i ON i.id = d.itinerary_id
            JOIN public.trip t ON t.id = i.trip_id
            WHERE t.client_id = (SELECT client_id FROM public.current_platform_user())
              AND i.published_at IS NOT NULL
        )
    );

COMMENT ON POLICY itinerary_activity_self_select ON public.itinerary_activity IS
    'Activities of a published itinerary the caller owns.';

REVOKE SELECT ON public.itinerary_activity FROM authenticated, anon;

-- gyasis_tip is granted and is the point of the table: Screen-Inventory §2.2.4 names
-- "Gyasi's Tip" callouts as a primary element, and Design-System §2.4 calls the itinerary
-- the voice-forward surface.
GRANT SELECT (
    id, itinerary_day_id, block, start_time, end_time, title, body,
    location, address, phone, confirmation_number, gyasis_tip,
    component_id, order_index, created_at, updated_at
) ON public.itinerary_activity TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. proposal  — the same shape of gate, on sent_at
-- ═════════════════════════════════════════════════════════════════════════════

CREATE POLICY proposal_self_select ON public.proposal
    FOR SELECT TO authenticated
    USING (
        sent_at IS NOT NULL
        AND trip_id IN (
            SELECT t.id FROM public.trip t
            WHERE t.client_id = (SELECT client_id FROM public.current_platform_user())
        )
    );

COMMENT ON POLICY proposal_self_select ON public.proposal IS
    'A client reads proposals actually sent to them. An unsent proposal is a draft, and a '
    'proposal the agent abandoned should never have been visible at all.';

REVOKE SELECT ON public.proposal FROM authenticated, anon;

-- `snapshot` is withheld and this is the important one: Data-Model §8.5 defines it as a
-- "full snapshot of trip + components + itinerary", which means it contains cost_cents and
-- commission for every component. Granting it would undo, in one jsonb column, every
-- withholding decision made above and in trip_self_select.
--
-- `viewed_at` is withheld too — when the client first opened the proposal is agent
-- intelligence, not the client's own business — and `pricing_valid_until` is Internal.
GRANT SELECT (
    id, trip_id, version_number, cover_title, cover_image_url,
    opening_note, closing_note, sent_at, accepted_at, created_at, updated_at
) ON public.proposal TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. conversation
-- ═════════════════════════════════════════════════════════════════════════════

CREATE POLICY conversation_self_select ON public.conversation
    FOR SELECT TO authenticated
    USING (
        archived_at IS NULL
        AND client_id = (SELECT client_id FROM public.current_platform_user())
    );

COMMENT ON POLICY conversation_self_select ON public.conversation IS
    'A client reads their own threads. conversation.client_id is direct, so no join is '
    'needed — and a trip-scoped thread is found through trip_id, which is nullable because '
    'general pre-trip threads exist (Data-Model §12.1).';

REVOKE SELECT ON public.conversation FROM authenticated, anon;

-- `client_unread_count` IS granted, against its Internal marker in Data-Model §12.1. It is
-- the CLIENT's own unread count and Screen 2.2.3 renders it ("Messages · 2 unread"); marking
-- it Internal alongside agent_unread_count reads like an oversight from when both were added
-- as a pair. `agent_unread_count` stays withheld — how far behind the agent is on their
-- inbox is not something a client should be able to poll.
GRANT SELECT (
    id, client_id, agent_id, trip_id, subject, last_message_at,
    last_message_preview, client_unread_count, archived_at, created_at, updated_at
) ON public.conversation TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. message  — THE INTERNAL-NOTE FILTER
--
-- Data-Model §12.2: `is_internal_note` means "only agent sees". The column is withheld from
-- the grant below, and WITHHOLDING IT DOES NOT HIDE THE ROWS — a grant controls which
-- columns come back, never which rows. Without the predicate here, a client reading their
-- own thread would receive the agent's private notes about them as ordinary messages, with
-- the one column that would have identified them stripped off.
--
-- A policy predicate may reference a column the caller has no privilege on: it is evaluated
-- as part of the query plan, not as a user-visible projection. That is what makes this work.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE POLICY message_self_select ON public.message
    FOR SELECT TO authenticated
    USING (
        is_internal_note = false
        AND archived_at IS NULL
        AND conversation_id IN (
            SELECT c.id FROM public.conversation c
            WHERE c.client_id = (SELECT client_id FROM public.current_platform_user())
        )
    );

COMMENT ON POLICY message_self_select ON public.message IS
    'Non-internal, non-deleted messages in the caller''s own conversations. The '
    'is_internal_note test is a ROW filter and cannot be replaced by withholding the column '
    '— see the migration comment.';

REVOKE SELECT ON public.message FROM authenticated, anon;

-- `read_by_other_at` is withheld: whether the agent has read your message is a read receipt
-- Screen-Inventory §2.2.7 lists but nothing has decided the semantics of, and shipping it
-- silently would make a promise about Gyasi's attention that nobody agreed to.
--
-- `sender_user_id` is granted, but note it resolves to nothing useful for a client:
-- platform_user has only a self-select policy, so the client can look up their own row and
-- no one else's. `sender_role` is the discriminator the UI must actually use to decide
-- which side of the thread a bubble sits on.
GRANT SELECT (
    id, conversation_id, sender_user_id, sender_role, body, created_at, archived_at
) ON public.message TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. document  — THE BLOB-TABLE PROBLEM
--
-- `document` is NOT "trip documents". Data-Model §13.1 defines it as the generic file table
-- for the whole model, verbatim: "trip documents, travel documents, message attachments,
-- commission CSV imports, receipts". Two of those are agency-internal, and both can carry a
-- trip_id:
--
--   * card_use_event.receipt_document_id FKs into it (initial.sql:509) and
--     card_use_event.trip_id is NOT NULL — so supplier-charge receipts are trip-scoped BY
--     CONSTRUCTION. A receipt shows what the agency actually paid a supplier.
--   * commission_import.document_id FKs into it, and a commission CSV is the agency's
--     earnings across every client.
--
-- So the obvious predicate — "my client_id, or any of my trips" — hands the traveler the
-- agency's economics through the side door, immediately after cost_cents,
-- total_commission_cents and proposal.snapshot were all withheld to prevent exactly that.
-- The allowlist below is the fix, and it is an allowlist rather than a denylist on purpose:
-- a document_kind added later must be considered before it becomes client-readable, not
-- leak by default.
--
-- `is_sensitive` is deliberately NOT part of the predicate. Data-Model §13.1 defines it as
-- triggering "tighter access logging" — it governs how a read is recorded, not whether it is
-- allowed. Filtering on it would hide the client's own passport scan, which is the single
-- most obviously-theirs file in the table and one Screen 2.2.6 exists to show.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE POLICY document_self_select ON public.document
    FOR SELECT TO authenticated
    USING (
        archived_at IS NULL
        AND kind IN (
            'passport', 'visa', 'insurance_cert',
            'supplier_confirmation', 'photo', 'pdf_itinerary'
        )
        AND (
            client_id = (SELECT client_id FROM public.current_platform_user())
            OR trip_id IN (
                SELECT t.id FROM public.trip t
                WHERE t.client_id = (SELECT client_id FROM public.current_platform_user())
            )
        )
    );

COMMENT ON POLICY document_self_select ON public.document IS
    'Client-facing document kinds belonging to the caller or one of their trips. The kind '
    'allowlist is load-bearing: `receipt` and `csv_import` rows are agency-internal and are '
    'trip-scoped by construction via card_use_event. `pdf_proposal` is excluded too — the '
    'proposal itself is readable through public.proposal, without its cost snapshot.';

REVOKE SELECT ON public.document FROM authenticated, anon;

-- storage_bucket, storage_key and checksum_sha256 stay server-only. A client never names an
-- object directly; files are reached through the audited signer Edge Function, which is the
-- single door. See the trip_document_storage migration for why that means there are no
-- `authenticated` policies on storage.objects at all.
--
-- `is_sensitive` is withheld as well: it is an internal logging flag, and surfacing it would
-- tell a client which of their files the system considers worth watching.
--
-- `kind`, `mime_type` and `size_bytes` are granted against their Internal markers — Screen
-- 2.2.6 groups by kind, picks a PDF/IMG badge from mime_type and prints the size. All three
-- describe the client's own file.
GRANT SELECT (
    id, owner_user_id, client_id, trip_id, kind, filename,
    mime_type, size_bytes, created_at, archived_at
) ON public.document TO authenticated;
