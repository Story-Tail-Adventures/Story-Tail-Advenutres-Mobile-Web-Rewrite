package com.storytail.adventures.android.push

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import com.storytail.adventures.android.MainActivity
import com.storytail.adventures.R
import com.storytail.adventures.api.AgentInboxQuery
import com.storytail.adventures.api.AgentInboxRead
import com.storytail.adventures.api.AgentThreadRead
import com.storytail.adventures.api.SupabaseClientProvider
import com.storytail.adventures.domain.agent.AGENT_PUSH_SUMMARY_TAG
import com.storytail.adventures.domain.agent.AgentMessagesCopy
import com.storytail.adventures.domain.agent.AgentPushData
import com.storytail.adventures.domain.agent.dismissApplies
import com.storytail.adventures.domain.agent.notificationBody
import com.storytail.adventures.domain.agent.notificationLockedTitle
import com.storytail.adventures.domain.agent.notificationSummaryBody
import com.storytail.adventures.domain.agent.notificationSummaryTitle
import com.storytail.adventures.domain.agent.notificationTitle
import com.storytail.adventures.domain.agent.quoteRequestBody
import com.storytail.adventures.domain.agent.quoteRequestTitle
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Draws §3.10.7's notifications on the phone (M3105 to M3107).
 *
 * FETCH ON RECEIPT: the push says only which thread and how many; the words come from our own API
 * over the advisor's session, so Google never carries a client's name or message
 * (docs/Push-Notifications-Security-Review.md §3.1). If that read fails, the notification still
 * comes, as "New message": never nothing.
 *
 * One notification per thread: the tag is the conversation id and the id is constant, so the next
 * message replaces the last. The 7am summary has its own tag.
 */
class AgentNotifier(private val context: Context) {
    private val manager = NotificationManagerCompat.from(context)

    suspend fun handle(data: AgentPushData) {
        when (data) {
            is AgentPushData.Message -> showMessage(data)
            is AgentPushData.Summary -> showSummary(data)
            is AgentPushData.Dismiss -> dismiss(data.tag, data.readUpTo)
            is AgentPushData.QuoteRequest -> showQuoteRequest(data)
        }
    }

    /**
     * §3.12.3: a client asked for a trip. The push carries the trip id only; the name, place and
     * dates come from our own API over the advisor's session, as a message's words do. The locked
     * screen shows the name only; a tap opens the inquiry trip.
     */
    private suspend fun showQuoteRequest(data: AgentPushData.QuoteRequest) {
        val trip = withTimeoutOrNull(READ_TIMEOUT_MS) {
            if (SupabaseClientProvider.agentPushRepository().signedIn()) {
                SupabaseClientProvider.agentRepository().tripRequestSummary(data.tripId)
            } else {
                null
            }
        }
        // Which step failed, never what it read.
        if (trip == null) Log.w(TAG, "trip read for a trip-request notification failed or timed out")
        val title = trip?.let { quoteRequestTitle(it.clientName) } ?: AgentMessagesCopy.NOTIFY_NEW_TRIP_REQUEST
        val body = trip?.let { quoteRequestBody(it.destinations.joinToString(", "), it.startDate, it.endDate) }

        val locked = tripBase(data.tripId).setContentTitle(title).build()
        val builder = tripBase(data.tripId)
            .setContentTitle(title)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(locked)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
        if (body != null) builder.setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body))
        post(data.tag, builder.build())
    }

    private fun tripBase(tripId: String): NotificationCompat.Builder =
        NotificationCompat.Builder(context, PushSetup.CHANNEL_TRIP_REQUESTS)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(tripIntent(tripId))

    /** Opens the inquiry trip through MainActivity. */
    private fun tripIntent(tripId: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .setData(threadUri("trip", tripId))
            .putExtra(EXTRA_TRIP, tripId)
        return PendingIntent.getActivity(
            context,
            ("trip:$tripId").hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private suspend fun showMessage(data: AgentPushData.Message) {
        // Bounded: a slow read ends in the plain "New message", never in no notification.
        val read = withTimeoutOrNull(READ_TIMEOUT_MS) {
            if (SupabaseClientProvider.agentPushRepository().signedIn()) {
                SupabaseClientProvider.agentMessagesRepository().thread(data.conversationId)
            } else {
                null
            }
        }
        val ok = read as? AgentThreadRead.Ok
        // Which step failed, never what it read: no client data in the log.
        if (ok == null) Log.w(TAG, "thread read for a notification failed: ${read?.let { it::class.simpleName } ?: "timed out or signed out"}")
        val clientName = ok?.header?.clientName
        val latest = ok?.messages?.lastOrNull { !it.fromAgent && !it.internalNote }

        val title = clientName?.let { notificationTitle(it, ok.header.tripTitle) } ?: AgentMessagesCopy.NOTIFY_NEW_MESSAGE
        val body = latest?.let { notificationBody(it.body) }
        // The read's own newest client message is a better "read up to here" than the push's,
        // when it has one: it is exactly what the notification shows.
        val seenUpTo = latest?.createdAt ?: data.seenUpTo

        val locked = base(data.conversationId)
            .setContentTitle(clientName?.let(::notificationLockedTitle) ?: AgentMessagesCopy.NOTIFY_NEW_MESSAGE)
            .setContentText(AgentMessagesCopy.NOTIFY_LOCKED_BODY)
            .build()

        val builder = base(data.conversationId)
            .setContentTitle(title)
            // What this notification is about, so a late dismiss can tell it is newer.
            .addExtras(Bundle().apply { putString(EXTRA_SEEN_UP_TO, seenUpTo) })
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(locked)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .addAction(replyAction(data.conversationId, seenUpTo))
            .addAction(markReadAction(data.conversationId, seenUpTo))
        if (body != null) {
            builder.setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body))
        }
        post(data.conversationId, builder.build())
    }

    private suspend fun showSummary(data: AgentPushData.Summary) {
        val names = withTimeoutOrNull(READ_TIMEOUT_MS) {
            if (SupabaseClientProvider.agentPushRepository().signedIn()) {
                (SupabaseClientProvider.agentMessagesRepository().inbox(AgentInboxQuery(unread = true, limit = 10)) as? AgentInboxRead.Ok)
                    ?.rows?.map { it.clientName }
            } else {
                null
            }
        }.orEmpty()
        val title = notificationSummaryTitle(data.count)
        val body = notificationSummaryBody(names)
        val locked = base(null).setContentTitle(title).build()
        post(
            AGENT_PUSH_SUMMARY_TAG,
            base(null)
                .setContentTitle(title)
                .setContentText(body)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(locked)
                .build(),
        )
    }

    /**
     * Read somewhere else: close it here. If that leaves nothing unread, the morning summary
     * goes too (the summary names threads, not one).
     */
    suspend fun dismiss(tag: String, readUpTo: String? = null) {
        // FCM does not promise order: a dismiss for an older message must not close a newer one.
        val shownUpTo = manager.activeNotifications
            .firstOrNull { it.tag == tag && it.id == ID }
            ?.notification?.extras?.getString(EXTRA_SEEN_UP_TO)
        if (dismissApplies(readUpTo, shownUpTo)) manager.cancel(tag, ID)
        val nothingUnread = withTimeoutOrNull(READ_TIMEOUT_MS) {
            SupabaseClientProvider.agentPushRepository().signedIn() &&
                SupabaseClientProvider.agentMessagesRepository().unreadThreads() == 0
        } == true
        if (nothingUnread) manager.cancel(AGENT_PUSH_SUMMARY_TAG, ID)
    }

    /** A reply from the notification failed: say so, and point at the thread its words wait in. */
    fun showReplyFailed(conversationId: String, title: String?) {
        post(
            conversationId,
            base(conversationId)
                .setContentTitle(title ?: AgentMessagesCopy.NOTIFY_NEW_MESSAGE)
                .setContentText(AgentMessagesCopy.NOTIFY_REPLY_FAILED)
                .setStyle(
                    NotificationCompat.BigTextStyle()
                        .bigText("${AgentMessagesCopy.NOTIFY_REPLY_FAILED}\n${AgentMessagesCopy.NOTIFY_REPLY_DRAFT}"),
                )
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setOnlyAlertOnce(true)
                .build(),
        )
    }

    /**
     * A reply from the notification went through. Android 15 keeps a notification that was just
     * replied to alive and ignores a plain cancel (lifetime extension), so the reply is answered
     * with an UPDATE: a quiet "Sent" that removes itself a moment later.
     */
    @SuppressLint("MissingPermission")
    fun showReplySent(conversationId: String, title: String?) {
        val done = base(conversationId)
            .setContentTitle(title ?: AgentMessagesCopy.NOTIFY_NEW_MESSAGE)
            .setContentText(AgentMessagesCopy.NOTIFY_REPLY_SENT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setTimeoutAfter(SENT_LINGER_MS)
            .build()
        if (manager.areNotificationsEnabled()) manager.notify(conversationId, ID, done)
    }

    fun cancel(tag: String) = manager.cancel(tag, ID)

    fun cancelAll() = manager.cancelAll()

    private fun base(conversationId: String?): NotificationCompat.Builder =
        NotificationCompat.Builder(context, PushSetup.CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(openIntent(conversationId))

    /** Opens the thread (or the inbox, for the summary) through MainActivity. */
    private fun openIntent(conversationId: String?): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            // A distinct URI per thread, so two threads' intents can never be taken for one.
            .setData(threadUri("open", conversationId ?: AGENT_PUSH_SUMMARY_TAG))
            .putExtra(EXTRA_THREAD, conversationId)
        return PendingIntent.getActivity(
            context,
            (conversationId ?: AGENT_PUSH_SUMMARY_TAG).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun replyAction(conversationId: String, seenUpTo: String): NotificationCompat.Action {
        val input = RemoteInput.Builder(KEY_REPLY).setLabel(AgentMessagesCopy.NOTIFY_REPLY_HINT).build()
        // MUTABLE is required for RemoteInput to write the typed text into the intent. The
        // intent is explicit (our own receiver), so nothing else can be aimed at it.
        val pending = PendingIntent.getBroadcast(
            context,
            ("reply:$conversationId").hashCode(),
            actionIntent(ACTION_REPLY, conversationId, seenUpTo),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
        return NotificationCompat.Action.Builder(0, AgentMessagesCopy.NOTIFY_ACTION_REPLY, pending)
            .addRemoteInput(input)
            .setAllowGeneratedReplies(false)
            .build()
    }

    private fun markReadAction(conversationId: String, seenUpTo: String): NotificationCompat.Action {
        val pending = PendingIntent.getBroadcast(
            context,
            ("read:$conversationId").hashCode(),
            actionIntent(ACTION_MARK_READ, conversationId, seenUpTo),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Action.Builder(0, AgentMessagesCopy.NOTIFY_ACTION_MARK_READ, pending).build()
    }

    private fun actionIntent(action: String, conversationId: String, seenUpTo: String) =
        Intent(context, NotificationActionReceiver::class.java)
            .setAction(action)
            .setData(threadUri(action.substringAfterLast('.').lowercase(), conversationId))
            .putExtra(EXTRA_THREAD, conversationId)
            .putExtra(EXTRA_SEEN_UP_TO, seenUpTo)

    // Permission is checked by whoever turned notifications on; if it was revoked since, the
    // system drops the post and there is nothing better to do here.
    @SuppressLint("MissingPermission")
    private fun post(tag: String, notification: Notification) {
        if (manager.areNotificationsEnabled()) manager.notify(tag, ID, notification)
    }

    private fun threadUri(kind: String, id: String): Uri = Uri.parse("storytail://notification/$kind/$id")

    companion object {
        const val ID = 3107
        private const val TAG = "StoryTailPush"
        private const val SENT_LINGER_MS = 2_500L
        private const val READ_TIMEOUT_MS = 6_000L
        const val EXTRA_THREAD = "com.storytail.adventures.thread"
        const val EXTRA_TRIP = "com.storytail.adventures.trip"
        const val EXTRA_SEEN_UP_TO = "com.storytail.adventures.seenUpTo"
        const val KEY_REPLY = "reply"
        const val ACTION_REPLY = "com.storytail.adventures.action.REPLY"
        const val ACTION_MARK_READ = "com.storytail.adventures.action.MARK_READ"
    }
}
