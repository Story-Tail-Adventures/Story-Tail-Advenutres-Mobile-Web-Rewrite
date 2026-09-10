package com.storytail.adventures.ui.screens.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.storytail.adventures.api.AccountOverview
import com.storytail.adventures.api.AccountRepository
import com.storytail.adventures.api.AuthProviderState
import com.storytail.adventures.api.AuthRepository
import com.storytail.adventures.api.OnboardingFunction
import com.storytail.adventures.api.OnboardingRepository
import com.storytail.adventures.api.OnboardingResult
import com.storytail.adventures.api.SignedDocument
import com.storytail.adventures.api.TripDocumentView
import com.storytail.adventures.api.TripRepository
import com.storytail.adventures.domain.trip.DocumentMessages
import com.storytail.adventures.domain.trip.Loadable
import com.storytail.adventures.ui.screens.onboarding.OnboardingViewModel
import com.storytail.adventures.ui.screens.onboarding.PREFERENCES_SAVE_ERROR
import com.storytail.adventures.ui.screens.onboarding.PreferencesForm
import com.storytail.adventures.ui.screens.onboarding.PreferencesSubmission
import com.storytail.adventures.ui.screens.onboarding.ProfileForm
import com.storytail.adventures.ui.screens.onboarding.ProfileSubmission
import com.storytail.adventures.ui.screens.onboarding.validatePreferencesForm
import com.storytail.adventures.ui.screens.onboarding.validateProfileForm
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

/**
 * The §2.5 loaders.
 *
 * WHICH WAY EACH READ FAILS IS A DECISION, not a convention — the opposite of §2.2, where
 * every loader fails closed:
 *
 *  * [AccountDocumentsViewModel] FAILS CLOSED, like §2.2.6. An empty document list is a
 *    statement about somebody's passport.
 *  * Everything else DEGRADES. `AccountRepository` already returns blanks rather than null
 *    for those reads, because an account screen that cannot show what is on file should
 *    still let you change it, and the 2.5.1 hub must still offer its eight destinations
 *    whether or not the name came back.
 *
 * The two forms write through the WIZARD'S OWN Edge Functions with no `advance` key, which
 * is the only difference from 2.1.10 and 2.1.11 — see FormSubmissions.kt.
 */
class AccountHubViewModel(
    private val account: AccountRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<Loadable<AccountOverview>>(Loadable.Loading)
    val state: StateFlow<Loadable<AccountOverview>> = _state.asStateFlow()

    init {
        load()
    }

    // Never [Loadable.Failed]: the repository degrades to blanks, and a hub that showed an
    // error state would take away the eight working destinations because a name did not
    // load. The failure surfaces as an unnamed header, which is the smallest true thing.
    fun load() {
        _state.value = Loadable.Loading
        viewModelScope.launch { _state.value = Loadable.Ready(account.overview()) }
    }
}

/**
 * Screen 2.5.4.
 *
 * [signing] holds the id of the document whose URL is being signed. Not a boolean: two rows
 * tapped in quick succession would otherwise both show a spinner, and only one of them is
 * actually working.
 */
class AccountDocumentsViewModel(
    private val account: AccountRepository,
    private val trips: TripRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<Loadable<List<TripDocumentView>>>(Loadable.Loading)
    val state: StateFlow<Loadable<List<TripDocumentView>>> = _state.asStateFlow()

    private val _signing = MutableStateFlow<String?>(null)
    val signing: StateFlow<String?> = _signing.asStateFlow()

    private val _openError = MutableStateFlow<String?>(null)
    val openError: StateFlow<String?> = _openError.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.value = Loadable.Loading
        viewModelScope.launch {
            val result = account.documents()
            _state.value = result?.let { Loadable.Ready(it) } ?: Loadable.Failed()
        }
    }

    /**
     * Sign and hand off, through §2.2.6's endpoint.
     *
     * `trip-document-url` is the ONLY door into the bucket and it checks `client_id` before
     * it looks at `trip_id`, so an account-scoped document with no trip signs exactly the
     * same way. Reusing it also keeps the access record on the same trail — every signature
     * writes an `audit_event`, and a second endpoint would be a second place to forget that.
     */
    fun open(document: TripDocumentView, onUrl: (String) -> Unit) {
        if (_signing.value != null) return
        _signing.value = document.id
        _openError.value = null
        viewModelScope.launch {
            when (val signed = trips.signDocumentUrl(document.id)) {
                is SignedDocument.Ok -> onUrl(signed.url)
                SignedDocument.Failed -> _openError.value = DocumentMessages.OPEN_FAILED
            }
            _signing.value = null
        }
    }
}

/** What a §2.5 form is doing right now. */
data class AccountFormState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val formError: String? = null,
)

/** The one thing either form has to tell its host: the write landed, so go back. */
data object AccountSaved

/**
 * Screen 2.5.2.
 *
 * Prefills from [AccountRepository.profile] — INCLUDING THE PASSPORT, which is not optional:
 * the body always carries every key, an empty expiry and country arrive as `passport: null`,
 * and `onboarding-profile` archives the existing `travel_document` row on null. A form that
 * opened with those two boxes blank would destroy a passport record on a save that only
 * changed a phone number.
 */
class AccountProfileViewModel(
    private val account: AccountRepository,
    private val onboarding: OnboardingRepository,
    private val today: String,
) : ViewModel() {

    private val _state = MutableStateFlow(AccountFormState())
    val state: StateFlow<AccountFormState> = _state.asStateFlow()

    private val _form = MutableStateFlow(ProfileForm())
    val form: StateFlow<ProfileForm> = _form.asStateFlow()

    /** The read-only identity block: the name and the sign-in address. */
    private val _identity = MutableStateFlow("" to "")
    val identity: StateFlow<Pair<String, String>> = _identity.asStateFlow()

    private val _events = Channel<AccountSaved>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    init {
        viewModelScope.launch {
            val profile = account.profile()
            _identity.value = profile.name to profile.email
            _form.value = ProfileForm(
                phone = profile.phone,
                dateOfBirth = profile.dateOfBirth,
                addressLine1 = profile.addressLine1,
                addressLine2 = profile.addressLine2,
                addressCity = profile.addressCity,
                addressRegion = profile.addressRegion,
                addressPostalCode = profile.addressPostalCode,
                // Falls back to the form's own default rather than to blank: an empty
                // country changes the address labels to their non-US wording for somebody
                // who has simply never filled the address in.
                addressCountry = profile.addressCountry.ifBlank { ProfileForm().addressCountry },
                emergencyName = profile.emergencyName,
                emergencyPhone = profile.emergencyPhone,
                emergencyRelationship = profile.emergencyRelationship,
                passportExpiry = profile.passportExpiry,
                passportCountry = profile.passportCountry,
            )
            _state.update { it.copy(loading = false) }
        }
    }

    fun update(transform: (ProfileForm) -> ProfileForm) {
        _form.update { transform(it).cleared() }
        _state.update { it.copy(formError = null) }
    }

    fun submit() {
        if (_state.value.saving) return
        when (val result = validateProfileForm(_form.value, today)) {
            is ProfileSubmission.Invalid -> _form.value = result.form
            is ProfileSubmission.Valid -> save(OnboardingFunction.PROFILE, result.body)
        }
    }

    private fun save(function: OnboardingFunction, body: JsonObject) {
        _state.update { it.copy(saving = true, formError = null) }
        viewModelScope.launch {
            // NO `advance` KEY. That flag is what moves the onboarding cursor, and this is
            // an account edit — see FormSubmissions.kt.
            when (val result = onboarding.call(function, body)) {
                is OnboardingResult.Ok -> {
                    _state.update { it.copy(saving = false) }
                    _events.send(AccountSaved)
                }
                is OnboardingResult.Rejected -> _state.update {
                    it.copy(
                        saving = false,
                        formError = result.detail ?: OnboardingViewModel.GENERIC_ERROR,
                    )
                }
                // The router watches sessionStatus and will move the stack itself.
                OnboardingResult.Unauthenticated -> _state.update { it.copy(saving = false) }
                OnboardingResult.Unavailable -> _state.update {
                    it.copy(saving = false, formError = OnboardingViewModel.GENERIC_ERROR)
                }
            }
        }
    }
}

/** Screen 2.5.3 — 2.1.11's form and rules, saving without the cursor move. */
class AccountPreferencesViewModel(
    private val account: AccountRepository,
    private val onboarding: OnboardingRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AccountFormState())
    val state: StateFlow<AccountFormState> = _state.asStateFlow()

    private val _form = MutableStateFlow(PreferencesForm())
    val form: StateFlow<PreferencesForm> = _form.asStateFlow()

    private val _events = Channel<AccountSaved>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    init {
        viewModelScope.launch {
            val saved = account.preferences()
            _form.value = PreferencesForm(
                destinations = saved.destinations.toSet(),
                travelStyles = saved.travelStyles.toSet(),
                dietary = saved.dietary.toSet(),
                dietaryNotes = saved.dietaryNotes,
                accessibility = saved.accessibility.toSet(),
                accessibilityNotes = saved.accessibilityNotes,
                // An account with one program on file still gets an empty second slot, so
                // adding another does not require finding the "Add another" button first.
                loyalty = saved.loyalty.ifEmpty { PreferencesForm().loyalty },
                budgetBand = saved.budgetBand,
                favouritePastTrips = saved.favouritePastTrips,
            )
            _state.update { it.copy(loading = false) }
        }
    }

    fun update(transform: (PreferencesForm) -> PreferencesForm) {
        _form.update { transform(it).cleared() }
        _state.update { it.copy(formError = null) }
    }

    fun submit() {
        if (_state.value.saving) return
        when (val result = validatePreferencesForm(_form.value)) {
            is PreferencesSubmission.Invalid -> {
                _form.value = result.form
                if (result.formError != null) {
                    _state.update { it.copy(formError = result.formError) }
                }
            }
            is PreferencesSubmission.Valid -> save(result.body)
        }
    }

    private fun save(body: JsonObject) {
        _state.update { it.copy(saving = true, formError = null) }
        viewModelScope.launch {
            when (val result = onboarding.call(OnboardingFunction.PREFERENCES, body)) {
                is OnboardingResult.Ok -> {
                    _state.update { it.copy(saving = false) }
                    _events.send(AccountSaved)
                }
                is OnboardingResult.Rejected -> _state.update {
                    it.copy(saving = false, formError = result.detail ?: PREFERENCES_SAVE_ERROR)
                }
                OnboardingResult.Unauthenticated -> _state.update { it.copy(saving = false) }
                OnboardingResult.Unavailable -> _state.update {
                    it.copy(saving = false, formError = PREFERENCES_SAVE_ERROR)
                }
            }
        }
    }
}

/**
 * Screen 2.5.7.
 *
 * MFA STATE COMES FROM GoTrue, not from `mfa_device`. That table has never been written:
 * enrolment shipped GoTrue-native in 2.1.6, so a read of the shadow table would say "off"
 * for somebody with a working authenticator. Data-Model §5.1.1 is explicit about not
 * double-implementing what GoTrue owns.
 */
class SecurityViewModel(
    private val account: AccountRepository,
    private val auth: AuthRepository,
) : ViewModel() {

    private val _provider = MutableStateFlow<AuthProviderState>(AuthProviderState.Unknown)
    val provider: StateFlow<AuthProviderState> = _provider.asStateFlow()

    private val _mfaOn = MutableStateFlow(false)
    val mfaOn: StateFlow<Boolean> = _mfaOn.asStateFlow()

    private val _loading = MutableStateFlow(true)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    init {
        viewModelScope.launch {
            _provider.value = account.authProvider()
            _mfaOn.value = auth.verifiedTotpFactorId() != null
            _loading.value = false
        }
    }
}

/** Screen 2.5.8. Read-only: neither Link nor Unlink has a safe path — see the screen. */
class ConnectedAccountsViewModel(
    private val account: AccountRepository,
) : ViewModel() {

    private val _provider = MutableStateFlow<AuthProviderState>(AuthProviderState.Unknown)
    val provider: StateFlow<AuthProviderState> = _provider.asStateFlow()

    private val _loading = MutableStateFlow(true)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    init {
        viewModelScope.launch {
            _provider.value = account.authProvider()
            _loading.value = false
        }
    }
}

/**
 * Screen 2.5.10.
 *
 * Reads the address only to place it in the confirmation field's placeholder. Nothing here
 * writes: no Edge Function touches `account` at all.
 */
class CloseAccountViewModel(
    private val account: AccountRepository,
) : ViewModel() {

    private val _email = MutableStateFlow<String?>(null)
    val email: StateFlow<String?> = _email.asStateFlow()

    init {
        viewModelScope.launch { _email.value = account.accountEmail() }
    }
}
