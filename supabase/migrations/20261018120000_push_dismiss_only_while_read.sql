-- §3.10 Stage 3b PR 2: a dismiss is only sent while its thread is still read.
--
-- Found on the Android emulator, 2026-10-15. Reading a thread marks its sent notification as
-- owing a dismiss (20261017120000). If the client writes again before the next dispatcher pass,
-- that pass sent the NEW notification and then the OLD row's dismiss, and both name the same tag
-- (the conversation id): the phone posted the new message and cancelled it at once. The web never
-- showed it because browsers get no dismisses.
--
-- A dismiss means "the advisor has read this thread". Once a newer client message makes it
-- unread again, that is no longer true, so the owed dismiss is dropped, not sent. push-dispatch
-- also sends dismissals before new messages now, so within one pass a dismiss can never follow
-- a message for the same thread.
--
-- Across passes FCM does not promise order, so each dismiss now also carries `read_up_to`, the
-- created_at of the newest message its notification was about. The phone ignores a dismiss older
-- than the notification it is showing. (The return type changes, hence DROP and CREATE.)
--
-- Dropping a stale dismiss is deliberate even when the new message is HELD for rest hours: the
-- earlier, already-read notification then stays on the phone until 07:00, when the summary or
-- the thread's own notification replaces it (same tag). Waking the phone at night to clear it
-- would be the larger harm.

BEGIN;

DROP FUNCTION public.push_claim_dismissals(integer);

CREATE FUNCTION public.push_claim_dismissals(p_limit integer DEFAULT 50)
RETURNS TABLE (agent_id uuid, conversation_id uuid, read_up_to timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Stale: the thread is unread again, so there is nothing to dismiss.
    UPDATE public.push_outbox o SET needs_dismiss = false
      FROM public.conversation cv
     WHERE o.conversation_id = cv.id AND o.needs_dismiss AND cv.agent_unread_count > 0;

    RETURN QUERY
    WITH claimed AS (
        UPDATE public.push_outbox o SET needs_dismiss = false
         WHERE o.id IN (
            SELECT x.id FROM public.push_outbox x
              JOIN public.conversation cv ON cv.id = x.conversation_id
             WHERE x.needs_dismiss AND x.state = 'sent' AND cv.agent_unread_count = 0
             ORDER BY x.sent_at
             LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
             FOR UPDATE OF x SKIP LOCKED
         )
        RETURNING o.agent_id, o.conversation_id, o.latest_message_id
    )
    SELECT c.agent_id, c.conversation_id, max(m.created_at)
      FROM claimed c
      JOIN public.message m ON m.id = c.latest_message_id
     GROUP BY c.agent_id, c.conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.push_claim_dismissals(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_claim_dismissals(integer) TO service_role;

COMMIT;
