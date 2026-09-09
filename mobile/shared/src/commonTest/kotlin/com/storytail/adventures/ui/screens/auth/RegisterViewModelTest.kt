package com.storytail.adventures.ui.screens.auth

import com.storytail.adventures.api.FakeAuthRepository
import com.storytail.adventures.api.SignUpOutcome
import com.storytail.adventures.domain.validation.AuthValidation
import com.storytail.adventures.domain.validation.RegistrationValidation
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
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Screen 2.1m.2's ViewModel.
 *
 * The twin of web/app/(auth)/register/actions.test.ts, and it pins the same two things that
 * are security bugs rather than bugs: the enumeration-safe uniform outcome, and that
 * nothing but the two validated names reaches the sign-up metadata.
 */
class RegisterViewModelTest {

    @BeforeTest
    fun setUp() = Dispatchers.setMain(StandardTestDispatcher())

    @AfterTest
    fun tearDown() = Dispatchers.resetMain()

    private fun filled(vm: RegisterViewModel) {
        vm.onFirstNameChange(" Jordan ")
        vm.onLastNameChange("Hayes")
        vm.onEmailChange(" jordan.hayes@example.com ")
        vm.onPasswordChange("GreenPastures1")
        vm.onConfirmPasswordChange("GreenPastures1")
        vm.onTermsChange(true)
    }

    @Test
    fun sends_trimmed_names_and_address_to_the_repository() = runTest {
        val auth = FakeAuthRepository()
        val vm = RegisterViewModel(auth)
        filled(vm)

        vm.submit()
        advanceUntilIdle()

        // Trimmed, because `handle_new_user()` writes these straight into `client` and a
        // leading space becomes the traveler's name for as long as nobody notices.
        assertEquals("Jordan" to "Hayes", auth.lastSignUpNames)
        assertEquals("jordan.hayes@example.com", auth.lastEmail)
    }

    @Test
    fun a_taken_address_looks_exactly_like_a_fresh_sign_up() = runTest {
        // The repository maps GoTrue's `user_already_exists` to ConfirmEmail for this
        // reason. Anything here that told the two apart would hand somebody with a list of
        // addresses a way to test which ones are registered.
        val auth = FakeAuthRepository(
            signUpResult = Result.success(
                SignUpOutcome.ConfirmEmail("jordan.hayes@example.com"),
            ),
        )
        val vm = RegisterViewModel(auth)
        filled(vm)

        vm.submit()
        val event = vm.events.first()
        advanceUntilIdle()

        assertEquals(
            RegisterEvent.NavigateToVerifyEmail("jordan.hayes@example.com"),
            event,
        )
        assertNull(vm.state.value.formError)
        assertNull(vm.state.value.emailError)
    }

    @Test
    fun reports_every_bad_field_at_once() = runTest {
        val vm = RegisterViewModel(FakeAuthRepository())
        vm.onFirstNameChange("")
        vm.onLastNameChange("")
        vm.onEmailChange("not-an-email")
        vm.onPasswordChange("short")
        vm.onConfirmPasswordChange("different")

        vm.submit()
        advanceUntilIdle()

        // Six failures, one submit. Making somebody press the button six times to learn six
        // things is the difference between a form and an interrogation.
        val state = vm.state.value
        assertEquals(RegistrationValidation.Messages.NAME_REQUIRED, state.firstNameError)
        assertEquals(RegistrationValidation.Messages.NAME_REQUIRED, state.lastNameError)
        assertEquals(AuthValidation.Messages.EMAIL_INVALID, state.emailError)
        assertNotNull(state.passwordError)
        assertEquals(
            RegistrationValidation.Messages.CONFIRM_MISMATCH,
            state.confirmPasswordError,
        )
        assertEquals(RegistrationValidation.Messages.TERMS_REQUIRED, state.termsError)
    }

    @Test
    fun refuses_to_submit_without_the_terms_box() = runTest {
        val auth = FakeAuthRepository()
        val vm = RegisterViewModel(auth)
        filled(vm)
        vm.onTermsChange(false)

        vm.submit()
        advanceUntilIdle()

        assertNull(auth.lastSignUpNames)
        assertEquals(RegistrationValidation.Messages.TERMS_REQUIRED, vm.state.value.termsError)
    }

    @Test
    fun editing_the_password_clears_the_confirmation_error_too() = runTest {
        val vm = RegisterViewModel(FakeAuthRepository())
        filled(vm)
        vm.onConfirmPasswordChange("mismatch")
        vm.submit()
        advanceUntilIdle()
        assertNotNull(vm.state.value.confirmPasswordError)

        // The mismatch was about a password that no longer exists; leaving the error up
        // marks a field the person has not touched.
        vm.onPasswordChange("GreenPastures12")

        assertNull(vm.state.value.confirmPasswordError)
    }

    @Test
    fun forgets_the_password_once_the_account_is_made() = runTest {
        // This ViewModel is resolved from the Activity's store and outlives the screen, so
        // keeping the state leaves a plaintext password in memory — and re-fills the whole
        // form for whoever reaches Register next, which after "Change email" is the same
        // person but is not guaranteed to be.
        val vm = RegisterViewModel(FakeAuthRepository())
        filled(vm)

        vm.submit()
        advanceUntilIdle()

        assertEquals("", vm.state.value.password)
        assertEquals("", vm.state.value.confirmPassword)
        assertEquals("", vm.state.value.email)
        assertEquals(false, vm.state.value.termsAccepted)
    }

    @Test
    fun a_failed_sign_up_stops_submitting_and_says_why() = runTest {
        val auth = FakeAuthRepository(
            signUpResult = Result.failure(IllegalStateException("boom")),
        )
        val vm = RegisterViewModel(auth)
        filled(vm)

        vm.submit()
        advanceUntilIdle()

        assertNotNull(vm.state.value.formError)
        assertEquals(false, vm.state.value.isSubmitting)
    }
}
