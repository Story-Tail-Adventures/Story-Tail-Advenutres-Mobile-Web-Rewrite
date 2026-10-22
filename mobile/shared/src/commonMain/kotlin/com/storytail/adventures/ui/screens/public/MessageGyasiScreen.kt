package com.storytail.adventures.ui.screens.public

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.LeadMessageInput
import com.storytail.adventures.api.LeadMessageResult
import com.storytail.adventures.api.SupabaseClientProvider
import com.storytail.adventures.content.public.Topic
import com.storytail.adventures.domain.messages.MessageGyasiCopy
import com.storytail.adventures.domain.messages.leadAbout
import com.storytail.adventures.domain.messages.messageFormReady
import com.storytail.adventures.ui.components.public.PlaceholderBanner
import com.storytail.adventures.ui.components.public.PublicTapTarget
import com.storytail.adventures.ui.components.public.SectionLabel
import com.storytail.adventures.ui.theme.PillShape
import kotlinx.datetime.Clock
import kotlinx.coroutines.launch

/**
 * Screen 2.0.12 "Message Gyasi" on the phone (BRD §6.5, 2026-10-21; Data-Model §11).
 *
 * Somebody without an account sends Gyasi a note, and it becomes a lead he tracks on the web.
 * Every "Message Gyasi" on the public surface and the sign-up gate's "Message Gyasi instead"
 * land here. The words are the web form's (`MessageGyasiCopy`); the rules are `lead-message`'s,
 * whose 400 sentence is shown as written. No email goes to the visitor, and every accepted
 * send gets the same thank-you, so the form never says whether an address is a client's.
 *
 * Pattern J like the gate it sits beside: a dismiss top-left, no menu, the send pinned at the
 * bottom. What they typed survives a rotation (rememberSaveable) and a failed send.
 */
@Composable
fun MessageGyasiScreen(
    tripSlug: String?,
    topic: Topic?,
    onPrivacy: () -> Unit,
    onKeepExploring: () -> Unit,
    onDismiss: () -> Unit,
) {
    val about = remember(tripSlug, topic) { leadAbout(tripSlug, topic) }
    // When the form was drawn: the function drops a send made under three seconds after it.
    val startedAt = rememberSaveable { Clock.System.now().toEpochMilliseconds() }

    var firstName by rememberSaveable { mutableStateOf("") }
    var lastName by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var message by rememberSaveable { mutableStateOf("") }
    var sent by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var sending by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun send() {
        if (sending) return
        sending = true
        error = null
        scope.launch {
            val result = SupabaseClientProvider.leadMessageRepository().send(
                LeadMessageInput(firstName, lastName, email, phone, message, about, startedAt),
            )
            sending = false
            when (result) {
                LeadMessageResult.Sent -> sent = true
                is LeadMessageResult.Invalid -> error = result.detail
                LeadMessageResult.Throttled -> error = MessageGyasiCopy.THROTTLED
                LeadMessageResult.Unavailable -> error = MessageGyasiCopy.UNAVAILABLE
            }
        }
    }

    Surface(color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            PlaceholderBanner()
            Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 2.dp)) {
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.heightIn(min = PublicTapTarget).width(PublicTapTarget),
                ) {
                    Text(
                        text = "✕",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.clearAndSetSemantics { contentDescription = "Close and keep browsing" },
                    )
                }
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 18.dp)
                    .padding(bottom = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                SectionLabel(MessageGyasiCopy.OVERLINE)
                Text(
                    text = if (sent) MessageGyasiCopy.SENT_TITLE else MessageGyasiCopy.TITLE,
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = if (sent) MessageGyasiCopy.SENT_BODY else MessageGyasiCopy.BODY,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (about != null) {
                    Text(
                        text = MessageGyasiCopy.ABOUT_PREFIX + about.label,
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }

                if (!sent) {
                    error?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = firstName,
                            onValueChange = { firstName = it.take(80) },
                            label = { Text(MessageGyasiCopy.FIRST_NAME) },
                            singleLine = true,
                            enabled = !sending,
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = lastName,
                            onValueChange = { lastName = it.take(80) },
                            label = { Text(MessageGyasiCopy.LAST_NAME) },
                            singleLine = true,
                            enabled = !sending,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it.take(254) },
                        label = { Text(MessageGyasiCopy.EMAIL) },
                        singleLine = true,
                        enabled = !sending,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it.take(40) },
                        label = { Text(MessageGyasiCopy.PHONE) },
                        singleLine = true,
                        enabled = !sending,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = message,
                        onValueChange = { message = it.take(2000) },
                        label = { Text(MessageGyasiCopy.MESSAGE) },
                        supportingText = { Text(MessageGyasiCopy.MESSAGE_HINT) },
                        minLines = 4,
                        enabled = !sending,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text(
                        text = MessageGyasiCopy.PRIVACY_BEFORE,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TextButton(onClick = onPrivacy, modifier = Modifier.heightIn(min = PublicTapTarget)) {
                        Text(MessageGyasiCopy.PRIVACY_LINK)
                    }
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp)
                    .padding(top = 6.dp, bottom = 10.dp),
            ) {
                if (sent) {
                    Button(
                        onClick = onKeepExploring,
                        shape = PillShape,
                        modifier = Modifier.fillMaxWidth().heightIn(min = PublicTapTarget),
                    ) {
                        Text(MessageGyasiCopy.KEEP_EXPLORING)
                    }
                } else {
                    Button(
                        onClick = ::send,
                        enabled = !sending && messageFormReady(firstName, email, message),
                        shape = PillShape,
                        modifier = Modifier.fillMaxWidth().heightIn(min = PublicTapTarget),
                    ) {
                        Text(if (sending) MessageGyasiCopy.PENDING else MessageGyasiCopy.SUBMIT)
                    }
                }
            }
        }
    }
}
