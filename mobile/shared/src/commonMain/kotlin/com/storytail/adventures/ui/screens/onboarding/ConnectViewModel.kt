package com.storytail.adventures.ui.screens.onboarding

import com.storytail.adventures.api.OnboardingFunction
import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.OnboardingRepository
import com.storytail.adventures.domain.onboarding.ConnectBanner
import com.storytail.adventures.domain.onboarding.WizardStep
import com.storytail.adventures.domain.onboarding.connectBanner
import com.storytail.adventures.domain.onboarding.formatTripDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Screen 2.1m.13 Connect with Agent — see docs/Screen-Inventory.md §2.1.13.
 *
 * The code is a bearer token for somebody's itinerary and passport details. It is never
 * logged, never put in a URL, and never held anywhere but the field it was typed into —
 * `client_invite` has RLS with zero policies and the hash function's EXECUTE is granted only
 * to the service role, so this layer could not check a code even if it tried.
 */
class ConnectViewModel(
    private val onboarding: OnboardingRepository,
) : OnboardingViewModel(onboarding, WizardStep.CONNECT) {

    override val saveError =
        "Something went wrong connecting your trips. Try again in a moment — or message " +
            "Gyasi and he'll sort it out."

    private val _code = MutableStateFlow("")
    val code: StateFlow<String> = _code.asStateFlow()

    /**
     * What the automatic match already found, once we have looked.
     *
     * Null until the read finishes, and the screen shows no banner in the meantime. That
     * matters more here than the usual "render something immediately": the empty-list banner
     * says "nothing linked yet", so rendering it before the read would flash a claim we have
     * not checked at somebody whose trip IS linked.
     */
    private val _banner = MutableStateFlow<ConnectBanner?>(null)
    val banner: StateFlow<ConnectBanner?> = _banner.asStateFlow()

    init {
        viewModelScope.launch {
            val trips = onboarding.linkedTrips()
            _banner.value = connectBanner(
                trips = trips,
                email = onboarding.currentEmail(),
                formatStart = { formatTripDate(it.startDate) },
            )
        }
    }

    fun onCodeChange(value: String) {
        _code.value = value
        clearError()
    }

    fun submit() {
        val entered = _code.value.trim()
        save(
            OnboardingFunction.CONNECT,
            // An empty box is a legitimate way to press the primary button: it means
            // "carry on", and the function reads an absent code exactly that way.
            buildJsonObject { if (entered.isNotEmpty()) put("code", entered) },
        )
    }
}
