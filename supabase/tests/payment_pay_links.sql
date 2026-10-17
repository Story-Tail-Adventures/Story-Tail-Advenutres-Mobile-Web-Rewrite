-- §3.6 Supplier pay links (Data-Model §9.5, 2026-10-16): the link, the paid record, their
-- audit rows, Payment History, the {{payment.link}} merge field, and the card tables gone.
--
-- WHAT THIS FILE IS GUARDING.
--
--   1. A pay link is https only, at most 2,048 characters, with no user:password part and no
--      spaces. The CHECK is the last line of defense behind the Edge Function.
--   2. No card number gets in: a Luhn-valid 13 to 19 digit run is refused in pay_url,
--      paid_reference and paid_note. Test numbers are BUILT AT RUN TIME by a Luhn routine
--      written here (not the one under test), because the repo's guard refuses any
--      Luhn-valid literal, tests included.
--   3. The client reads pay_url and paid_reference, never paid_note, and writes nothing.
--   4. Every link change and paid mark writes exactly one audit row in the same call; a
--      no-op writes none. Another advisor, or a milestone of another trip, gets no row.
--   5. Mark paid takes a reference, a note and a date; going back to scheduled clears them.
--   6. Payment History lists those rows for the caller's trip only, newest first, and keeps
--      a deleted milestone's label.
--   7. The merge context fills payment_link; the card tables and card columns are gone.
--
-- Run against a freshly reset local database:
--     supabase db reset
--     psql "$(supabase status -o json | jq -r .DB_URL)" -v ON_ERROR_STOP=1 \
--          -f supabase/tests/payment_pay_links.sql

\set ON_ERROR_STOP on

BEGIN;

\set gyasi    '''0195a2c0-1a00-7000-8000-000000000010'''
\set jordan   '''0195a2c0-1a00-7000-8000-000000000011'''
\set agent    '''0195a2c0-1a00-7000-8000-000000000001'''
\set trip40   '''0195a2c0-1a00-7000-8000-000000000040'''
\set deposit  '''0195a2c0-1a00-7000-8000-0000000000a0'''
\set second   '''0195a2c0-1a00-7000-8000-0000000000a1'''
\set final    '''0195a2c0-1a00-7000-8000-0000000000a2'''
\set cabo_pm  '''0195a2c0-1a00-7000-8000-0000000000a3'''
\set b_agent  '''0d7f0000-0000-7000-8000-0000000003b1'''
\set scratch  '''0d7f0000-0000-7000-8000-0000000003e1'''

CREATE OR REPLACE FUNCTION pg_temp.assert(condition boolean, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition THEN RAISE NOTICE '  ok    %', description;
    ELSE RAISE EXCEPTION 'FAILED: %', description;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_denied(stmt text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected a privilege error', description;
EXCEPTION
    WHEN insufficient_privilege THEN RAISE NOTICE '  ok    %', description;
END;
$$;

-- A CHECK refusal, and only a CHECK refusal: any other error fails the test, so a typo in
-- the statement cannot pass for a working constraint.
CREATE OR REPLACE FUNCTION pg_temp.expect_check(stmt text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected a CHECK violation', description;
EXCEPTION
    WHEN check_violation THEN RAISE NOTICE '  ok    %', description;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_raise(stmt text, fragment text, description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'FAILED: % — statement succeeded, expected an error mentioning "%"', description, fragment;
EXCEPTION
    WHEN OTHERS THEN
        IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
        IF position(fragment IN SQLERRM) = 0 THEN
            RAISE EXCEPTION 'FAILED: % — expected "%", got % (%)', description, fragment, SQLSTATE, SQLERRM;
        END IF;
        RAISE NOTICE '  ok    %', description;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.become(account uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', account::text, 'role', 'authenticated', 'aal', 'aal2')::text, true);
END;
$$;

-- Appends the Luhn check digit to a digit string. Written out here, independent of
-- public.text_has_card_digits, so the guard is tested against a second implementation.
CREATE OR REPLACE FUNCTION pg_temp.luhn_complete(p_body text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
    total int := 0;
    i     int;
    d     int;
    dbl   boolean := true;   -- the digit left of the check digit is doubled
BEGIN
    FOR i IN REVERSE length(p_body)..1 LOOP
        d := substr(p_body, i, 1)::int;
        IF dbl THEN
            d := d * 2;
            IF d > 9 THEN d := d - 9; END IF;
        END IF;
        total := total + d;
        dbl := NOT dbl;
    END LOOP;
    RETURN p_body || ((10 - total % 10) % 10)::text;
END;
$$;

-- The same body with a WRONG check digit: card-shaped, but not a card number.
CREATE OR REPLACE FUNCTION pg_temp.luhn_wrong(p_body text)
RETURNS text LANGUAGE sql AS $$
    SELECT p_body || ((right(pg_temp.luhn_complete(p_body), 1)::int + 1) % 10)::text;
$$;

CREATE OR REPLACE FUNCTION pg_temp.audit_count(p_milestone uuid)
RETURNS bigint LANGUAGE sql AS $$
    SELECT count(*) FROM public.audit_event
     WHERE target_entity = 'payment_milestone' AND target_id = p_milestone;
$$;

CREATE OR REPLACE FUNCTION pg_temp.last_audit(p_milestone uuid)
RETURNS public.audit_event LANGUAGE sql AS $$
    SELECT * FROM public.audit_event
     WHERE target_entity = 'payment_milestone' AND target_id = p_milestone
     ORDER BY id DESC LIMIT 1;
$$;

-- The milestone as it is NOW. A volatile function takes a fresh snapshot, so an assertion
-- that calls a write and then reads the row in ONE statement sees the write; a plain
-- subquery in the same statement would still see the row as it was before.
CREATE OR REPLACE FUNCTION pg_temp.pm(p_id uuid)
RETURNS public.payment_milestone LANGUAGE sql AS $$
    SELECT * FROM public.payment_milestone WHERE id = p_id;
$$;

-- A second advisor with no trips, for the ownership checks.
INSERT INTO public.agent (id, display_name, email, status, time_zone)
VALUES (:b_agent::uuid, 'Robin Pay-Link-Tester', 'paylink.advisor@example.com', 'active', 'America/New_York');

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The link's shape (the CHECK)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.expect_check(
    $q$UPDATE public.payment_milestone SET pay_url = 'http://www.sandals.com/pay'
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a0'$q$,
    'an http:// link is refused: https only');
SELECT pg_temp.expect_check(
    $q$UPDATE public.payment_milestone SET pay_url = 'javascript:alert(1)'
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a0'$q$,
    'a javascript: link is refused');
SELECT pg_temp.expect_check(
    $q$UPDATE public.payment_milestone SET pay_url = 'https://jordan:secret@sandals.com/pay'
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a0'$q$,
    'a link with a user:password@ part is refused');
SELECT pg_temp.expect_check(
    $q$UPDATE public.payment_milestone SET pay_url = 'https://sandals.com/pay me'
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a0'$q$,
    'a link with a space is refused');
SELECT pg_temp.expect_check(
    $q$UPDATE public.payment_milestone SET pay_url = 'https:///pay'
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a0'$q$,
    'a link with no host is refused');
SELECT pg_temp.expect_check(
    format($q$UPDATE public.payment_milestone SET pay_url = %L
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a0'$q$,
        'https://sandals.com/' || repeat('a', 2049 - char_length('https://sandals.com/'))),
    'a 2,049-character link is refused');

UPDATE public.payment_milestone
   SET pay_url = 'https://sandals.com/' || repeat('a', 2048 - char_length('https://sandals.com/'))
 WHERE id = :deposit::uuid;
SELECT pg_temp.assert(
    (SELECT char_length(pay_url) FROM public.payment_milestone WHERE id = :deposit::uuid) = 2048,
    'a 2,048-character https link is accepted');
UPDATE public.payment_milestone SET pay_url = NULL WHERE id = :deposit::uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. No card numbers, in any of the three columns
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    right(pg_temp.luhn_complete('7992739871'), 1) = '3',
    'the test''s own Luhn routine gives the textbook check digit (79927398713)');

SELECT pg_temp.expect_check(
    format($q$UPDATE public.payment_milestone SET pay_url = %L
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a0'$q$,
        'https://pay.example.com/c/' || pg_temp.luhn_complete('411111111111111')),
    'a pay link carrying a Luhn-valid 16-digit run is refused');
SELECT pg_temp.expect_check(
    format($q$UPDATE public.payment_milestone SET paid_reference = %L
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a1'$q$,
        regexp_replace(pg_temp.luhn_complete('555555555555444'), '(\d{4})(?=\d)', '\1 ', 'g')),
    'a paid_reference holding a card number written in groups of four is refused');
SELECT pg_temp.expect_check(
    format($q$UPDATE public.payment_milestone SET paid_note = %L
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a1'$q$,
        'Paid with ' || regexp_replace(pg_temp.luhn_complete('378282246310'), '^(\d{4})(\d{6})(\d+)$', '\1-\2-\3')
        || ' per Jordan'),
    'a paid_note holding a 13-digit card number with dashes is refused');

-- Review findings 2026-10-16: the old guard took ONE greedy match from the first digit, so a
-- short number in front swallowed the card, and \y never fired between a letter and a digit.
SELECT pg_temp.assert(
    public.text_has_card_digits('Paid 12 ' || pg_temp.luhn_complete('411111111111111')),
    'a short number in front of a card does not hide it');
SELECT pg_temp.assert(
    public.text_has_card_digits('ref' || pg_temp.luhn_complete('411111111111111')),
    'letters touching the front of a card do not hide it');
SELECT pg_temp.assert(
    public.text_has_card_digits('x_' || pg_temp.luhn_complete('411111111111111') || 'x'),
    'an underscore and a trailing letter do not hide it');
SELECT pg_temp.assert(
    public.text_has_card_digits(regexp_replace(pg_temp.luhn_complete('411111111111111'), '(\d{4})(?=\d)', '\1  ', 'g')),
    'double spaces between groups do not hide it');
SELECT pg_temp.assert(
    public.text_has_card_digits(regexp_replace(pg_temp.luhn_complete('411111111111111'), '(\d{4})(?=\d)', '\1 - ', 'g')),
    'a spaced dash between groups does not hide it');
SELECT pg_temp.assert(
    NOT public.text_has_card_digits(translate(pg_temp.luhn_complete('411111111111111'), '0123456789', '０１２３４５６７８９')),
    'fullwidth digits are not read as a card, and do not raise on the ::int cast');
SELECT pg_temp.assert(
    NOT public.text_has_card_digits('Invoice 2026 10 16 booking 4471'),
    'unrelated short numbers in a sentence pass');
SELECT pg_temp.expect_check(
    format($q$UPDATE public.payment_milestone SET paid_note = %L
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a1'$q$,
        'Paid 12 ' || pg_temp.luhn_complete('411111111111111')),
    'the CHECK refuses a note with a short number in front of a card');

-- A named host only: the client is shown the host as the trust signal.
SELECT pg_temp.expect_check(
    $q$UPDATE public.payment_milestone SET pay_url = 'https://203.0.113.9/pay'
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a0'$q$,
    'a pay link to an IP address is refused');
SELECT pg_temp.expect_check(
    $q$UPDATE public.payment_milestone SET pay_url = 'https://[::1]/pay'
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a0'$q$,
    'a pay link to an IPv6 literal is refused');
SELECT pg_temp.expect_check(
    $q$UPDATE public.payment_milestone SET pay_url = 'https://good.com\@evil.com/'
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a0'$q$,
    'a backslash in the host is refused');
SELECT pg_temp.expect_check(
    $q$UPDATE public.payment_milestone SET pay_url = 'https://intranet/pay'
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a0'$q$,
    'a bare-word host is refused');

UPDATE public.payment_milestone SET paid_reference = pg_temp.luhn_wrong('411111111111111')
 WHERE id = :second::uuid;
SELECT pg_temp.assert(
    (SELECT char_length(paid_reference) FROM public.payment_milestone WHERE id = :second::uuid) = 16,
    'a 16-digit supplier reference that FAILS Luhn is accepted: Luhn is what tells them apart');
UPDATE public.payment_milestone SET paid_reference = 'SRB-220119-MID' WHERE id = :second::uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. paid_reference and paid_note shapes
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.expect_check(
    $q$UPDATE public.payment_milestone SET paid_reference = ''
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a1'$q$,
    'an empty paid_reference is refused (NULL means none)');
SELECT pg_temp.expect_check(
    $q$UPDATE public.payment_milestone SET paid_reference = ' SRB-1'
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a1'$q$,
    'an untrimmed paid_reference is refused');
SELECT pg_temp.expect_check(
    format($q$UPDATE public.payment_milestone SET paid_reference = %L
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a1'$q$, repeat('R', 101)),
    'a 101-character paid_reference is refused');
SELECT pg_temp.expect_check(
    format($q$UPDATE public.payment_milestone SET paid_note = %L
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a1'$q$, repeat('n', 1001)),
    'a 1,001-character paid_note is refused');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. What the client sees, and cannot do
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.payment_milestone SET paid_note = 'INTERNAL: supplier owes us a credit'
 WHERE id = :second::uuid;

SELECT pg_temp.become(:jordan::uuid);

SELECT pg_temp.assert(
    (SELECT pay_url FROM public.payment_milestone WHERE id = :final::uuid)
        = 'https://www.sandals.com/pay/SRB-220119',
    'the client reads the pay link on their own milestone');
SELECT pg_temp.assert(
    (SELECT paid_reference FROM public.payment_milestone WHERE id = :second::uuid) = 'SRB-220119-MID',
    'the client reads the confirmation number');
SELECT pg_temp.expect_denied(
    'SELECT paid_note FROM public.payment_milestone',
    'the client cannot read paid_note: it is Internal');
SELECT pg_temp.expect_denied(
    'SELECT * FROM public.payment_milestone',
    'SELECT * is refused too, so a careless client query cannot reach paid_note');
SELECT pg_temp.expect_denied(
    $q$UPDATE public.payment_milestone SET pay_url = 'https://evil.example.com/pay'
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a2'$q$,
    'the client cannot change a pay link');
SELECT pg_temp.expect_denied(
    $q$UPDATE public.payment_milestone SET status = 'paid', paid_at = now()
        WHERE id = '0195a2c0-1a00-7000-8000-0000000000a2'$q$,
    'the client cannot mark a milestone paid ("I''ve paid" is a message, never a write)');
SELECT pg_temp.expect_denied(
    $q$SELECT public.agent_set_milestone_pay_url(
        '0195a2c0-1a00-7000-8000-000000000040', '0195a2c0-1a00-7000-8000-000000000001',
        '0195a2c0-1a00-7000-8000-0000000000a2', 'https://evil.example.com/pay')$q$,
    'the client cannot call the pay-link write, which takes p_agent_id on trust');
SELECT pg_temp.expect_denied(
    $q$SELECT public.agent_set_milestone_paid(
        '0195a2c0-1a00-7000-8000-000000000040', '0195a2c0-1a00-7000-8000-000000000001',
        '0195a2c0-1a00-7000-8000-0000000000a2', 'paid')$q$,
    'the client cannot call the mark-paid write');
SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_payments(:trip40::uuid)) = 0
    AND (SELECT count(*) FROM public.agent_trip_payment_history(:trip40::uuid)) = 0,
    'the advisor reads (paid_note and history included) return nothing to a client');

RESET ROLE;
SET ROLE anon;
SELECT pg_temp.expect_denied(
    'SELECT pay_url FROM public.payment_milestone',
    'anon cannot read a pay link');
RESET ROLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. agent_set_milestone_pay_url: set, no-op, change, remove, each audited once
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('pt.before', pg_temp.audit_count(:deposit::uuid)::text, true);

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_milestone_pay_url(
        :trip40::uuid, :agent::uuid, :deposit::uuid, 'https://www.Sandals.com/pay/DEP')) = 'set',
    'a first link on a milestone is "set"');
SELECT pg_temp.assert(
    pg_temp.audit_count(:deposit::uuid) = current_setting('pt.before')::bigint + 1
    AND (pg_temp.last_audit(:deposit::uuid)).event_type = 'payment_milestone.link_set'
    AND (pg_temp.last_audit(:deposit::uuid)).metadata->>'host' = 'sandals.com'
    AND (pg_temp.last_audit(:deposit::uuid)).metadata->>'pay_url' = 'https://www.Sandals.com/pay/DEP'
    AND (pg_temp.last_audit(:deposit::uuid)).metadata->>'trip_id' = '0195a2c0-1a00-7000-8000-000000000040',
    '... with exactly one link_set row carrying the link, its host and the trip');
SELECT pg_temp.assert(
    (pg_temp.last_audit(:deposit::uuid)).actor_user_id
        = (SELECT id FROM public.platform_user WHERE agent_id = :agent::uuid)
    AND (pg_temp.last_audit(:deposit::uuid)).actor_role = 'agent',
    '... and the advisor as its actor, even when the caller names none');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_milestone_pay_url(
        :trip40::uuid, :agent::uuid, :deposit::uuid, 'https://www.Sandals.com/pay/DEP')) = 'noop'
    AND pg_temp.audit_count(:deposit::uuid) = current_setting('pt.before')::bigint + 1,
    'the same link again is a no-op and writes no audit row');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_milestone_pay_url(
        :trip40::uuid, :agent::uuid, :deposit::uuid, 'https://travefy.com/invoice/st-9001')) = 'changed',
    'a different link is "changed"');
SELECT pg_temp.assert(
    (pg_temp.last_audit(:deposit::uuid)).event_type = 'payment_milestone.link_changed'
    AND (pg_temp.last_audit(:deposit::uuid)).metadata->>'old_pay_url' = 'https://www.Sandals.com/pay/DEP'
    AND (pg_temp.last_audit(:deposit::uuid)).metadata->>'new_pay_url' = 'https://travefy.com/invoice/st-9001'
    AND (pg_temp.last_audit(:deposit::uuid)).metadata->>'old_host' = 'sandals.com'
    AND (pg_temp.last_audit(:deposit::uuid)).metadata->>'new_host' = 'travefy.com'
    AND pg_temp.audit_count(:deposit::uuid) = current_setting('pt.before')::bigint + 2,
    '... audited once with the old and new link and both hosts (a swapped link leaves a trace)');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_milestone_pay_url(
        :trip40::uuid, :agent::uuid, :deposit::uuid, NULL)) = 'removed'
    AND (pg_temp.pm(:deposit::uuid)).pay_url IS NULL,
    'NULL removes the link');
SELECT pg_temp.assert(
    (pg_temp.last_audit(:deposit::uuid)).event_type = 'payment_milestone.link_removed'
    AND (pg_temp.last_audit(:deposit::uuid)).metadata->>'old_pay_url' = 'https://travefy.com/invoice/st-9001'
    AND pg_temp.audit_count(:deposit::uuid) = current_setting('pt.before')::bigint + 3,
    '... audited once as link_removed with the old link');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_milestone_pay_url(
        :trip40::uuid, :agent::uuid, :deposit::uuid, '   ')) = 'noop'
    AND pg_temp.audit_count(:deposit::uuid) = current_setting('pt.before')::bigint + 3,
    'a blank link on a milestone with none is a no-op, not a second removal');

SELECT pg_temp.expect_check(
    format($q$SELECT public.agent_set_milestone_pay_url(
        '0195a2c0-1a00-7000-8000-000000000040', '0195a2c0-1a00-7000-8000-000000000001',
        '0195a2c0-1a00-7000-8000-0000000000a0', %L)$q$, 'http://www.sandals.com/pay'),
    'the write refuses an http link through the same CHECK');
SELECT pg_temp.expect_check(
    format($q$SELECT public.agent_set_milestone_pay_url(
        '0195a2c0-1a00-7000-8000-000000000040', '0195a2c0-1a00-7000-8000-000000000001',
        '0195a2c0-1a00-7000-8000-0000000000a0', %L)$q$,
        'https://pay.example.com/?card=' || pg_temp.luhn_complete('601111111111111')),
    'the write refuses a link carrying a card number');
SELECT pg_temp.assert(
    pg_temp.audit_count(:deposit::uuid) = current_setting('pt.before')::bigint + 3,
    '... and a refused write leaves no audit row behind');

-- Ownership. p_agent_id is trusted input, so the check is the function's.
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_set_milestone_pay_url(
        :trip40::uuid, :b_agent::uuid, :final::uuid, 'https://evil.example.com/pay')),
    'another advisor cannot set a link on this trip');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_set_milestone_pay_url(
        :trip40::uuid, :agent::uuid, :cabo_pm::uuid, 'https://evil.example.com/pay')),
    'a milestone of a DIFFERENT trip, named under this one, is refused');
SELECT pg_temp.assert(
    (SELECT pay_url FROM public.payment_milestone WHERE id = :final::uuid)
        = 'https://www.sandals.com/pay/SRB-220119'
    AND (SELECT pay_url IS NULL FROM public.payment_milestone WHERE id = :cabo_pm::uuid),
    '... and neither refused call changed a thing');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. agent_set_milestone_paid: reference, note, date; cleared on scheduled
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('pt.final_before', pg_temp.audit_count(:final::uuid)::text, true);
SELECT set_config('pt.paid_before',
    (SELECT total_paid_cents FROM public.trip WHERE id = :trip40::uuid)::text, true);

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_milestone_paid(
        :trip40::uuid, :agent::uuid, :final::uuid, 'paid', NULL,
        '  SRB-220119-FINAL ', ' Paid by Jordan on sandals.com. ', current_date - 2)) = 'changed',
    'Mark paid with a confirmation number, a note and a date');
SELECT pg_temp.assert(
    (SELECT status = 'paid' AND paid_cents = amount_cents
            AND paid_reference = 'SRB-220119-FINAL'
            AND paid_note = 'Paid by Jordan on sandals.com.'
            AND (paid_at AT TIME ZONE 'America/Chicago')::date = current_date - 2
       FROM public.payment_milestone WHERE id = :final::uuid),
    '... stores them trimmed, pays in full, and dates it on the advisor''s calendar day');
SELECT pg_temp.assert(
    (SELECT total_paid_cents FROM public.trip WHERE id = :trip40::uuid)
        = current_setting('pt.paid_before')::bigint + 784500,
    '... and moves the trip total through the trigger');
SELECT pg_temp.assert(
    pg_temp.audit_count(:final::uuid) = current_setting('pt.final_before')::bigint + 1
    AND (pg_temp.last_audit(:final::uuid)).event_type = 'payment_milestone.marked_paid'
    AND (pg_temp.last_audit(:final::uuid)).metadata->>'new_paid_cents' = '784500'
    AND (pg_temp.last_audit(:final::uuid)).metadata->>'old_paid_cents' = '0'
    AND (pg_temp.last_audit(:final::uuid)).metadata->>'paid_reference' = 'SRB-220119-FINAL'
    AND ((pg_temp.last_audit(:final::uuid)).metadata->>'has_note')::boolean,
    '... with exactly one marked_paid row: old and new cents, the reference, has_note');
SELECT pg_temp.assert(
    NOT ((pg_temp.last_audit(:final::uuid)).metadata ? 'paid_note')
    AND position('sandals.com.' IN (pg_temp.last_audit(:final::uuid)).metadata::text) = 0,
    'the note itself is never copied into audit metadata');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_milestone_paid(
        :trip40::uuid, :agent::uuid, :final::uuid, 'paid')) = 'noop'
    AND (SELECT paid_reference = 'SRB-220119-FINAL' AND paid_note IS NOT NULL
           FROM public.payment_milestone WHERE id = :final::uuid)
    AND pg_temp.audit_count(:final::uuid) = current_setting('pt.final_before')::bigint + 1,
    'the §3.4.15 toggle (no reference, no note) keeps both and writes nothing');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_milestone_paid(
        :trip40::uuid, :agent::uuid, :final::uuid, 'paid', NULL, '', NULL)) = 'changed'
    AND (pg_temp.pm(:final::uuid)).paid_reference IS NULL
    AND (pg_temp.pm(:final::uuid)).paid_note IS NOT NULL
    AND (pg_temp.last_audit(:final::uuid)).event_type = 'payment_milestone.marked_paid'
    AND NOT ((pg_temp.last_audit(:final::uuid)).metadata->>'has_reference')::boolean,
    'a blank reference clears it, and that is audited as a marked_paid change');

SELECT pg_temp.expect_raise(
    $q$SELECT public.agent_set_milestone_paid(
        '0195a2c0-1a00-7000-8000-000000000040', '0195a2c0-1a00-7000-8000-000000000001',
        '0195a2c0-1a00-7000-8000-0000000000a2', 'paid', NULL, NULL, NULL, current_date + 3)$q$,
    'future', 'a date paid in the future is refused');

SELECT pg_temp.expect_check(
    format($q$SELECT public.agent_set_milestone_paid(
        '0195a2c0-1a00-7000-8000-000000000040', '0195a2c0-1a00-7000-8000-000000000001',
        '0195a2c0-1a00-7000-8000-0000000000a2', 'paid', NULL, %L)$q$,
        pg_temp.luhn_complete('411111111111111')),
    'Mark paid refuses a card number typed as the confirmation number');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_milestone_paid(
        :trip40::uuid, :agent::uuid, :final::uuid, 'waived')) = 'changed'
    AND (pg_temp.last_audit(:final::uuid)).event_type = 'payment_milestone.marked_waived'
    AND (pg_temp.last_audit(:final::uuid)).metadata->>'prior_status' = 'paid'
    AND (pg_temp.pm(:final::uuid)).paid_cents = 0 AND (pg_temp.pm(:final::uuid)).paid_at IS NULL,
    'waiving is audited as marked_waived with the prior status, and holds no money');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_milestone_paid(
        :trip40::uuid, :agent::uuid, :final::uuid, 'scheduled')) = 'changed'
    AND (pg_temp.last_audit(:final::uuid)).event_type = 'payment_milestone.payment_cleared'
    AND (pg_temp.pm(:final::uuid)).paid_reference IS NULL AND (pg_temp.pm(:final::uuid)).paid_note IS NULL
    AND (pg_temp.pm(:final::uuid)).paid_cents = 0 AND (pg_temp.pm(:final::uuid)).paid_at IS NULL,
    'back to scheduled is payment_cleared, and clears the reference and the note');

SELECT pg_temp.assert(
    (SELECT outcome FROM public.agent_set_milestone_paid(
        :trip40::uuid, :agent::uuid, :final::uuid, 'overdue')) = 'changed'
    AND (pg_temp.last_audit(:final::uuid)).event_type = 'payment_milestone.status_changed',
    'scheduled to overdue moves no money and is audited as status_changed');

SELECT pg_temp.assert(
    pg_temp.audit_count(:final::uuid) = current_setting('pt.final_before')::bigint + 5,
    'five changes on the final balance, five audit rows: one per change, none per no-op');

SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.agent_set_milestone_paid(
        :trip40::uuid, :b_agent::uuid, :final::uuid, 'paid')),
    'another advisor cannot mark it paid');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. The advisor's reads: the schedule and Payment History
-- ─────────────────────────────────────────────────────────────────────────────

-- A milestone that gets a link and is then deleted keeps its history and its label.
INSERT INTO public.payment_milestone (id, trip_id, kind, label, amount_cents, currency, due_date, status, order_index)
VALUES (:scratch::uuid, :trip40::uuid, 'interim', 'Catamaran day', 18500, 'USD', current_date + 20, 'scheduled', 9);
SELECT public.agent_set_milestone_pay_url(:trip40::uuid, :agent::uuid, :scratch::uuid,
    'https://www.viator.com/pay/IR-4471');
DELETE FROM public.payment_milestone WHERE id = :scratch::uuid;

-- Read as the owner, before taking the advisor's role: an advisor reads trips through accessors.
SELECT client_id AS trip40_client FROM public.trip WHERE id = :trip40::uuid \gset

SELECT pg_temp.become(:gyasi::uuid);

SELECT pg_temp.assert(
    (SELECT pay_url = 'https://www.sandals.com/pay/SRB-220119' AND paid_note IS NULL
       FROM public.agent_trip_payments(:trip40::uuid) WHERE milestone_id = :final::uuid)
    AND (SELECT paid_reference = 'SRB-220119-MID' AND paid_note = 'INTERNAL: supplier owes us a credit'
       FROM public.agent_trip_payments(:trip40::uuid) WHERE milestone_id = :second::uuid),
    'agent_trip_payments returns pay_url, paid_reference and the internal paid_note');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_payment_history(:trip40::uuid)) = 9,
    'Payment History lists the trip''s nine link changes and paid marks (no created/updated rows)');
SELECT pg_temp.assert(
    (SELECT event_type FROM public.agent_trip_payment_history(:trip40::uuid) LIMIT 1)
        = 'payment_milestone.link_set'
    AND (SELECT milestone_label FROM public.agent_trip_payment_history(:trip40::uuid) LIMIT 1)
        = 'Catamaran day',
    '... newest first, and a deleted milestone keeps the label its event recorded');
SELECT pg_temp.assert(
    (SELECT bool_and(actor_name = 'Gyasi Story') FROM public.agent_trip_payment_history(:trip40::uuid)),
    '... each with the advisor''s name');
SELECT pg_temp.assert(
    (SELECT metadata->>'new_host' FROM public.agent_trip_payment_history(:trip40::uuid)
      WHERE event_type = 'payment_milestone.link_changed') = 'travefy.com'
    AND (SELECT milestone_label FROM public.agent_trip_payment_history(:trip40::uuid)
      WHERE event_type = 'payment_milestone.link_changed') = 'Deposit',
    '... with what changed, for a live milestone under its current label');

SELECT pg_temp.assert(
    (SELECT count(*) FROM public.agent_trip_payment_history('0195a2c0-1a00-7000-8000-000000000047'::uuid)) = 0,
    'another trip''s history does not include this trip''s rows');

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. {{payment.link}} in the merge context and the starter
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    (SELECT payment_link FROM public.agent_message_merge_context(
        :'trip40_client'::uuid, :trip40::uuid, :final::uuid))
        = 'https://www.sandals.com/pay/SRB-220119',
    'the merge context fills payment_link from the milestone''s pay_url');
SELECT pg_temp.assert(
    (SELECT payment_link IS NULL AND payment_label = 'Second payment'
       FROM public.agent_message_merge_context(
        :'trip40_client'::uuid, :trip40::uuid, :second::uuid)),
    '... and leaves it NULL for a milestone with no link, so the picker flags it');

RESET ROLE;

SELECT pg_temp.assert(
    'payment.link' = ANY (public.message_template_fields())
    AND cardinality(public.message_template_unknown_tokens('Pay here: {{ payment.link }}')) = 0,
    '{{payment.link}} is a known merge field');
SELECT pg_temp.assert(
    (SELECT body_markdown LIKE '%You can pay it on their own secure site here: {{payment.link}}%'
       FROM public.message_template
      WHERE agent_id = :agent::uuid AND category = 'payment_reminder' AND 'Starter' = ANY (tags)),
    'the starter payment reminder carries the link line');

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. The card is gone
-- ─────────────────────────────────────────────────────────────────────────────

SELECT pg_temp.assert(
    to_regclass('public.payment_card') IS NULL AND to_regclass('public.card_authorization') IS NULL
    AND to_regclass('public.authorization_request') IS NULL AND to_regclass('public.card_use_event') IS NULL,
    'the four card tables are dropped');
SELECT pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM pg_type WHERE typname IN ('card_status', 'card_auth_status', 'auth_request_status')),
    'the three card enums are dropped');
SELECT pg_temp.assert(
    pg_get_function_result('public.agent_trip_overview(uuid)'::regprocedure) !~ 'card_',
    'agent_trip_overview returns no card column');

ROLLBACK;
