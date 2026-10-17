package com.storytail.adventures.ui.screens.agent

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.storytail.adventures.api.AgentSettingsRead
import com.storytail.adventures.api.AgentSettingsRepository
import com.storytail.adventures.api.SettingsSave
import com.storytail.adventures.config.SupabaseConfig
import com.storytail.adventures.domain.agent.AgentSettings
import com.storytail.adventures.domain.agent.avatarUrlFor
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.ui.nav.AppRoute
import com.storytail.adventures.ui.nav.Navigator

/**
 * §3.12's host on the phone: one read of `agent_settings_self()` per screen, re-read after any
 * save that changed something, so a form always starts from what the server stored (the social
 * links come back normalised, a time-off block comes back with its outcome). The same rule the
 * web follows with `revalidatePath` after each action.
 */
@Composable
internal fun AgentSettingsRoute(
    route: AppRoute,
    settings: AgentSettingsRepository,
    nav: Navigator,
    onSelectTab: (String) -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var tick by remember(route) { mutableIntStateOf(0) }
    var state by remember(route) { mutableStateOf<Loadable<AgentSettings>>(Loadable.Loading) }
    LaunchedEffect(settings, route, tick) {
        val read = settings.load()
        state = when {
            read is AgentSettingsRead.Ok -> Loadable.Ready(read.settings)
            // A re-read after a save that worked: keep what is on screen rather than replacing
            // the form with "couldn't load" (the save itself already said "Saved.").
            state is Loadable.Ready -> state
            read == AgentSettingsRead.Forbidden -> Loadable.Unauthorized
            else -> Loadable.Failed()
        }
    }
    val reload: () -> Unit = { tick++ }

    /** A save, then a re-read when it changed anything. */
    suspend fun saving(block: suspend () -> SettingsSave): SettingsSave {
        val result = block()
        if (result is SettingsSave.Saved && !result.unchanged) reload()
        return result
    }

    val avatarUrl = avatarUrlFor((state as? Loadable.Ready)?.value?.profile?.avatarPath, SupabaseConfig.URL)
    val back: () -> Unit = { if (!nav.pop()) nav.selectTab(AppRoute.AgentMore) }

    when (route) {
        AppRoute.AgentMore -> AgentMoreScreen(
            state = state,
            avatarUrl = avatarUrl,
            onOpenProfile = { nav.push(AppRoute.AgentSettingsProfile) },
            onOpenAvailability = { nav.push(AppRoute.AgentSettingsAvailability) },
            onOpenNotifications = { nav.push(AppRoute.AgentSettingsNotifications) },
            onSelectTab = onSelectTab,
            onSignOut = onSignOut,
            modifier = modifier,
        )

        AppRoute.AgentSettingsProfile -> AgentProfileSettingsScreen(
            state = state,
            avatarUrl = avatarUrl,
            onSaveProfile = { saving { settings.saveProfile(it) } },
            onSetAvatar = { saving { settings.setAvatar(it) } },
            onRemoveAvatar = { saving { settings.removeAvatar() } },
            onBack = back,
            onRetry = reload,
            onSelectTab = onSelectTab,
            modifier = modifier,
        )

        AppRoute.AgentSettingsAvailability -> AgentAvailabilitySettingsScreen(
            state = state,
            onSaveAvailability = { zone, schedule, hours -> saving { settings.saveAvailability(zone, schedule, hours) } },
            onSaveTimeOff = { block, isNew -> saving { settings.saveTimeOff(block, isNew) } },
            onEndTimeOff = { id -> saving { settings.endTimeOff(id) } },
            onBack = back,
            onRetry = reload,
            onSelectTab = onSelectTab,
            modifier = modifier,
        )

        AppRoute.AgentSettingsNotifications -> AgentNotificationSettingsScreen(
            state = state,
            onSaveNotifications = { saving { settings.saveNotifications(it) } },
            // PUSH, so Back returns here rather than to More.
            onOpenAvailability = { nav.push(AppRoute.AgentSettingsAvailability) },
            onBack = back,
            onRetry = reload,
            onSelectTab = onSelectTab,
            modifier = modifier,
        )

        else -> Unit
    }
}
