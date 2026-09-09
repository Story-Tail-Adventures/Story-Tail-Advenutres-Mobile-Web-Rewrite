package com.storytail.adventures.ui.screens.auth

import com.storytail.adventures.api.AuthError
import com.storytail.adventures.api.AuthErrorException
import com.storytail.adventures.api.FakeAuthRepository
import com.storytail.adventures.domain.validation.AuthValidation
import kotlinx.coroutines.Dispatchers
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
import kotlin.test.assertNull

class LoginViewModelTest {

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(StandardTestDispatcher())
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    /**
     * The ViewModel is resolved from the Activity's ViewModelStore, so it outlives the
     * Login route. If it kept the credentials, signing out and returning to Login would
     * re-display the previous user's email and password.
     */
    @Test
    fun clears_credentials_after_a_successful_sign_in() = runTest {
        val vm = LoginViewModel(FakeAuthRepository())
        vm.onEmailChange("jordan.hayes@example.com")
        vm.onPasswordChange("DevPassword!234")

        vm.submit()
        advanceUntilIdle()

        assertEquals("", vm.state.value.email, "email must not survive sign-in")
        assertEquals("", vm.state.value.password, "password must not survive sign-in")
        assertNull(vm.state.value.formError)
    }

    @Test
    fun keeps_the_email_but_reports_the_error_on_a_failed_sign_in() = runTest {
        val repo = FakeAuthRepository(
            signInResult = Result.failure(AuthErrorException(AuthError.InvalidCredentials)),
        )
        val vm = LoginViewModel(repo)
        vm.onEmailChange("jordan.hayes@example.com")
        vm.onPasswordChange("wrong")

        vm.submit()
        advanceUntilIdle()

        assertEquals("jordan.hayes@example.com", vm.state.value.email)
        assertEquals(AuthError.InvalidCredentials, vm.state.value.formError)
        assertFalse(vm.state.value.isSubmitting)
    }

    @Test
    fun does_not_call_the_repository_when_validation_fails() = runTest {
        val repo = FakeAuthRepository()
        val vm = LoginViewModel(repo)
        vm.onEmailChange("not-an-email")
        vm.onPasswordChange("something")

        vm.submit()
        advanceUntilIdle()

        assertNull(repo.lastEmail, "a malformed email must not reach the network")
        assertEquals(AuthValidation.Messages.EMAIL_INVALID, vm.state.value.emailError)
    }
}
