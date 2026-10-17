package com.storytail.adventures.ui.screens.agent

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.storytail.adventures.api.SettingsSave
import com.storytail.adventures.domain.agent.AgentAvailabilitySettings
import com.storytail.adventures.domain.agent.AgentCopy
import com.storytail.adventures.domain.agent.AgentNotificationSettings
import com.storytail.adventures.domain.agent.AgentProfileSettings
import com.storytail.adventures.domain.agent.AgentSettings
import com.storytail.adventures.domain.agent.AgentSettingsCopy
import com.storytail.adventures.domain.agent.DEFAULT_AUTO_REPLY
import com.storytail.adventures.domain.agent.DayHours
import com.storytail.adventures.domain.agent.END_TIMES
import com.storytail.adventures.domain.agent.MAX_AUTO_REPLY
import com.storytail.adventures.domain.agent.MAX_BIO
import com.storytail.adventures.domain.agent.MAX_LINK
import com.storytail.adventures.domain.agent.MAX_NAME
import com.storytail.adventures.domain.agent.MAX_PHONE
import com.storytail.adventures.domain.agent.MAX_PRONOUNS
import com.storytail.adventures.domain.agent.MAX_TIME_OFF_LABEL
import com.storytail.adventures.domain.agent.NORTH_AMERICAN_TIME_ZONES
import com.storytail.adventures.domain.agent.RESPONSE_TIME_CHOICES
import com.storytail.adventures.domain.agent.START_TIMES
import com.storytail.adventures.domain.agent.SocialNetwork
import com.storytail.adventures.domain.agent.TimeOffBlock
import com.storytail.adventures.domain.agent.TimeOffPhase
import com.storytail.adventures.domain.agent.TimeZoneChoice
import com.storytail.adventures.domain.agent.WeeklySchedule
import com.storytail.adventures.domain.agent.Weekday
import com.storytail.adventures.domain.agent.autoReplyFilled
import com.storytail.adventures.domain.agent.autoReplyPreview
import com.storytail.adventures.domain.agent.autoReplyProblem
import com.storytail.adventures.domain.agent.dateRangeLabel
import com.storytail.adventures.domain.agent.hoursLabel
import com.storytail.adventures.domain.agent.advisorInitials
import com.storytail.adventures.domain.agent.profileProblem
import com.storytail.adventures.domain.agent.scheduleProblem
import com.storytail.adventures.domain.agent.switchLabel
import com.storytail.adventures.domain.agent.timeLabel
import com.storytail.adventures.domain.agent.timeOffPhase
import com.storytail.adventures.domain.agent.timeOffProblem
import com.storytail.adventures.domain.agent.workingOnLabel
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.domain.uuidV7
import com.storytail.adventures.ui.components.AdvisorPhoto
import com.storytail.adventures.ui.components.AuthPrimaryButton
import com.storytail.adventures.ui.components.AvatarPick
import com.storytail.adventures.ui.components.DateField
import com.storytail.adventures.ui.components.LocalAvatarPicker
import com.storytail.adventures.ui.components.StoryTailMark
import com.storytail.adventures.ui.components.agent.AgentScaffold
import com.storytail.adventures.ui.components.agent.AgentTopBar
import com.storytail.adventures.ui.components.client.AccountTopBar
import com.storytail.adventures.ui.components.client.SettingsGroup
import com.storytail.adventures.ui.components.client.SettingsRow
import com.storytail.adventures.ui.nav.PlatformBackHandler
import com.storytail.adventures.ui.theme.PillShape
import com.storytail.adventures.ui.theme.StoryTailBrand
import com.storytail.adventures.ui.theme.StoryTailRadius
import kotlinx.coroutines.launch

/**
 * §3.12 Agent Profile & Settings on the phone (PR 4): the More tab and three of the web's
 * four tabs. Rulings: docs/Screen-Inventory.md §3.12 ("Ruled 2026-10-17"), Q10 and Q26.
 *
 * NO PHONE ARTBOARD EXISTS for §3.12 (the design has A3121 to A3125, web only), so these
 * follow the web tabs' fields and words, laid out in the phone's existing grammar: §2.5's
 * grouped settings list for the hub, one column of fields with one Save per screen, as on
 * the web where each tab saves on its own. Left off on purpose, as narrower than the web
 * (§6.6): the profile's "How you appear" preview, the week grid picture (it is read-only on
 * the web too) and Signature (Q10: web only).
 */

// ── More ─────────────────────────────────────────────────────────────────────

@Composable
internal fun AgentMoreScreen(
    state: Loadable<AgentSettings>,
    avatarUrl: String?,
    onOpenProfile: () -> Unit,
    onOpenAvailability: () -> Unit,
    onOpenNotifications: () -> Unit,
    onSelectTab: (String) -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    AgentScaffold(
        modifier = modifier,
        topBar = { AgentTopBar(title = AgentSettingsCopy.MORE_TITLE) },
        activeTab = "more",
        onSelectTab = onSelectTab,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            // The card names who is signed in. A failed read still leaves every row below
            // working: each screen reads for itself, and Sign out needs nothing.
            val settings = (state as? Loadable.Ready)?.value
            if (settings != null) {
                val p = settings.profile
                val a = settings.availability
                val away = a.timeOff.any { timeOffPhase(it.startsOn, it.endsOn, a.today) == TimeOffPhase.RUNNING }
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp)
                        .background(scheme.surface, RoundedCornerShape(StoryTailRadius.md))
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AdvisorPhoto(
                        url = avatarUrl,
                        initials = advisorInitials(p.displayName),
                        size = 56.dp,
                        background = StoryTailBrand.Burgundy,
                    )
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(p.displayName, style = MaterialTheme.typography.titleMedium, color = scheme.onSurface)
                        Text(AgentSettingsCopy.ROLE, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                        if (p.email.isNotBlank()) {
                            Text(p.email, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                        }
                    }
                    if (away) {
                        Text(
                            AgentSettingsCopy.AWAY_NOW,
                            style = MaterialTheme.typography.labelSmall,
                            color = scheme.onSecondaryContainer,
                            modifier = Modifier
                                .background(scheme.secondaryContainer, PillShape)
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                        )
                    }
                }
            }

            SettingsGroup(label = AgentSettingsCopy.SETTINGS_GROUP) {
                SettingsRow(
                    title = AgentSettingsCopy.ROW_PROFILE,
                    sub = AgentSettingsCopy.ROW_PROFILE_SUB,
                    mark = StoryTailMark.USER,
                    onClick = onOpenProfile,
                    first = true,
                )
                SettingsRow(
                    title = AgentSettingsCopy.ROW_AVAILABILITY,
                    sub = AgentSettingsCopy.ROW_AVAILABILITY_SUB,
                    mark = StoryTailMark.CLOCK,
                    onClick = onOpenAvailability,
                )
                SettingsRow(
                    title = AgentSettingsCopy.ROW_NOTIFICATIONS,
                    sub = AgentSettingsCopy.ROW_NOTIFICATIONS_SUB,
                    mark = StoryTailMark.BELL,
                    onClick = onOpenNotifications,
                )
                // Q10: web only. Disabled with its reason rather than hidden, the §2.5 rule.
                SettingsRow(
                    title = AgentSettingsCopy.ROW_SIGNATURE,
                    mark = StoryTailMark.MESSAGE,
                    disabled = true,
                    reason = AgentSettingsCopy.ROW_SIGNATURE_WEB,
                )
            }

            SettingsGroup(label = AgentSettingsCopy.ACCOUNT_GROUP) {
                SettingsRow(title = AgentCopy.SIGN_OUT, onClick = onSignOut, first = true)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

// ── Shared frame for the three settings screens ─────────────────────────────

/**
 * A pushed settings screen: the back bar, the More tab lit, and the load states. [dirty]
 * holds Back (the system gesture and the bar's arrow) behind "Leave without saving?".
 */
@Composable
private fun SettingsFrame(
    title: String,
    state: Loadable<*>,
    dirty: Boolean,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onSelectTab: (String) -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    var asking by remember { mutableStateOf<(() -> Unit)?>(null) }
    val guarded: (() -> Unit) -> Unit = { go -> if (dirty) asking = go else go() }
    PlatformBackHandler(enabled = dirty) { asking = onBack }

    AgentScaffold(
        modifier = modifier,
        topBar = { AccountTopBar(title = title, onBack = { guarded(onBack) }, backLabel = AgentSettingsCopy.MORE_TITLE) },
        activeTab = "more",
        onSelectTab = { tab -> guarded { onSelectTab(tab) } },
    ) {
        when (state) {
            is Loadable.Ready<*> -> content()
            Loadable.Loading -> Column(Modifier.fillMaxWidth().padding(48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator()
            }
            else -> Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    AgentSettingsCopy.LOAD_FAILED,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = onRetry) { Text(AgentSettingsCopy.TRY_AGAIN) }
            }
        }
    }

    asking?.let { go ->
        LeaveUnsavedDialog(
            onLeave = {
                asking = null
                go()
            },
            onStay = { asking = null },
        )
    }
}

/** A save's answer as the line under the button. */
internal fun statusOf(result: SettingsSave): SaveStatus = when (result) {
    is SettingsSave.Saved -> SaveStatus(if (result.unchanged) AgentSettingsCopy.NOTHING_CHANGED else AgentSettingsCopy.SAVED, error = false)
    is SettingsSave.Failed -> SaveStatus(result.detail ?: AgentSettingsCopy.SAVE_FAILED, error = true)
}

// ── 3.12.1 Profile ───────────────────────────────────────────────────────────

@Composable
internal fun AgentProfileSettingsScreen(
    state: Loadable<AgentSettings>,
    avatarUrl: String?,
    onSaveProfile: suspend (AgentProfileSettings) -> SettingsSave,
    onSetAvatar: suspend (String) -> SettingsSave,
    onRemoveAvatar: suspend () -> SettingsSave,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onSelectTab: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val loaded = (state as? Loadable.Ready)?.value?.profile
    // Keyed on the fields the form edits, not the photo: a save re-reads and the form starts again
    // from what is stored, but a photo change (which re-reads too) keeps half-typed words.
    var form by remember(loaded?.copy(avatarPath = null)) { mutableStateOf(loaded ?: AgentProfileSettings()) }
    var status by remember { mutableStateOf<SaveStatus?>(null) }
    var saving by remember { mutableStateOf(false) }
    var photoStatus by remember { mutableStateOf<SaveStatus?>(null) }
    var photoBusy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val picker = LocalAvatarPicker.current
    val dirty = loaded != null && form.copy(avatarPath = loaded.avatarPath) != loaded

    SettingsFrame(
        title = AgentSettingsCopy.ROW_PROFILE,
        state = state,
        dirty = dirty,
        onBack = onBack,
        onRetry = onRetry,
        onSelectTab = onSelectTab,
        modifier = modifier,
    ) {
        val scheme = MaterialTheme.colorScheme
        SettingsSection(AgentSettingsCopy.PROFILE_TITLE, AgentSettingsCopy.PROFILE_SUB) {
            // The photo saves on its own, the moment it is picked, as on the web.
            Row(verticalAlignment = Alignment.CenterVertically) {
                AdvisorPhoto(
                    url = avatarUrl,
                    initials = advisorInitials(form.displayName),
                    size = 72.dp,
                    background = StoryTailBrand.Burgundy,
                    contentDescription = AgentSettingsCopy.PHOTO,
                )
                Spacer(Modifier.width(16.dp))
                Column(Modifier.weight(1f)) {
                    Text(AgentSettingsCopy.PHOTO, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
                    Text(AgentSettingsCopy.PHOTO_HINT, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (picker.available) {
                            TextButton(
                                enabled = !photoBusy,
                                onClick = {
                                    scope.launch {
                                        photoBusy = true
                                        photoStatus = when (val pick = picker.pick()) {
                                            is AvatarPick.Picked -> {
                                                photoStatus = SaveStatus(AgentSettingsCopy.UPLOADING, error = false)
                                                when (val r = onSetAvatar(pick.jpegBase64)) {
                                                    is SettingsSave.Saved -> SaveStatus(AgentSettingsCopy.PHOTO_SAVED, error = false)
                                                    is SettingsSave.Failed -> statusOf(r)
                                                }
                                            }
                                            AvatarPick.Cancelled -> null
                                            AvatarPick.TooBig -> SaveStatus(AgentSettingsCopy.PHOTO_TOO_BIG, error = true)
                                            AvatarPick.WrongType -> SaveStatus(AgentSettingsCopy.PHOTO_WRONG_TYPE, error = true)
                                            AvatarPick.Unreadable -> SaveStatus(AgentSettingsCopy.PHOTO_UNREADABLE, error = true)
                                        }
                                        photoBusy = false
                                    }
                                },
                                modifier = Modifier.heightIn(min = 48.dp),
                            ) { Text(if (photoBusy) AgentSettingsCopy.UPLOADING else AgentSettingsCopy.UPLOAD) }
                        }
                        if (loaded?.avatarPath != null) {
                            TextButton(
                                enabled = !photoBusy,
                                onClick = {
                                    scope.launch {
                                        photoBusy = true
                                        photoStatus = when (val r = onRemoveAvatar()) {
                                            is SettingsSave.Saved -> SaveStatus(AgentSettingsCopy.PHOTO_REMOVED, error = false)
                                            is SettingsSave.Failed -> statusOf(r)
                                        }
                                        photoBusy = false
                                    }
                                },
                                modifier = Modifier.heightIn(min = 48.dp),
                            ) { Text(AgentSettingsCopy.REMOVE) }
                        }
                    }
                }
            }
            SaveStatusLine(photoStatus)
            HorizontalDivider(color = scheme.outlineVariant)

            SettingsField(
                label = AgentSettingsCopy.NAME,
                value = form.displayName,
                onValueChange = { form = form.copy(displayName = it) },
                capitalization = KeyboardCapitalization.Words,
                maxLength = MAX_NAME,
            )
            SettingsField(
                label = AgentSettingsCopy.PRONOUNS,
                value = form.pronouns,
                onValueChange = { form = form.copy(pronouns = it) },
                hint = AgentSettingsCopy.PRONOUNS_HINT,
                capitalization = KeyboardCapitalization.None,
                maxLength = MAX_PRONOUNS,
            )
            SettingsField(
                label = AgentSettingsCopy.EMAIL,
                value = form.email,
                onValueChange = {},
                enabled = false,
                hint = AgentSettingsCopy.EMAIL_HINT,
            )
            SettingsField(
                label = AgentSettingsCopy.PHONE,
                value = form.phone,
                onValueChange = { form = form.copy(phone = it) },
                keyboardType = KeyboardType.Phone,
                maxLength = MAX_PHONE,
            )
            SettingsField(
                label = AgentSettingsCopy.BIO,
                value = form.bio,
                onValueChange = { form = form.copy(bio = it) },
                hint = AgentSettingsCopy.BIO_HINT,
                lines = 4,
                maxLength = MAX_BIO,
            )
        }

        SettingsSection(AgentSettingsCopy.LINKS, AgentSettingsCopy.LINKS_HINT) {
            for (network in SocialNetwork.entries) {
                SettingsField(
                    label = network.label,
                    value = form.socialLinks[network].orEmpty(),
                    onValueChange = { v ->
                        form = form.copy(socialLinks = (form.socialLinks + (network to v)).filterValues { it.isNotEmpty() })
                    },
                    keyboardType = KeyboardType.Uri,
                    capitalization = KeyboardCapitalization.None,
                    maxLength = MAX_LINK,
                )
            }
        }

        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SaveStatusLine(status)
            AuthPrimaryButton(
                label = AgentSettingsCopy.SAVE,
                pendingLabel = AgentSettingsCopy.SAVING,
                isSubmitting = saving,
                onClick = {
                    val problem = profileProblem(form)
                    if (problem != null) {
                        status = SaveStatus(problem, error = true)
                    } else {
                        scope.launch {
                            saving = true
                            status = statusOf(onSaveProfile(form))
                            saving = false
                        }
                    }
                },
            )
        }
    }
}

// ── 3.12.2 Availability ──────────────────────────────────────────────────────

@Composable
internal fun AgentAvailabilitySettingsScreen(
    state: Loadable<AgentSettings>,
    onSaveAvailability: suspend (String, WeeklySchedule, Int) -> SettingsSave,
    onSaveTimeOff: suspend (TimeOffBlock, Boolean) -> SettingsSave,
    onEndTimeOff: suspend (String) -> SettingsSave,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onSelectTab: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val loaded = (state as? Loadable.Ready)?.value?.availability
    // Keyed on the three saved fields only: saving or ending time away re-reads, and must not
    // throw away working-hours edits that are not saved yet.
    var form by remember(loaded?.timeZone, loaded?.weeklySchedule, loaded?.responseTimeHours) {
        mutableStateOf(loaded ?: AgentAvailabilitySettings())
    }
    var status by remember { mutableStateOf<SaveStatus?>(null) }
    var awayStatus by remember { mutableStateOf<SaveStatus?>(null) }
    var saving by remember { mutableStateOf(false) }
    // The block being edited, and whether it is new; null when the dialog is closed.
    var editing by remember { mutableStateOf<Pair<TimeOffBlock, Boolean>?>(null) }
    var confirming by remember { mutableStateOf<Pair<TimeOffBlock, TimeOffPhase>?>(null) }
    val scope = rememberCoroutineScope()
    val dirty = loaded != null && (
        form.timeZone != loaded.timeZone ||
            form.weeklySchedule != loaded.weeklySchedule ||
            form.responseTimeHours != loaded.responseTimeHours
        )

    SettingsFrame(
        title = AgentSettingsCopy.ROW_AVAILABILITY,
        state = state,
        dirty = dirty,
        onBack = onBack,
        onRetry = onRetry,
        onSelectTab = onSelectTab,
        modifier = modifier,
    ) {
        val scheme = MaterialTheme.colorScheme
        SettingsSection(AgentSettingsCopy.HOURS_TITLE, AgentSettingsCopy.HOURS_SUB) {
            ChoiceField(
                label = AgentSettingsCopy.TIME_ZONE,
                value = NORTH_AMERICAN_TIME_ZONES.firstOrNull { it.id == form.timeZone }
                    ?: TimeZoneChoice(form.timeZone, form.timeZone),
                options = NORTH_AMERICAN_TIME_ZONES,
                optionLabel = { it.label },
                onSelect = { form = form.copy(timeZone = it.id) },
            )
            for (day in Weekday.entries) {
                val hours = form.weeklySchedule[day]
                Column {
                    SwitchRow(
                        title = day.label,
                        spokenName = workingOnLabel(day.label),
                        sub = if (hours == null) AgentSettingsCopy.DAY_OFF else "${timeLabel(hours.start)} – ${timeLabel(hours.end)}",
                        checked = hours != null,
                        onCheckedChange = { on ->
                            form = form.copy(
                                weeklySchedule = form.weeklySchedule + (day to if (on) DayHours("07:00", "21:00") else null),
                            )
                        },
                    )
                    if (hours != null) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            ChoiceField(
                                label = "${day.label} ${AgentSettingsCopy.FROM.lowercase()}",
                                value = hours.start,
                                options = START_TIMES,
                                optionLabel = ::timeLabel,
                                onSelect = { form = form.copy(weeklySchedule = form.weeklySchedule + (day to hours.copy(start = it))) },
                                modifier = Modifier.weight(1f),
                                showLabel = false,
                            )
                            ChoiceField(
                                label = "${day.label} ${AgentSettingsCopy.TO.lowercase()}",
                                value = hours.end,
                                options = END_TIMES,
                                optionLabel = ::timeLabel,
                                onSelect = { form = form.copy(weeklySchedule = form.weeklySchedule + (day to hours.copy(end = it))) },
                                modifier = Modifier.weight(1f),
                                showLabel = false,
                            )
                        }
                    }
                }
            }
            ChoiceField(
                label = AgentSettingsCopy.REPLY_TIME,
                value = form.responseTimeHours,
                options = RESPONSE_TIME_CHOICES,
                optionLabel = ::hoursLabel,
                onSelect = { form = form.copy(responseTimeHours = it) },
                hint = AgentSettingsCopy.REPLY_TIME_HINT,
            )
            SaveStatusLine(status)
            AuthPrimaryButton(
                label = AgentSettingsCopy.SAVE,
                pendingLabel = AgentSettingsCopy.SAVING,
                isSubmitting = saving,
                onClick = {
                    val problem = scheduleProblem(form.weeklySchedule)
                    if (problem != null) {
                        status = SaveStatus(problem, error = true)
                    } else {
                        scope.launch {
                            saving = true
                            status = statusOf(onSaveAvailability(form.timeZone, form.weeklySchedule, form.responseTimeHours))
                            saving = false
                        }
                    }
                },
            )
        }

        val today = loaded?.today.orEmpty()
        SettingsSection(AgentSettingsCopy.AWAY_TITLE, AgentSettingsCopy.AWAY_SUB) {
            val blocks = (loaded?.timeOff ?: emptyList()).filter { timeOffPhase(it.startsOn, it.endsOn, today) != TimeOffPhase.PAST }
            if (blocks.isEmpty()) {
                Text(AgentSettingsCopy.AWAY_EMPTY, style = MaterialTheme.typography.bodyMedium, color = scheme.onSurfaceVariant)
            }
            for (block in blocks) {
                val phase = timeOffPhase(block.startsOn, block.endsOn, today)
                Column(
                    Modifier
                        .fillMaxWidth()
                        .background(scheme.surfaceContainer, RoundedCornerShape(StoryTailRadius.sm))
                        .padding(12.dp),
                ) {
                    val range = dateRangeLabel(block.startsOn, block.endsOn, today)
                    Text(range, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
                    val tags = listOfNotNull(
                        block.label.takeIf { it.isNotBlank() },
                        AgentSettingsCopy.AWAY_NOW.takeIf { phase == TimeOffPhase.RUNNING },
                        AgentSettingsCopy.AUTO_REPLY_ON.takeIf { block.autoReplyEnabled },
                    )
                    if (tags.isNotEmpty()) {
                        Text(tags.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                    }
                    Row {
                        if (phase == TimeOffPhase.UPCOMING) {
                            TextButton(onClick = { editing = block to false }, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "${AgentSettingsCopy.EDIT} $range" }) {
                                Text(AgentSettingsCopy.EDIT)
                            }
                            TextButton(onClick = { confirming = block to phase }, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "${AgentSettingsCopy.DELETE} $range" }) {
                                Text(AgentSettingsCopy.DELETE)
                            }
                        } else {
                            // A running block's reply cannot be edited, only ended early.
                            TextButton(onClick = { confirming = block to phase }, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "${AgentSettingsCopy.BACK}, $range" }) {
                                Text(AgentSettingsCopy.BACK)
                            }
                        }
                    }
                }
            }
            SaveStatusLine(awayStatus)
            OutlinedButton(
                onClick = {
                    editing = TimeOffBlock(id = uuidV7(), startsOn = "", endsOn = "", autoReplyText = DEFAULT_AUTO_REPLY) to true
                },
                shape = PillShape,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) { Text(AgentSettingsCopy.SCHEDULE) }
        }
        Spacer(Modifier.height(24.dp))
    }

    editing?.let { (block, isNew) ->
        TimeOffDialog(
            initial = block,
            isNew = isNew,
            today = loaded?.today.orEmpty(),
            onSave = { next -> onSaveTimeOff(next, isNew) },
            onDone = { result ->
                editing = null
                awayStatus = statusOf(result)
            },
            onDismiss = { editing = null },
        )
    }

    confirming?.let { (block, phase) ->
        ConfirmDialog(
            text = if (phase == TimeOffPhase.RUNNING) AgentSettingsCopy.CONFIRM_BACK else AgentSettingsCopy.CONFIRM_DELETE,
            confirm = if (phase == TimeOffPhase.RUNNING) AgentSettingsCopy.BACK else AgentSettingsCopy.DELETE,
            onConfirm = {
                confirming = null
                scope.launch { awayStatus = statusOf(onEndTimeOff(block.id)) }
            },
            onDismiss = { confirming = null },
        )
    }
}

/**
 * Scheduling or editing one block of time away. Saves on its own (the web's dialog does too),
 * so it is not part of the working-hours form's unsaved changes.
 */
@Composable
private fun TimeOffDialog(
    initial: TimeOffBlock,
    isNew: Boolean,
    today: String,
    onSave: suspend (TimeOffBlock) -> SettingsSave,
    onDone: (SettingsSave) -> Unit,
    onDismiss: () -> Unit,
) {
    var block by remember(initial) { mutableStateOf(initial) }
    var problem by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val scheme = MaterialTheme.colorScheme

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text(if (isNew) AgentSettingsCopy.DIALOG_NEW else AgentSettingsCopy.DIALOG_EDIT) },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                DateField(
                    label = AgentSettingsCopy.FIRST_DAY,
                    value = block.startsOn,
                    onValueChange = { block = block.copy(startsOn = it) },
                )
                DateField(
                    label = AgentSettingsCopy.LAST_DAY,
                    value = block.endsOn,
                    onValueChange = { block = block.copy(endsOn = it) },
                )
                SettingsField(
                    label = AgentSettingsCopy.LABEL,
                    value = block.label,
                    onValueChange = { block = block.copy(label = it) },
                    hint = AgentSettingsCopy.LABEL_HINT,
                    maxLength = MAX_TIME_OFF_LABEL,
                )
                SwitchRow(
                    title = AgentSettingsCopy.AUTO_REPLY,
                    checked = block.autoReplyEnabled,
                    onCheckedChange = { block = block.copy(autoReplyEnabled = it) },
                )
                if (block.autoReplyEnabled) {
                    SettingsField(
                        label = AgentSettingsCopy.AUTO_REPLY_TEXT,
                        value = block.autoReplyText,
                        onValueChange = { block = block.copy(autoReplyText = it) },
                        hint = AgentSettingsCopy.AUTO_REPLY_HINT,
                        lines = 4,
                        maxLength = MAX_AUTO_REPLY,
                    )
                    if (block.endsOn.isNotBlank() && block.autoReplyText.isNotBlank()) {
                        Text(
                            autoReplyPreview(autoReplyFilled(block.autoReplyText, block.endsOn)),
                            style = MaterialTheme.typography.bodySmall,
                            color = scheme.onSurfaceVariant,
                        )
                    }
                }
                problem?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = scheme.error) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !saving,
                onClick = {
                    val first = timeOffProblem(block.startsOn, block.endsOn, today)
                        ?: autoReplyProblem(block.autoReplyEnabled, block.autoReplyText)
                    if (first != null) {
                        problem = first
                    } else {
                        scope.launch {
                            saving = true
                            when (val r = onSave(block)) {
                                is SettingsSave.Saved -> onDone(r)
                                // Stay open with the dates still typed: the sentence says what to change.
                                is SettingsSave.Failed -> problem = r.detail ?: AgentSettingsCopy.SAVE_FAILED
                            }
                            saving = false
                        }
                    }
                },
            ) { Text(if (saving) AgentSettingsCopy.SAVING else AgentSettingsCopy.SAVE) }
        },
        dismissButton = {
            TextButton(enabled = !saving, onClick = onDismiss) { Text(AgentSettingsCopy.CANCEL) }
        },
    )
}

// ── 3.12.3 Notifications ─────────────────────────────────────────────────────

@Composable
internal fun AgentNotificationSettingsScreen(
    state: Loadable<AgentSettings>,
    onSaveNotifications: suspend (AgentNotificationSettings) -> SettingsSave,
    onOpenAvailability: () -> Unit,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onSelectTab: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val loaded = (state as? Loadable.Ready)?.value?.notifications
    var form by remember(loaded) { mutableStateOf(loaded ?: AgentNotificationSettings()) }
    var status by remember { mutableStateOf<SaveStatus?>(null) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val dirty = loaded != null && form != loaded

    SettingsFrame(
        title = AgentSettingsCopy.ROW_NOTIFICATIONS,
        state = state,
        dirty = dirty,
        onBack = onBack,
        onRetry = onRetry,
        onSelectTab = onSelectTab,
        modifier = modifier,
    ) {
        val scheme = MaterialTheme.colorScheme
        SettingsSection(AgentSettingsCopy.NOTIFICATIONS_TITLE, AgentSettingsCopy.NOTIFICATIONS_SUB) {
            AlertRow(
                title = AgentSettingsCopy.CLIENT_MESSAGES,
                hint = AgentSettingsCopy.CLIENT_MESSAGES_HINT,
                email = form.clientMessagesEmail,
                push = form.clientMessagesPush,
                onEmail = { form = form.copy(clientMessagesEmail = it) },
                onPush = { form = form.copy(clientMessagesPush = it) },
            )
            HorizontalDivider(color = scheme.outlineVariant)
            AlertRow(
                title = AgentSettingsCopy.QUOTE_REQUESTS,
                hint = AgentSettingsCopy.QUOTE_REQUESTS_HINT,
                email = form.quoteRequestsEmail,
                push = form.quoteRequestsPush,
                onEmail = { form = form.copy(quoteRequestsEmail = it) },
                onPush = { form = form.copy(quoteRequestsPush = it) },
            )
            Text(AgentSettingsCopy.EMAIL_NOTE, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
            Text(AgentSettingsCopy.PUSH_NOTE, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
            SaveStatusLine(status)
            AuthPrimaryButton(
                label = AgentSettingsCopy.SAVE,
                pendingLabel = AgentSettingsCopy.SAVING,
                isSubmitting = saving,
                onClick = {
                    scope.launch {
                        saving = true
                        status = statusOf(onSaveNotifications(form))
                        saving = false
                    }
                },
            )
        }

        // Q6: rest hours ARE the working hours; this points there rather than being a second setting.
        SettingsSection(AgentSettingsCopy.REST_TITLE, AgentSettingsCopy.REST_BODY) {
            TextButton(onClick = onOpenAvailability, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(AgentSettingsCopy.REST_LINK)
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun AlertRow(
    title: String,
    hint: String,
    email: Boolean,
    push: Boolean,
    onEmail: (Boolean) -> Unit,
    onPush: (Boolean) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Column {
        Text(title, style = MaterialTheme.typography.titleSmall, color = scheme.onSurface)
        Text(hint, style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
        // Named in full for a screen reader: "Client message by push", not "Push".
        SwitchRow(
            title = AgentSettingsCopy.CHANNEL_PUSH,
            checked = push,
            onCheckedChange = onPush,
            spokenName = switchLabel(title, AgentSettingsCopy.CHANNEL_PUSH),
        )
        SwitchRow(
            title = AgentSettingsCopy.CHANNEL_EMAIL,
            checked = email,
            onCheckedChange = onEmail,
            spokenName = switchLabel(title, AgentSettingsCopy.CHANNEL_EMAIL),
        )
    }
}
