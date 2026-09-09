package com.storytail.adventures.ui.screens.auth

import com.storytail.adventures.api.FakeAuthRepository
import com.storytail.adventures.api.TotpEnrollment
import com.storytail.adventures.domain.validation.MfaValidation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Screens 2.1m.6 and 2.1m.7.
 *
 * One file for the pair because they share a rule and a hazard: the code is normalised as it
 * is typed, and the enrolment secret must not outlive the screen.
 */
class MfaViewModelTest {

    @BeforeTest
    fun setUp() = Dispatchers.setMain(StandardTestDispatcher())

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    // ── 2.1m.6 Setup ──────────────────────────────────────────────────────────

    @Test
    fun enrols_as_soon_as_the_screen_opens() = runTest {
        // The secret IS the screen, so waiting for a button press would mean showing an
        // empty frame and asking somebody to ask for it.
        val vm = MfaSetupViewModel(FakeAuthRepository())
        advanceUntilIdle()

        assertNotNull(vm.state.value.enrollment)
        assertFalse(vm.state.value.isEnrolling)
    }

    @Test
    fun a_failed_enrolment_offers_a_retry_rather_than_an_empty_frame() = runTest {
        val auth = FakeAuthRepository(enrollResult = Result.failure(IllegalStateException()))
        val vm = MfaSetupViewModel(auth)
        advanceUntilIdle()

        assertNull(vm.state.value.enrollment)
        assertNotNull(vm.state.value.formError)
        assertFalse(vm.state.value.isEnrolling)

        auth.enrollResult = Result.success(
            TotpEnrollment("factor-2", "svg", "SECRET", "otpauth://totp/x"),
        )
        vm.enroll()
        advanceUntilIdle()

        assertEquals("factor-2", vm.state.value.enrollment?.factorId)
    }

    @Test
    fun strips_the_spaces_authenticator_apps_display() = runTest {
        // Apps show "483 921"; that space comes along on paste.
        val vm = MfaSetupViewModel(FakeAuthRepository())
        advanceUntilIdle()

        vm.onCodeChange("483 921")

        assertEquals("483921", vm.state.value.code)
    }

    @Test
    fun never_holds_more_digits_than_the_code_has() = runTest {
        val vm = MfaSetupViewModel(FakeAuthRepository())
        advanceUntilIdle()

        vm.onCodeChange("1234567890")

        assertEquals(MfaValidation.CODE_LENGTH, vm.state.value.code.length)
    }

    @Test
    fun verifies_against_the_factor_it_enrolled() = runTest {
        val auth = FakeAuthRepository()
        val vm = MfaSetupViewModel(auth)
        advanceUntilIdle()
        vm.onCodeChange("483921")

        vm.verify()
        val event = vm.events.first()
        advanceUntilIdle()

        assertEquals("factor-1" to "483921", auth.lastVerifiedCode)
        assertEquals(MfaSetupEvent.Done, event)
    }

    @Test
    fun forgets_the_secret_once_the_factor_is_on() = runTest {
        // The secret is a credential and this ViewModel outlives the screen that made it.
        val vm = MfaSetupViewModel(FakeAuthRepository())
        advanceUntilIdle()
        vm.onCodeChange("483921")

        vm.verify()
        advanceUntilIdle()

        assertNull(vm.state.value.enrollment)
        assertEquals("", vm.state.value.code)
    }

    @Test
    fun refuses_a_short_code_without_calling_the_server() = runTest {
        val auth = FakeAuthRepository()
        val vm = MfaSetupViewModel(auth)
        advanceUntilIdle()
        vm.onCodeChange("48")

        vm.verify()
        advanceUntilIdle()

        assertNull(auth.lastVerifiedCode)
        assertEquals(MfaValidation.Messages.CODE_SHAPE, vm.state.value.codeError)
    }

    // ── 2.1m.7 Challenge ──────────────────────────────────────────────────────

    @Test
    fun answers_the_factor_already_on_the_account() = runTest {
        val auth = FakeAuthRepository(verifiedFactorId = "factor-9")
        val vm = MfaChallengeViewModel(auth)
        advanceUntilIdle()
        vm.onCodeChange("483921")

        vm.verify()
        advanceUntilIdle()

        assertEquals("factor-9" to "483921", auth.lastVerifiedCode)
    }

    @Test
    fun says_so_when_there_is_no_factor_to_answer() = runTest {
        // The router should make this unreachable. "Should" is not "does", and a form that
        // cannot be submitted explains nothing.
        val vm = MfaChallengeViewModel(FakeAuthRepository(verifiedFactorId = null))
        advanceUntilIdle()

        assertNull(vm.state.value.factorId)
        assertFalse(vm.state.value.isResolving)
    }

    @Test
    fun clears_a_rejected_code_because_it_has_already_expired() = runTest {
        // Six digits are good for thirty seconds, so by the time the server says no the code
        // in the boxes cannot work. Leaving it invites a second press that cannot succeed.
        val auth = FakeAuthRepository(
            verifiedFactorId = "factor-9",
            verifyTotpResult = Result.failure(IllegalStateException()),
        )
        val vm = MfaChallengeViewModel(auth)
        advanceUntilIdle()
        vm.onCodeChange("483921")

        vm.verify()
        advanceUntilIdle()

        assertEquals("", vm.state.value.code)
        assertNotNull(vm.state.value.formError)
    }

    @Test
    fun signing_out_is_the_way_out_for_somebody_who_cannot_produce_a_code() = runTest {
        val auth = FakeAuthRepository(verifiedFactorId = "factor-9")
        val vm = MfaChallengeViewModel(auth)
        advanceUntilIdle()

        vm.onSignOut()
        val event = vm.events.first()
        advanceUntilIdle()

        assertEquals(1, auth.signOutCount)
        assertEquals(MfaChallengeEvent.SignedOut, event)
    }
}
